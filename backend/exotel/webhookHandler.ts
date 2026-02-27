// backend/exotel/webhookHandler.ts
// COMPLETE CORRECTED VERSION - hold.wav + Say tags for all responses

import { Request, Response } from 'express';
import { initializeSession, processAudioChunk, getSession, cleanupSession } from './conversationFlow';

/**
 * Handle initial call connection from Exotel
 */
export async function handleVoiceWebhook(req: Request, res: Response): Promise<void> {
    const CallSid = req.body.CallSid || req.query.CallSid;
    const From = req.body.From || req.query.From;
    const To = req.body.To || req.query.To;

    console.log('🔥 /exotel/voice webhook hit');
    console.log('📞 Incoming call from Exotel:', { CallSid, From, To });

    try {
        const redirectXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${process.env.BACKEND_BASE_URL}/exotel/gather</Redirect>
</Response>`;

        res.set('Content-Type', 'text/xml');
        res.send(redirectXml);
    } catch (error: any) {
        console.error('❌ Voice webhook error:', error.message);
        res.set('Content-Type', 'text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">माफ करा, काही तांत्रिक अडचण आली आहे</Say>
  <Hangup/>
</Response>`);
    }
}

/**
 * Handle the continuous Exotel Gather loop
 */
export async function handleGatherWebhook(req: Request, res: Response): Promise<void> {
    const CallSid = req.body?.CallSid || req.query?.CallSid;
    const RecordingUrl = req.body?.RecordingUrl || req.query?.RecordingUrl;
    const RecordingDuration = req.body?.RecordingDuration || req.query?.RecordingDuration;
    const From = req.body?.From || req.query?.From;
    const To = req.body?.To || req.query?.To;

    console.log('🎙️ Gather webhook hit:', {
        CallSid,
        From,
        To,
        HasRecording: !!RecordingUrl,
        Duration: RecordingDuration
    });

    try {
        // Get or create session
        let session = getSession(CallSid);
        if (!session) {
            const context = getCallContext(CallSid);
            initializeSession(
                CallSid,
                context?.customerName || 'शेतकरी',
                From,
                context?.language || 'Marathi',
                context?.agentGender || 'female',
                context?.lastProduct || 'NPK 19-19-19'
            );
            session = getSession(CallSid);
            console.log(`📞 New session: ${session?.customerName} (${CallSid})`);
        }

        let responseText = '';
        let shouldEnd = false;

        // Check if this is first interaction or user response
        if (!RecordingUrl || parseInt(RecordingDuration || '0') === 0) {
            // FIRST INTERACTION - Play hold.wav + greeting
            console.log('🎵 First interaction - hold music + greeting');

            const customerName = session?.customerName || 'शेतकरी';
            responseText = session?.language === 'Marathi'
                ? `नमस्कार ${customerName} जी, मी दीपक फर्टिलायझर्सकडून बोलतोय। तुम्हाला दोन मिनिटं बोलता येईल का?`
                : `Hello ${customerName}, this is Deepak Fertilizers. Can you speak for two minutes?`;

            const safeText = escapeXml(responseText);

            const greetingXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${process.env.BACKEND_BASE_URL}/audio/hold.wav</Play>
  <Gather action="${process.env.BACKEND_BASE_URL}/exotel/gather" method="POST" timeout="5" finishOnKey="#">
    <Say voice="Polly.Aditi" language="hi-IN">${safeText}</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="hi-IN">माफ करा, तुम्ची प्रतिक्रिया ऐकली नाही</Say>
  <Redirect>${process.env.BACKEND_BASE_URL}/exotel/gather</Redirect>
</Response>`;

            console.log('📤 Sending: hold.wav + greeting');
            res.set('Content-Type', 'text/xml');
            res.send(greetingXml);
            return;
        }

        // USER SPOKE - Process their recording
        console.log('🎤 User spoke - processing');

        try {
            // Process audio with Gemini (transcription + AI response)
            await processAudioChunk(CallSid, RecordingUrl);

            // Get the response from session transcript
            session = getSession(CallSid);

            if (!session) {
                // Session cleaned up - conversation ended
                shouldEnd = true;
                responseText = 'धन्यवाद!';
            } else if (session.transcript && session.transcript.length > 0) {
                // Get last agent response from transcript
                const agentMessages = session.transcript.filter((t: any) => t.role === 'agent');
                const lastMessage = agentMessages[agentMessages.length - 1];
                responseText = lastMessage?.text || 'हो, बोला';

                // Check if should end
                shouldEnd = checkEndPhrases(responseText);
            } else {
                responseText = 'हो, बोला';
            }

        } catch (error: any) {
            console.error('❌ Error processing:', error.message);
            responseText = 'माफ करा, मला काही समजलं नाही. कृपया पुन्हा सांगा.';
        }

        // Escape XML
        const safeText = escapeXml(responseText);

        // Build response
        if (shouldEnd) {
            // End call
            const hangupXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">${safeText}</Say>
  <Hangup/>
</Response>`;

            console.log('🏁 Ending call');
            res.set('Content-Type', 'text/xml');
            res.send(hangupXml);

            setTimeout(() => cleanupSession(CallSid), 5000);

        } else {
            // Continue conversation
            const continueXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${process.env.BACKEND_BASE_URL}/exotel/gather" method="POST" timeout="5" finishOnKey="#">
    <Say voice="Polly.Aditi" language="hi-IN">${safeText}</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="hi-IN">माफ करा, तुम्ची प्रतिक्रिया ऐकली नाही</Say>
  <Redirect>${process.env.BACKEND_BASE_URL}/exotel/gather</Redirect>
</Response>`;

            console.log('📤 Response:', responseText.substring(0, 60) + '...');
            res.set('Content-Type', 'text/xml');
            res.send(continueXml);
        }

    } catch (error: any) {
        console.error('❌ Gather error:', error.message);
        res.set('Content-Type', 'text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">माफ करा, काही तांत्रिक अडचण आली आहे</Say>
  <Hangup/>
</Response>`);
    }
}

/**
 * Check if text contains end phrases
 */
function checkEndPhrases(text: string): boolean {
    const endPhrases = [
        'धन्यवाद',
        'शुभ दिवस',
        'बाय',
        'goodbye',
        'पुन्हा भेटू',
        'काळजी घ्या'
    ];

    return endPhrases.some(phrase =>
        text.toLowerCase().includes(phrase.toLowerCase())
    );
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Handle call status updates
 */
export async function handleStatusCallback(req: Request, res: Response): Promise<void> {
    const CallSid = req.body.CallSid || req.query.CallSid;
    const Status = req.body.Status || req.query.Status || req.body.CallStatus || req.query.CallStatus;
    const Duration = req.body.Duration || req.query.Duration || req.body.CallDuration || req.query.CallDuration;

    console.log('📊 Call status:', { CallSid, Status, Duration });

    if ((global as any).uiWebSocket) {
        (global as any).uiWebSocket.send(JSON.stringify({
            type: 'callStatus',
            callSid: CallSid,
            status: Status,
            duration: Duration
        }));
    }

    if (Status === 'completed' || Status === 'failed') {
        cleanupSession(CallSid);
        console.log(`👋 Call ended: ${CallSid}`);
    }

    res.sendStatus(200);
}

/**
 * Handle SMS status callback
 */
export async function handleSMSStatusCallback(req: Request, res: Response): Promise<void> {
    const { SmsSid, SmsStatus, To } = req.body;
    console.log('📧 SMS status:', { SmsSid, SmsStatus, To });
    res.sendStatus(200);
}

/**
 * Force hangup
 */
export async function handleHangup(req: Request, res: Response): Promise<void> {
    const CallSid = req.body.CallSid || req.query.CallSid;
    console.log('📴 Hangup:', CallSid);

    if (CallSid) {
        cleanupSession(CallSid);
    }

    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
}

// Call context storage
const callContexts = new Map<string, any>();

export function setCallContext(callSid: string, context: any): void {
    callContexts.set(callSid, context);
}

export function getCallContext(callSid: string): any {
    return callContexts.get(callSid);
}

export function clearCallContext(callSid: string): void {
    callContexts.delete(callSid);
}

// Legacy - not used in Gather flow
export async function handleRecordingCallback(req: Request, res: Response): Promise<void> {
    console.log('⚠️ Legacy recording callback - not used');
    res.sendStatus(200);
}
