# Technical Documentation — Deepak Fertilisers AI Calling Agent

## Architecture Overview

The application is a **full-stack AI calling agent** that makes outbound phone calls to farmers, recommends fertiliser products, captures orders, and sends SMS confirmations. It operates in two modes:

1. **Browser Demo Mode** — Uses the browser microphone and Gemini Live API directly for testing.
2. **Exotel Phone Mode** — Makes real outbound calls via Exotel and routes conversational turns using HTTP webhooks to the Gemini REST API and Google Cloud TTS.

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React + Vite)                │
│  App.tsx → liveClient.ts → conversationEngine/prompts.ts │
│  Served as static files from backend (dist/)             │
└───────────────────┬─────────────────────────────────────┘
                    │ WebSocket (/ui-sync)
                    ▼
┌─────────────────────────────────────────────────────────┐
│               Backend (Express + Node.js)                │
│                                                          │
│  server.ts                                               │
│  ├── REST APIs:  /api/call, /api/order, /api/send-sms   │
│  ├── Exotel WS:  /exotel/voice, /exotel/recording       │
│  ├── WebSocket:  /ui-sync (UI updates)                  │
│  └── Static:     dist/ (built frontend)                 │
│                                                          │
│  Exotel Call Pipeline (conversationFlow.ts):             │
│  Exotel Record → Webhook → Gemini Text → TTS → Exotel   │
│                                                          │
│  Services:                                               │
│  ├── smsService.ts      (Exotel SMS + payment link)     │
│  ├── intentClassifier.ts (BUY, DISEASE, COMPLAINT...)   │
│  ├── diseaseMatcher.ts   (disease → product mapping)    │
│  ├── orderStore.ts       (in-memory order storage)      │
│  ├── fileLogger.ts       (console → logs/logs.txt)      │
│  └── conversationEndDetector.ts (auto-hangup)           │
└───────────────────┬─────────────────────────────────────┘
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
   ┌──────────┐        ┌──────────────┐
   │  Exotel  │        │ Gemini Chat  │
   │  (Calls  │        │ (AI Text +   │
   │  + SMS)  │        │  Cloud TTS)  │
   └──────────┘        └──────────────┘
```

---

## Key Components

### Frontend

| File | Purpose |
|------|---------|
| `App.tsx` | Main UI: customer card, mode toggle (Demo/Phone), call controls, live transcript |
| `services/liveClient.ts` | Browser demo: connects to Gemini Live, handles mic input/output |
| `services/conversationEngine/prompts.ts` | Agent persona, call flow steps, product catalog, behavioral rules |
| `services/conversationEngine/index.ts` | Builds system instruction from context (language, customer, agent gender) |
| `services/transcriptSanitizer.ts` | Filters non-Devanagari/English characters from transcription |
| `services/domainGuard.ts` | Classifies intent as in-domain vs off-topic |
| `services/consentGate.ts` | Detects valid consent phrases |
| `components/Visualizer.tsx` | Audio volume visualization rings |

### Backend

| File | Purpose |
|------|---------|
| `backend/server.ts` | Express server: APIs, webhooks, WebSockets, static file serving |
| `backend/exotel/exotelClient.ts` | Exotel REST API client (Calls, SMS) |
| `backend/exotel/callStarter.ts` | Creates outbound Exotel calls pointing to the Exotel Dashboard Flow Applet |
| `backend/exotel/webhookHandler.ts` | Exotel Voice/Recording webhooks generating ExoML `<Response>` chunks with `<Play>` |
| `backend/exotel/conversationFlow.ts` | **Core**: Call state engine, fetches LLM text, requests Google TTS |
| `backend/services/tts/ttsService.ts` | Google Cloud TTS wrapper for high quality voice generation |
| `backend/services/audioStorage.ts` | Stores generated MP3s for Exotel HTTP retrieval |
| `backend/services/smsService.ts` | Sends SMS via Exotel with itemized bill and **hardcoded payment link** |
| `backend/services/intentClassifier.ts` | Classifies customer intent (BUY, DISEASE_CHECK, COMPLAINT, etc.) |
| `backend/services/diseaseMatcher.ts` | Maps disease symptoms to product recommendations |
| `backend/services/inventoryService.ts` | Product availability lookup |
| `backend/services/conversationEndDetector.ts` | Detects agent closing phrases for auto-hangup |
| `backend/services/emotionDetector.ts` | Detects farmer sentiment |
| `backend/services/callState.ts` | Tracks call conversation stage |
| `backend/services/fileLogger.ts` | Overrides console.log/warn/error → logs/logs.txt |
| `backend/orders/orderStore.ts` | In-memory order store (supports multi-product orders) |

### Knowledge Base

| File | Purpose |
|------|---------|
| `backend/knowledge/productCatalog.ts` | **Primary**: Product pricing, aliases, fuzzy matching logic |
| `backend/knowledge/diseases.json` | Crop disease database (symptoms, affected crops, recommended products) |

---

## Audio Pipeline (Turn-based HTTP + Applet Flow)

```
Farmer Phone → Exotel → Connect Applet → POST /exotel/recording
  → Backend saves recording locally, fetches transcript
  → Gemini Text API → Generates Text
  → Google Cloud TTS → Generates MP3
  → audioStorage.ts → Saves via static file HTTP path
  → Webhook returns ExoML `<Play>` to Exotel Connect Applet → Farmer Phone
```

### Greeting Trigger
To ensure the agent speaks first:
1. `makeCall` hits `Calls/connect.json` with `Url` pointing to the Exotel Dashboard Flow Applet (`http://my.exotel.com/exoml/start/{app_id}`).
2. The Dashboard Flow uses a `Connect` Applet configured with a dynamic URL pointing to our backend `/exotel/voice`.
3. The webhook returns a static `<Play>` MP3 tag instead of `<Say>` to avoid Exotel XML parser failures.
4. Exotel streams and plays the greeting before starting the first Record prompt.

---

## SMS Auto-Trigger Flow (Real-Time Order Processing)

1. **Real-Time Extraction:** As the user speaks, `orderExtractor.ts` uses an LLM to interpret quantity intents from transcripts.
2. **Session Updates:** `conversationFlow.ts` updates the `items` Map (adds new items, updates quantities).
3. **Trigger Phrase:** Agent says "SMS पाठवतो" or "पेमेंट लिंक".
4. **Order Locking:** `state.locked` is set to `true`. Further spoken text will **not** modify the order.
5. **Bill Generation:** Backend calculates total price using `productCatalog.ts` (fuzzy matching).
6. **SMS Sending:** `smsService.ts` sends SMS with:
   - Customer details
   - Itemized list (Product x Qty = Price)
   - Total Amount
   - **Static Payment Link:** `https://amrutpeth.com/product/mahadhan-smartek-102626`
7. **Execution:** SMS is sent via Exotel API (non-blocking).

---

## Configuration

### Environment Variables (`.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXOTEL_API_KEY` | Yes (phone mode) | Exotel API Key |
| `EXOTEL_API_TOKEN` | Yes (phone mode) | Exotel API Token |
| `EXOTEL_NUMBER` | Yes (phone mode) | Exotel assigned caller phone number |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `BACKEND_BASE_URL` | Yes (phone mode) | Public URL (ngrok) for Exotel webhooks |
| `BACKEND_PORT` | No | Server port (default: 3001) |

### Important Notes

- Environment variables are read **lazily** (not at import time) to avoid race conditions with dotenv loading.
- Exotel credentials must be in the **root** `.env.local`, not `backend/.env.local`.
- Verify the phone number parameter to use '0' prefixes or '+91' based on Exotel specifications.

---

## Deployment (Single ngrok URL)

1. `npm run start` — Builds frontend to `dist/`, starts backend on port 3001
2. `ngrok http 3001` — Gets public URL
3. Update `BACKEND_BASE_URL` in `.env.local` with ngrok URL
4. Restart backend
5. Share the ngrok URL — serves both the frontend dashboard and handles Exotel webhooks

The backend serves the built frontend as static files and includes SPA fallback routing.
