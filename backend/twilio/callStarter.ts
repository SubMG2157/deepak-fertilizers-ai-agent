/**
 * Start outbound Twilio call for Deepak Fertilisers farmer agent.
 * Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER.
 * statusCallback: retry/busy/no-answer handling.
 * (Read env inside startCall so values are set after dotenv runs in server.ts.)
 */

import twilio from 'twilio';

export interface CallContext {
  customerName: string;
  lastProduct: string;
  language: string;
  /** Agent persona: 'female' = Ankita, 'male' = Omkar. Affects voice + name + verb forms. */
  agentGender?: 'female' | 'male';
}

export async function startCall(phone: string, context: CallContext) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_NUMBER;
  const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3001';

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER required');
  }
  const client = twilio(accountSid, authToken);
  const voiceUrl = `${baseUrl}/twilio/voice`;
  const statusCallback = `${baseUrl}/twilio/status`;
  const call = await client.calls.create({
    to: phone,
    from: fromNumber,
    url: voiceUrl,
    statusCallback,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    timeout: 30,
    record: false,
  });
  return call;
}

/** End the call from the server (agent hangs up). Used when conversation is closed. */
export async function hangUpCall(callSid: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return;
  const client = twilio(accountSid, authToken);
  await client.calls(callSid).update({ status: 'completed' });
}
