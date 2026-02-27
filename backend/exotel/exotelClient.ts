// backend/exotel/exotelClient.ts
import axios from 'axios';

interface ExotelCallParams {
  to: string;
  callerId: string;
  appletUrl?: string;
}

interface ExotelSMSParams {
  to: string;
  message: string;
}

class ExotelClient {
  private get apiKey(): string { return process.env.EXOTEL_API_KEY || ''; }
  private get apiToken(): string { return process.env.EXOTEL_API_TOKEN || ''; }
  private get sid(): string { return process.env.EXOTEL_SID || ''; }
  private get subdomain(): string { return process.env.EXOTEL_SUBDOMAIN || ''; }

  private get baseUrl(): string {
    return `https://${this.apiKey}:${this.apiToken}@api.exotel.com/v1/Accounts/${this.sid}`;
  }

  constructor() {
    // Note: Credentials are evaluated lazily via getters
  }

  /**
   * Initiate outbound call
   */
  async makeCall(params: ExotelCallParams): Promise<any> {
    try {
      // Build request parameters exactly as required for direct Calls.json API
      const requestParams: Record<string, string> = {
        From: params.to,                         // Customer's number (who to call)
        CallerId: process.env.EXOTEL_NUMBER || '', // Your Exotel number (display number)
        Url: `http://my.exotel.com/exoml/start/1188866`, // Applet Flow URL
        CallType: 'trans',
        TimeLimit: '600',
        TimeOut: '30'
      };

      console.log('📞 Exotel API Request:', {
        endpoint: `${this.baseUrl}/Calls/connect.json`,
        params: requestParams
      });

      const response = await axios.post(
        `${this.baseUrl}/Calls/connect.json`,
        new URLSearchParams(requestParams),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('✅ Exotel call initiated:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Exotel call failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Send SMS
   */
  async sendSMS(params: ExotelSMSParams): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/Sms/send.json`,
        new URLSearchParams({
          From: process.env.EXOTEL_NUMBER || '',
          To: params.to,
          Body: params.message,
          Priority: 'high',
          StatusCallback: `${process.env.BACKEND_BASE_URL}/exotel/sms-status`
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('✅ Exotel SMS sent:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Exotel SMS failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get call details
   */
  async getCallDetails(callSid: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/Calls/${callSid}.json`
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to get call details:', error.message);
      throw error;
    }
  }

  /**
   * Hang up a call
   */
  async hangupCall(callSid: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/Calls/${callSid}.json`,
        new URLSearchParams({
          Status: 'completed'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log('✅ Call hung up:', callSid);
      return response.data;
    } catch (error: any) {
      console.error('❌ Hangup failed:', error.message);
      throw error;
    }
  }
}

export default new ExotelClient();
