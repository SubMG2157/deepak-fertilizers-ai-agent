// backend/exotel/callStarter.ts
// CORRECTED VERSION - Uses direct webhook URL instead of Gather applet

import axios from 'axios';
import { setCallContext } from './webhookHandler';

interface StartCallOptions {
  phone: string;
  name?: string;
  lastProduct?: string;
  language?: string;
  agentGender?: string;
}

/**
 * Initiate outbound call via Exotel
 * CRITICAL FIX: Uses webhook URL directly, NOT the Gather applet
 */
export async function startExotelCall(options: StartCallOptions): Promise<string> {
  const { phone, name = 'शेतकरी', lastProduct, language = 'Marathi', agentGender = 'female' } = options;

  console.log('📞 Starting Exotel call to:', phone);

  // Normalize phone number
  let normalizedPhone = phone.replace(/\D/g, '');
  if (!normalizedPhone.startsWith('91')) {
    normalizedPhone = '91' + normalizedPhone;
  }

  console.log('📞 Normalized phone:', normalizedPhone);

  const callerId = process.env.EXOTEL_NUMBER || '';
  console.log('📞 Caller ID:', callerId);

  // Build Exotel API endpoint
  const endpoint = `https://${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}/Calls/connect.json`;

  // CRITICAL FIX: Use direct webhook URL, NOT applet URL
  const webhookUrl = `${process.env.BACKEND_BASE_URL}/exotel/voice`;

  const params = {
    From: normalizedPhone,
    CallerId: callerId,
    Url: webhookUrl,  // ✅ Direct webhook, NOT applet!
    CallType: 'trans',
    TimeLimit: '600',
    TimeOut: '30'
  };

  console.log('📞 Exotel API Request:', { endpoint, params });

  try {
    const response = await axios.post(
      endpoint,
      new URLSearchParams(params as any),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Exotel call initiated:', response.data);

    const callSid = response.data.Call?.Sid;
    if (!callSid) {
      throw new Error('No CallSid in response');
    }

    // Store call context
    setCallContext(callSid, {
      customerName: name,
      language,
      agentGender,
      lastProduct
    });

    console.log('✅ Call initiated:', callSid);
    return callSid;

  } catch (error: any) {
    console.error('❌ Exotel call failed:', error.response?.data || error.message);
    throw new Error(`Failed to initiate call: ${error.message}`);
  }
}

/**
 * Get call status from Exotel
 */
export async function getCallStatus(callSid: string): Promise<any> {
  const endpoint = `https://${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}/Calls/${callSid}.json`;

  try {
    const response = await axios.get(endpoint);
    return response.data.Call;
  } catch (error: any) {
    console.error('❌ Get call status failed:', error.message);
    throw error;
  }
}

/**
 * Hangup call
 */
export async function hangupCall(callSid: string): Promise<void> {
  const endpoint = `https://${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}/Calls/${callSid}`;

  try {
    await axios.post(endpoint, new URLSearchParams({ Status: 'completed' }));
    console.log('✅ Call hung up:', callSid);
  } catch (error: any) {
    console.error('❌ Hangup failed:', error.message);
    throw error;
  }
}
