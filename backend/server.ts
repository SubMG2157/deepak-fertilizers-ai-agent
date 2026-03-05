// backend/server.ts - UPDATED FOR EXOTEL
import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import fs from 'fs';

// Handle Google credentials from environment
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  const credPath = '/tmp/google-credentials.json';
  fs.writeFileSync(credPath, process.env.GOOGLE_CREDENTIALS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  console.log('✅ Google credentials loaded from environment');
}

// Exotel imports
import { startExotelCall, getCallStatus, hangupCall } from './exotel/callStarter';
import {
  handleVoiceWebhook,
  handleGatherWebhook,
  handleRecordingCallback,
  handleStatusCallback,
  handleSMSStatusCallback,
  handleHangup
} from './exotel/webhookHandler';
import { handleExotelWebSocket } from './exotel/websocketHandler';
import exotelClient from './exotel/exotelClient';

// Other imports
import { saveOrder } from './orders/orderStore';
import { sendOrderSms } from './services/smsService';

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/audio', express.static(path.join(process.cwd(), 'backend', 'audio', 'public')));

// Create HTTP server
const server = http.createServer(app);

// WebSocket for UI updates
const uiWSS = new WebSocketServer({ noServer: true });

// Create WebSocket server for Exotel
const exotelWSS = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

  console.log('🔌 WebSocket upgrade:', pathname);

  if (pathname === '/media' || pathname === '/exotel/media') {
    exotelWSS.handleUpgrade(request, socket, head, (ws) => {
      exotelWSS.emit('connection', ws, request);
    });
  } else if (pathname === '/ui-sync') {
    uiWSS.handleUpgrade(request, socket, head, (ws) => {
      uiWSS.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Exotel WebSocket handler
exotelWSS.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
  console.log('🎙️ Exotel Voicebot connected');
  handleExotelWebSocket(ws, request);
});

// Store UI WebSocket globally for broadcasts
let uiWebSocket: any = null;
(global as any).uiWebSocket = null;

uiWSS.on('connection', (ws) => {
  console.log('🔌 UI WebSocket connected');
  uiWebSocket = ws;
  (global as any).uiWebSocket = ws;

  ws.on('close', () => {
    console.log('🔌 UI WebSocket disconnected');
    uiWebSocket = null;
    (global as any).uiWebSocket = null;
  });
});

// ==================== EXOTEL ENDPOINTS ====================

/**
 * Initiate outbound call
 */
app.post('/api/call', async (req: Request, res: Response) => {
  try {
    const { phone, name, lastProduct, language, agentGender } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const callSid = await startExotelCall({
      phone,
      name,
      lastProduct,
      language,
      agentGender
    });

    res.json({
      callId: callSid,
      status: 'initiated',
      message: 'Call initiated via Exotel'
    });
  } catch (error: any) {
    console.error('❌ /api/call error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Exotel voice webhook - initial call connection
 */
app.all('/exotel/voice', handleVoiceWebhook);

/**
 * Exotel gather webhook - loop architecture
 */
app.all('/exotel/gather', handleGatherWebhook);

/**
 * Exotel recording callback - process user speech
 */
app.post('/exotel/recording', handleRecordingCallback);

/**
 * Exotel status callback - call status updates
 */
app.post('/exotel/status', handleStatusCallback);

/**
 * Exotel SMS status callback
 */
app.post('/exotel/sms-status', handleSMSStatusCallback);

/**
 * Force hangup
 */
app.post('/exotel/hangup', handleHangup);

/**
 * Get call status
 */
app.get('/api/call/:callSid/status', async (req: Request, res: Response) => {
  try {
    const { callSid } = req.params;
    const status = await getCallStatus(callSid);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Hangup call
 */
app.post('/api/call/:callSid/hangup', async (req: Request, res: Response) => {
  try {
    const { callSid } = req.params;
    await hangupCall(callSid);
    res.json({ success: true, message: 'Call hung up' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ORDER ENDPOINTS ====================

/**
 * Save order manually
 */
app.post('/api/order', async (req: Request, res: Response) => {
  try {
    const order = await saveOrder(req.body);
    res.json({ success: true, order });
  } catch (error: any) {
    console.error('❌ /api/order error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send SMS manually
 */
app.post('/api/send-sms', async (req: Request, res: Response) => {
  try {
    const { to, phone, customerName, items, product, quantity, orderId } = req.body;

    const targetPhone = to || phone;
    if (!targetPhone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    // Handle both array and single product formats
    let itemsArray = items;
    if (!itemsArray && product && quantity) {
      itemsArray = [{ product, quantity }];
    }

    if (!itemsArray || itemsArray.length === 0) {
      return res.status(400).json({ error: 'Items required' });
    }

    await sendOrderSms(
      targetPhone,
      customerName || 'शेतकरी',
      itemsArray,
      orderId || 'DF-TEST-001'
    );

    res.json({ success: true, message: 'SMS sent via Exotel' });
  } catch (error: any) {
    console.error('❌ /api/send-sms error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH & UTILITY ====================

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    provider: 'exotel',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get Exotel configuration status
 */
app.get('/api/config', (req: Request, res: Response) => {
  res.json({
    exotelConfigured: !!(
      process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_SID
    ),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    backendUrl: process.env.BACKEND_BASE_URL
  });
});

// ==================== FRONTEND SERVING ====================

/**
 * Serve built frontend
 */
app.use(express.static(path.join(__dirname, '..', 'dist')));

/**
 * SPA fallback - serve index.html for all other routes
 */
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// ==================== START SERVER ====================

server.listen(PORT, () => {
  console.log('');
  console.log('🚀 Deepak Fertilisers AI Agent - Exotel Edition');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 Backend URL: ${process.env.BACKEND_BASE_URL || 'Not configured'}`);
  console.log('');
  console.log('📞 Exotel Configuration:');
  console.log(`   API Key: ${process.env.EXOTEL_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Number: ${process.env.EXOTEL_NUMBER || '❌ Not set'}`);
  console.log('');
  console.log('🤖 Gemini API: ', process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
