# Deepak Fertilisers — AI Calling Agent 🌾

AI-powered outbound voice agent for **Deepak Fertilisers**. The agent **calls farmers** via Exotel, speaks in **Marathi**, recommends **Mahādhan** fertiliser products based on crop/disease, captures multi-product orders, sends SMS confirmations with payment links, and auto-hangs up after closing.

**Stack:** React + Vite (frontend) · Express + Exotel + Google Gemini REST API (backend) · Single-port deployment via ngrok.

---

## Project Structure

```
├── App.tsx                    # Main UI: customer card, call panel, live transcript
├── index.tsx                  # React entry
├── index.html                 # Entry HTML
├── types.ts                   # Language, TranscriptItem, ConnectionState
├── metadata.json              # Customer metadata (demo)
├── package.json               # Scripts: dev, build, start, backend, test
├── vite.config.ts             # Vite + Vitest config (port 3000)
│
├── components/
│   ├── Visualizer.tsx         # Volume rings (customer / agent)
│   └── LanguageSelector.tsx   # Language selector (Marathi/Hindi/English)
│
├── services/
│   ├── conversationEngine/    # Shared prompt system (browser + Twilio)
│   │   ├── index.ts           # getSystemInstruction(language, customerName, context)
│   │   └── prompts.ts         # Full agent persona, call flow, product catalog
│   ├── liveClient.ts          # Gemini Live session (browser demo mode)
│   ├── audioUtils.ts          # PCM blob, peak normalization, decode
│   ├── languageDetection.ts   # Hindi/Marathi/English detection
│   ├── domainGuard.ts         # Intent classification (in-domain vs off-topic)
│   ├── consentGate.ts         # Valid consent phrases (हो, हां, yes, etc.)
│   ├── transcriptDisplay.ts   # Greeting normalization for UI
│   ├── transcriptSanitizer.ts # Unicode script filter (Devanagari/English only)
│   ├── transcriptExport.ts    # Export transcript as CSV or PDF
│   ├── endGreetings.ts        # Closing phrases
│   ├── purposeDetection.ts    # Crop/disease intent detection
│   └── logger.ts              # In-memory frontend logs
│
├── backend/
│   ├── server.ts              # Express: REST APIs, Exotel webhooks, WS, static frontend
│   ├── exotel/
│   │   ├── exotelClient.ts    # Exotel REST API client (Calls, SMS)
│   │   ├── callStarter.ts     # Initiates outbound Exotel calls
│   │   ├── webhookHandler.ts  # Generates ExoML flow responses (XML)
│   │   └── conversationFlow.ts # Core logic: Audio chunking, Session state, Gemini Text
│   ├── services/
│   │   ├── tts/
│   │   │   └── ttsService.ts  # Google Cloud TTS to generate agent audio
│   │   ├── audioStorage.ts    # Saves MP3s to public/audio folder for Exotel playback
│   │   ├── smsService.ts      # Exotel SMS: Hardcoded payment link + Bill generation
│   ├── orders/
│   │   └── orderStore.ts      # Multi-product order persistence
│   └── knowledge/
│       ├── productCatalog.ts  # Product pricing, aliases, fuzzy matching logic
│       ├── products.json      # Legacy catalog (reference)
│       └── diseases.json      # Crop disease database (symptoms → product mapping)
│
├── tests/
│   ├── languageDetection.test.ts
│   ├── domainGuard.test.ts
│   ├── purposeDetection.test.ts
│   └── consentGate.test.ts
│
├── docs/                      # Project documentation
└── logs/                      # Runtime logs (logs.txt)
```

---

## Key Features

- **Real-Time Multi-Product Orders:** Tracks multiple products/quantities in real-time.
- **Session-Based State:** Uses in-memory states to track order status across conversation turns.
- **Order Locking:** Once the SMS is sent, the order is "locked" to prevent accidental modifications from subsequent conversation.
- **Smart Pricing:** Includes fuzzy matching for product names.
- **Outbound First:** Agent speaks first automatically by supplying the initial recorded greeting via TTS.
- **Consent Gate:** "तुम्हाला दोन मिनिटं बोलता येईल का?" — only explicit consent (हो, हां, ठीक) proceeds.
- **Smart Product Recommendation:** Based on crop type, growth stage, or disease symptoms.
- **Smart Address Capture:** Accepts full address at once or asks stepwise (गाव → तालुका → जिल्हा → पिनकोड).
- **Auto SMS:** When agent decides to send SMS, backend auto-sends Exotel SMS with itemized bill and payment link.
- **Auto Hangup:** Detects closing phrases and hangs up after TTS completes.
- **Single Port Deployment:** Frontend + backend both served on port 3001 via one ngrok URL.
- **File Logging:** All backend console output logged to `logs/logs.txt` with timestamps.

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Exotel
EXOTEL_API_KEY=your_exotel_api_key
EXOTEL_API_TOKEN=your_exotel_token
EXOTEL_SID=your_exotel_sid
EXOTEL_SUBDOMAIN=api.exotel.com
EXOTEL_NUMBER=09513886363
EXOTEL_APP_ID=1188866

# Gemini AI (required for agent logic)
GEMINI_API_KEY=AIzaSyxxxxxxxx...

# Google Cloud TTS
GOOGLE_APPLICATION_CREDENTIALS=google-credentials.json

# Backend URL — must be public for Exotel (ngrok)
BACKEND_BASE_URL=https://xxxx-xx-xxx.ngrok-free.app
BACKEND_PORT=3001
```

> ⚠️ **Important:** Ensure your Exotel account is configured and the `BACKEND_BASE_URL` is up-to-date. You can use `npx tsx update-ngrok.ts` to automatically update `.env.local`.

---

## Run Locally

### Prerequisites
- Node.js ≥ 18
- Twilio account (for real calls)
- Google Gemini API key
- ngrok (for public URL)

### Quick Start (Single Command)

```bash
npm install
npm run start
```

This builds the frontend and starts the backend on port 3001.

In a separate terminal:
```bash
ngrok http 3001
```

Update `BACKEND_BASE_URL` in `.env.local` using our helper script:
```bash
npx tsx update-ngrok.ts
```
Then restart the backend.

### Development Mode

```bash
# Terminal 1: Frontend dev server (port 3000)
npm run dev

# Terminal 2: Backend (port 3001)
npm run backend
```

---

## Scripts

| Command               | Description                                    |
| --------------------- | ---------------------------------------------- |
| `npm run dev`         | Frontend dev server (port 3000, hot reload)    |
| `npm run build`       | Production build → `dist/`                     |
| `npm run start`       | Build + start backend (single port deployment) |
| `npm run backend`     | Start backend only (port 3001)                 |
| `npm run backend:dev` | Backend with file watching                     |
| `npm run test`        | Run Vitest (watch mode)                        |
| `npm run test:run`    | Run Vitest once                                |

---

## Call Journey (Outbound Agricultural Sales)

1. **Greeting & Verification** — "नमस्कार {name}जी, मी दीपक फर्टिलायझर्सकडून बोलतोय."
2. **Consent** — "तुम्हाला दोन मिनिटं बोलता येईल का?" Wait for explicit consent.
3. **Need Discovery** — Crop type, growth stage, any disease symptoms.
4. **Product Recommendation** — Based on crop/disease, recommend specific Mahādhan product.
5. **Multi-Product Order** — Farmer can order multiple items (e.g., "Two bags 19:19:19, one bag Smartek").
6. **Order Confirmation** — Read back itemized list and total price.
7. **SMS + Payment** — Agent triggers SMS. Order is **LOCKED**. SMS contains itemized bill and payment link.
8. **Closure** — Thank farmer, mention delivery timeline, hang up.

---

## API Endpoints

| Method   | Endpoint            | Description                          |
| -------- | ------------------- | ------------------------------------ |
| POST     | `/api/call`         | Initiate outbound call               |
| POST     | `/api/order`        | Save order manually                  |
| POST     | `/api/send-sms`     | Send SMS manually                    |
| GET      | `/health`           | Health check                         |
| GET      | `/audio/*`          | Serve static MP3 files for Exotel `<Play>` |
| GET/POST | `/exotel/voice`     | Exotel Voice Webhook (Hit by Connect Applet) |
| GET/POST | `/exotel/recording` | Exotel Recording Webhook             |
| GET/POST | `/exotel/status`    | Exotel Call Status Webhook           |
| WS       | `/ui-sync`          | Real-time UI updates (transcript)    |

---

## Product Catalog (Mahādhan)

| Product              | Use Case                    | Price (approx) |
| -------------------- | --------------------------- | -------------- |
| महाधन अमृता 19:19:19    | General growth              | ₹1200          |
| महाधन अमृता MAP 12:61:0 | Root strength, new plants   | ₹1450          |
| महाधन अमृता MKP 0:52:34 | Flowering, fruiting         | ₹1800          |
| महाधन अमृता 13:0:45     | Fruit color, taste, quality | ₹1350          |
| महाधन अमृता SOP 0:0:50  | Crop maturity               | ₹1900          |
| महाधन स्मारटेक (Smartek) | Advanced nutrient uptake    | ₹1250          |
| महाधन अमृता कॅल्शियम नायट्रेट | Fruit cracking prevention   | -              |
| महाधन क्रांती             | All-round soil health       | -              |
| महाधन झिंकसल्फ           | Zinc deficiency             | -              |

---

## Documentation

- **[TECHNICAL_DOCUMENTATION.md](./docs/TECHNICAL_DOCUMENTATION.md)** — Architecture, data flow, key files.
- **[PROJECT_FLOW.md](./docs/PROJECT_FLOW.md)** — End-to-end call flow and code mapping.
- **[PROMPTS_REFERENCE.md](./docs/PROMPTS_REFERENCE.md)** — Agent persona, prompt structure, product rules.
- **[API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md)** — REST endpoints, WebSockets, Twilio webhooks.
