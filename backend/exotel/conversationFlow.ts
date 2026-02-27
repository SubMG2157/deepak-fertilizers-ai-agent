// backend/exotel/conversationFlow.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { getSystemInstruction } from '../../services/conversationEngine/index.js';
import { generateTTS } from '../services/tts/ttsService';
import { uploadAudio } from '../services/audioStorage';
import { saveOrder } from '../orders/orderStore';
import { sendOrderSms } from '../services/smsService';
import { extractOrderFromTranscript } from './orderExtractor';

// Session storage for conversation state
interface ConversationState {
  callSid: string;
  customerName: string;
  customerPhone: string;
  language: string;
  agentGender: string;
  lastProduct: string;
  transcript: Array<{ role: 'user' | 'agent'; text: string }>;
  conversationHistory: Array<{ role: string; parts: any[] }>;
  items: Map<string, number>; // product -> quantity
  orderLocked: boolean;
  stage: string;
}

const conversationSessions = new Map<string, ConversationState>();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Initialize new conversation session
 */
export function initializeSession(
  callSid: string,
  customerName: string,
  customerPhone: string,
  language: string = 'Marathi',
  agentGender: string = 'female',
  lastProduct: string = 'NPK 19-19-19'
): void {
  conversationSessions.set(callSid, {
    callSid,
    customerName,
    customerPhone,
    language,
    agentGender,
    lastProduct,
    transcript: [],
    conversationHistory: [],
    items: new Map(),
    orderLocked: false,
    stage: 'greeting'
  });

  console.log(`📞 Session initialized for ${customerName} (${callSid})`);
}

/**
 * Process audio chunk from Exotel
 */
export async function processAudioChunk(
  callSid: string,
  recordingUrl: string
): Promise<string> {
  const session = conversationSessions.get(callSid);

  if (!session) {
    console.error('❌ No session found for callSid:', callSid);
    // Return default error response
    return await generateAndUploadTTS(
      'माफ करा, तांत्रिक समस्या आली आहे. कृपया पुन्हा कॉल करा.',
      'error'
    );
  }

  try {
    // Step 1: Download audio from Exotel
    console.log('⬇️ Downloading audio from:', recordingUrl);
    const audioBuffer = await downloadRecording(recordingUrl);

    // Step 2: Transcribe with Gemini
    console.log('🎤 Transcribing audio...');
    const userText = await transcribeAudio(audioBuffer, session);

    if (!userText || userText.trim() === '') {
      console.log('⚠️ Empty transcription, asking user to repeat');
      return await generateAndUploadTTS(
        session.language === 'Marathi' ? 'कृपया पुन्हा सांगा?' : 'Please repeat?',
        callSid
      );
    }

    // Add to transcript
    session.transcript.push({ role: 'user', text: userText });
    console.log(`👤 User: ${userText}`);

    // Step 3: Extract order information (if any)
    if (!session.orderLocked) {
      extractOrderFromTranscript(userText, session);
    }

    // Step 4: Generate response with Gemini
    console.log('🤖 Generating AI response...');
    const agentResponse = await generateResponse(session, userText);

    // Add to transcript
    session.transcript.push({ role: 'agent', text: agentResponse });
    console.log(`🤖 Agent: ${agentResponse}`);

    // Step 5: Check if order should be sent
    await checkAndSendOrder(session, agentResponse);

    // Step 6: Generate TTS and upload
    console.log('🔊 Generating TTS...');
    const audioUrl = await generateAndUploadTTS(agentResponse, callSid);

    // Step 7: Check if conversation should end
    if (shouldEndConversation(agentResponse)) {
      console.log('👋 Conversation ending...');
      // Will hangup after audio plays
      setTimeout(() => {
        conversationSessions.delete(callSid);
      }, 5000);
    }

    return audioUrl;
  } catch (error: any) {
    console.error('❌ Error processing audio:', error.message);

    // Return error message in user's language
    const errorMsg = session.language === 'Marathi'
      ? 'माफ करा, तांत्रिक समस्या आली. कृपया पुन्हा प्रयत्न करा.'
      : 'Sorry, technical issue. Please try again.';

    return await generateAndUploadTTS(errorMsg, callSid);
  }
}

/**
 * Download recording from Exotel URL
 */
async function downloadRecording(url: string): Promise<Buffer> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });
    return Buffer.from(response.data);
  } catch (error: any) {
    console.error('❌ Failed to download recording:', error.message);
    throw new Error('Failed to download recording');
  }
}

/**
 * Transcribe audio using Gemini
 */
async function transcribeAudio(audioBuffer: Buffer, session: ConversationState): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: audioBuffer.toString('base64')
        }
      },
      { text: `Transcribe this audio in ${session.language}. Return ONLY the transcribed text, nothing else.` }
    ]);

    const text = result.response.text().trim();
    return text;
  } catch (error: any) {
    console.error('❌ Transcription failed:', error.message);
    return '';
  }
}

/**
 * Generate AI response using Gemini
 */
async function generateResponse(session: ConversationState, userText: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: getSystemInstruction(
        session.language as any,
        session.customerName,
        session.lastProduct,
        session.agentGender as any
      )
    });

    // Add user message to history
    session.conversationHistory.push({
      role: 'user',
      parts: [{ text: userText }]
    });

    // Generate response
    const chat = model.startChat({
      history: session.conversationHistory.slice(0, -1), // All except last message
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200, // Keep responses concise
      }
    });

    const result = await chat.sendMessage(userText);
    const responseText = result.response.text().trim();

    // Add agent response to history
    session.conversationHistory.push({
      role: 'model',
      parts: [{ text: responseText }]
    });

    return responseText;
  } catch (error: any) {
    console.error('❌ Gemini response generation failed:', error.message);
    return session.language === 'Marathi'
      ? 'माफ करा, मला समजलं नाही. कृपया पुन्हा सांगा?'
      : 'Sorry, I did not understand. Please repeat?';
  }
}

/**
 * Generate TTS and upload to accessible URL
 */
async function generateAndUploadTTS(text: string, identifier: string): Promise<string> {
  try {
    // Generate TTS audio
    const audioBuffer = await generateTTS(text);

    // Upload and get public URL
    const audioUrl = await uploadAudio(audioBuffer, identifier);

    return audioUrl;
  } catch (error: any) {
    console.error('❌ TTS generation/upload failed:', error.message);
    throw error;
  }
}

/**
 * Check if order should be sent
 */
async function checkAndSendOrder(session: ConversationState, agentResponse: string): Promise<void> {
  // Detect SMS trigger phrases
  const smsTriggers = [
    'एसएमएस पाठवतो',
    'एसएमएस पाठवत',
    'sms पाठवतो',
    'मेसेज पाठवतो',
    'पेमेंट लिंक',
    'payment link'
  ];

  const shouldSendSMS = smsTriggers.some(trigger =>
    agentResponse.toLowerCase().includes(trigger.toLowerCase())
  );

  if (shouldSendSMS && !session.orderLocked && session.items.size > 0) {
    console.log('📧 SMS trigger detected, sending order...');

    // Lock the order
    session.orderLocked = true;

    try {
      // Convert items Map to array
      const items = Array.from(session.items.entries()).map(([product, quantity]) => ({
        product,
        quantity,
        price: 0 // Will be calculated by orderStore
      }));

      // Save order
      const order = await saveOrder({
        customerName: session.customerName,
        phone: session.customerPhone,
        items,
        totalAmount: 0,
        paymentStatus: 'pending',
        address: '', // Extract from transcript if available
        village: '',
        taluka: '',
        pincode: ''
      });

      console.log('✅ Order saved:', order.orderId);

      // Send SMS
      await sendOrderSms(
        session.customerPhone,
        session.customerName,
        order.items,
        order.orderId
      );

      console.log('✅ Order SMS sent');
    } catch (error: any) {
      console.error('❌ Failed to send order:', error.message);
    }
  }
}

/**
 * Check if conversation should end
 */
function shouldEndConversation(text: string): boolean {
  const endPhrases = [
    'धन्यवाद',
    'शुभ दिवस',
    'बाय',
    'goodbye',
    'पुन्हा भेटू',
    'काळजी घ्या'
  ];

  return endPhrases.some(phrase => text.toLowerCase().includes(phrase.toLowerCase()));
}

/**
 * Get session (for external access)
 */
export function getSession(callSid: string): ConversationState | undefined {
  return conversationSessions.get(callSid);
}

/**
 * Clean up session
 */
export function cleanupSession(callSid: string): void {
  conversationSessions.delete(callSid);
  console.log(`🧹 Session cleaned up: ${callSid}`);
}
