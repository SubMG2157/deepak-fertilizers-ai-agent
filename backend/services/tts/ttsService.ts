// backend/services/tts/ttsService.ts
import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

// Initialize TTS client
const ttsClient = new textToSpeech.TextToSpeechClient({
  apiKey: process.env.GEMINI_API_KEY // Google Cloud uses same API key
});

/**
 * Generate audio from text using Google Cloud TTS
 */
export async function generateTTS(
  text: string,
  languageCode: string = 'mr-IN', // Marathi-India
  voiceGender: 'male' | 'female' = 'female'
): Promise<Buffer> {
  try {
    console.log(`🔊 Generating TTS for: "${text.substring(0, 50)}..."`);

    // Configure TTS request
    const request = {
      input: { text },
      voice: {
        languageCode,
        name: voiceGender === 'female' ? 'mr-IN-Standard-A' : 'mr-IN-Standard-B',
        ssmlGender: voiceGender === 'female' 
          ? 'FEMALE' as const
          : 'MALE' as const
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0
      }
    };

    // Generate TTS
    const [response] = await ttsClient.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content received from TTS service');
    }

    console.log('✅ TTS generated successfully');
    return Buffer.from(response.audioContent);
  } catch (error: any) {
    console.error('❌ TTS generation failed:', error.message);
    
    // Fallback: Generate silence or error tone
    return generateSilence(2); // 2 seconds of silence
  }
}

/**
 * Generate TTS for multiple languages
 */
export async function generateMultilingualTTS(
  text: string,
  language: 'Marathi' | 'Hindi' | 'English' = 'Marathi',
  gender: 'male' | 'female' = 'female'
): Promise<Buffer> {
  const languageMap: Record<string, string> = {
    'Marathi': 'mr-IN',
    'Hindi': 'hi-IN',
    'English': 'en-IN'
  };

  const voiceNameMap: Record<string, Record<string, string>> = {
    'mr-IN': {
      'female': 'mr-IN-Standard-A',
      'male': 'mr-IN-Standard-B'
    },
    'hi-IN': {
      'female': 'hi-IN-Standard-A',
      'male': 'hi-IN-Standard-B'
    },
    'en-IN': {
      'female': 'en-IN-Standard-A',
      'male': 'en-IN-Standard-B'
    }
  };

  const languageCode = languageMap[language];
  const voiceName = voiceNameMap[languageCode][gender];

  const request = {
    input: { text },
    voice: {
      languageCode,
      name: voiceName,
      ssmlGender: gender === 'female' ? 'FEMALE' as const : 'MALE' as const
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: 1.0,
      pitch: 0.0,
      volumeGainDb: 0.0
    }
  };

  try {
    const [response] = await ttsClient.synthesizeSpeech(request);
    if (!response.audioContent) {
      throw new Error('No audio content');
    }
    return Buffer.from(response.audioContent);
  } catch (error: any) {
    console.error(`❌ TTS failed for ${language}:`, error.message);
    return generateSilence(2);
  }
}

/**
 * Generate silence (fallback)
 */
function generateSilence(durationSeconds: number): Buffer {
  // Generate a minimal MP3 file with silence
  // This is a simplified version - in production, use a proper audio library
  const sampleRate = 8000;
  const samples = sampleRate * durationSeconds;
  const silentBuffer = Buffer.alloc(samples);
  return silentBuffer;
}

/**
 * Save TTS audio to file (for debugging)
 */
export async function saveTTSToFile(
  audioBuffer: Buffer,
  filename: string
): Promise<string> {
  const outputPath = path.join(process.cwd(), 'backend', 'audio', 'temp', filename);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Save file
  await fs.writeFile(outputPath, audioBuffer);
  
  console.log(`💾 TTS saved to: ${outputPath}`);
  return outputPath;
}

/**
 * Batch generate TTS for multiple phrases (optimization)
 */
export async function batchGenerateTTS(
  phrases: Array<{ text: string; id: string }>,
  language: string = 'mr-IN',
  gender: 'male' | 'female' = 'female'
): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>();

  // Process in parallel (max 5 at a time to avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < phrases.length; i += batchSize) {
    const batch = phrases.slice(i, i + batchSize);
    
    const promises = batch.map(async ({ text, id }) => {
      const audio = await generateTTS(text, language, gender);
      results.set(id, audio);
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Validate TTS configuration
 */
export function validateTTSConfig(): boolean {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not configured for TTS');
    return false;
  }
  return true;
}
