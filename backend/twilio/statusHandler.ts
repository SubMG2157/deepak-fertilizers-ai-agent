/**
 * Twilio status callback handler.
 * - busy / no-answer: schedule retry (max 2, +30 min) — compliant: no retry on DND/opt-out.
 * - completed: finalize call log.
 */

import { broadcastUiSync } from './mediaStream.js';
import { appendCallLog } from '../logs/callLog.js';

const RETRY_AFTER_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 2;

export function handleTwilioStatus(body: Record<string, string>) {
  const { CallSid, CallStatus } = body;
  broadcastUiSync({ type: 'CALL_STATUS', callId: CallSid, status: mapStatus(CallStatus) });

  if (CallStatus === 'completed') {
    const duration = body.CallDuration ? parseInt(body.CallDuration, 10) : 0;
    appendCallLog({
      callId: CallSid,
      status: 'completed',
      durationSec: duration,
      ...body,
    });
  }

  // Optional: schedule retry on busy/no-answer (would need job queue; placeholder here)
  if (CallStatus === 'busy' || CallStatus === 'no-answer') {
    appendCallLog({
      callId: CallSid,
      status: CallStatus,
      note: 'Retry eligible (max 2, +30 min) — implement with job queue if needed',
    });
  }
}

function mapStatus(twilioStatus: string): string {
  const m: Record<string, string> = {
    queued: 'DIALING',
    ringing: 'RINGING',
    'in-progress': 'IN_PROGRESS',
    completed: 'ENDED',
    busy: 'FAILED',
    'no-answer': 'FAILED',
    failed: 'FAILED',
    canceled: 'ENDED',
  };
  return m[twilioStatus] ?? twilioStatus;
}
