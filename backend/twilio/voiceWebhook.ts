/**
 * TwiML response: connect call to Media Stream WebSocket.
 * Twilio streams audio to wss://BASE_URL/media?callSid=... so we can look up context.
 */

export function voiceWebhook(baseUrl: string, callSid: string): string {
  const wsScheme = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const streamUrl = `${wsScheme}://${host}/media${callSid ? `?callSid=${encodeURIComponent(callSid)}` : ''}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
}
