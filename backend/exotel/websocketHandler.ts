// backend/exotel/websocketHandler.ts
import { WebSocket } from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface ExotelMessage {
    event: 'connected' | 'start' | 'media' | 'stop' | 'dtmf' | 'clear';
    streamSid?: string;
    callSid?: string;
    media?: { payload?: string };
    start?: {
        streamSid?: string;
        callSid?: string;
        customParameters?: Record<string, string>;
    };
    dtmf?: { digit?: string };
}

interface Session {
    callSid: string;
    streamSid: string;
    customerName: string;
    audioBuffer: Buffer[];
    isProcessing: boolean;
}

const sessions = new Map<string, Session>();

export function handleExotelWebSocket(ws: WebSocket, request: any): void {
    console.log('🔌 Exotel WebSocket connected');

    let currentSession: Session | null = null;

    ws.on('message', async (data: Buffer) => {
        try {
            const msg: ExotelMessage = JSON.parse(data.toString());

            switch (msg.event) {
                case 'connected':
                    console.log('✅ WebSocket connected');
                    break;
                case 'start':
                    currentSession = await handleStart(ws, msg);
                    break;
                case 'media':
                    if (currentSession) await handleMedia(ws, msg, currentSession);
                    break;
                case 'dtmf':
                    if (msg.dtmf?.digit === '0') ws.close();
                    break;
                case 'stop':
                    if (currentSession) sessions.delete(currentSession.callSid);
                    ws.close();
                    break;
                case 'clear':
                    if (currentSession) {
                        currentSession.audioBuffer = [];
                        await sendGreeting(ws, currentSession);
                    }
                    break;
            }
        } catch (err: any) {
            console.error('❌ WebSocket error:', err.message);
        }
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket closed');
        if (currentSession) sessions.delete(currentSession.callSid);
    });
}

async function handleStart(ws: WebSocket, msg: ExotelMessage): Promise<Session> {
    const callSid = msg.start?.callSid || 'unknown';
    const streamSid = msg.start?.streamSid || 'unknown';
    const customerName = msg.start?.customParameters?.customerName || 'शेतकरी';

    console.log('🎬 Stream started:', callSid);

    const session: Session = {
        callSid,
        streamSid,
        customerName,
        audioBuffer: [],
        isProcessing: false
    };

    sessions.set(callSid, session);
    await sendGreeting(ws, session);
    return session;
}

async function handleMedia(ws: WebSocket, msg: ExotelMessage, session: Session): Promise<void> {
    if (!msg.media?.payload) return;

    const audioChunk = Buffer.from(msg.media.payload, 'base64');
    session.audioBuffer.push(audioChunk);

    if (session.audioBuffer.length >= 20 && !session.isProcessing) {
        session.isProcessing = true;

        try {
            const audio = Buffer.concat(session.audioBuffer);
            session.audioBuffer = [];

            console.log('🎤 Processing audio:', audio.length, 'bytes');

            const transcript = await transcribeAudio(audio);

            if (transcript?.trim()) {
                console.log('📝 User said:', transcript);

                if ['धन्यवाद', 'बाय', 'ठीक'].some(p => transcript.toLowerCase().includes(p))) {
                    await sendTextAsAudio(ws, session, 'धन्यवाद! शुभ दिवस!');
                    ws.close();
                    return;
                }

                const response = await getGeminiResponse(transcript, session);
                console.log('🤖 Bot says:', response);

                await sendTextAsAudio(ws, session, response);
            }
        } catch (err: any) {
            console.error('❌ Processing error:', err.message);
            await sendTextAsAudio(ws, session, 'माफ करा, पुन्हा सांगा.');
        } finally {
            session.isProcessing = false;
        }
    }
}

async function transcribeAudio(audio: Buffer): Promise<string> {
    const { SpeechClient } = require('@google-cloud/speech');
    const client = new SpeechClient();

    const [response] = await client.recognize({
        audio: { content: audio.toString('base64') },
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 8000,
            languageCode: 'mr-IN',
            audioChannelCount: 1,
        },
    });

    return response.results
        .map((r: any) => r.alternatives[0].transcript)
        .join(' ');
}

async function getGeminiResponse(transcript: string, session: Session): Promise<string> {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `तुम्ही दीपक फर्टिलायझर्सचे विक्री प्रतिनिधी आहात.
ग्राहक: ${session.customerName}

संक्षिप्त मराठीत उत्तर द्या (1-2 वाक्ये).
पीक विचारा, योग्य खत सुचवा (NPK, DAP, Urea), ऑर्डर घ्या.

User: ${transcript}
Response (मराठीत):`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

async function sendTextAsAudio(ws: WebSocket, session: Session, text: string): Promise<void> {
    const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
    const client = new TextToSpeechClient();

    const [response] = await client.synthesizeSpeech({
        input: { text },
        voice: { languageCode: 'mr-IN', name: 'mr-IN-Standard-A' },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 8000 },
    });

    const audio = Buffer.from(response.audioContent as Uint8Array);
    const base64 = audio.toString('base64');
    const chunkSize = 3200;
    let seq = 0;

    for (let i = 0; i < base64.length; i += chunkSize) {
        ws.send(JSON.stringify({
            event: 'media',
            streamSid: session.streamSid,
            sequenceNumber: String(seq++),
            media: { payload: base64.slice(i, Math.min(i + chunkSize, base64.length)) }
        }));
        await new Promise(r => setTimeout(r, 20));
    }

    console.log('📤 Sent', seq, 'audio chunks');
}

async function sendGreeting(ws: WebSocket, session: Session): Promise<void> {
    const text = `नमस्कार ${session.customerName} जी, मी दीपक फर्टिलायझर्सकडून बोलतोय। तुम्हाला दोन मिनिटं बोलता येईल का?`;
    await sendTextAsAudio(ws, session, text);
}
