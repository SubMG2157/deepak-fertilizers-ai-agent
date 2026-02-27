# API Documentation — Deepak Fertilisers AI Calling Agent

## REST Endpoints

### POST `/api/call` — Initiate Outbound Call

Start an Exotel outbound call to a farmer.

**Request Body:**
```json
{
  "phone": "+919975711324",
  "name": "Mayur",
  "lastProduct": "NPK 19-19-19",
  "language": "Marathi",
  "agentGender": "female"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | string | Yes | Farmer's phone number (E.164 format) |
| `name` | string | No | Customer name (default: "शेतकरी") |
| `lastProduct` | string | No | Last purchased product (default: "NPK 19-19-19") |
| `language` | string | No | Conversation language (default: "Marathi") |
| `agentGender` | string | No | Agent voice: "male" (Puck) or "female" (Kore) |

**Response:**
```json
{
  "callId": "CA1234567890abcdef",
  "status": "initiated",
  "message": "Call initiated"
}
```

---

### POST `/api/order` — Save Order

Manually save an order (used by UI or external systems).

**Request Body:**
```json
{
  "customerName": "Mayur",
  "phone": "+919975711324",
  "items": [
    { "product": "NPK 19-19-19", "quantity": 2, "price": 1200 },
    { "product": "Mahadhan Smartek", "quantity": 1, "price": 1250 }
  ],
  "address": "यवत",
  "village": "यवत",
  "taluka": "दौंड",
  "pincode": "412104"
}
```

| Field | Type | Required |
|-------|------|----------|
| `phone` | string | Yes |
| `items` | array | Yes | List of `{product, quantity, price}` |
| `customerName` | string | No |
| `address` | string | No |
| `village` | string | No |
| `taluka` | string | No |
| `pincode` | string | No |

**Response:**
```json
{
  "success": true,
  "order": {
    "orderId": "DF-MLJNU6D6-1001",
    "items": [...],
    "totalAmount": 3650,
    "paymentLink": "https://amrutpeth.com/product/mahadhan-smartek-102626"
  }
}
```

---

### POST `/api/send-sms` — Send Order SMS

Send an SMS with order confirmation and payment link.

**Request Body:**
```json
{
  "to": "+919975711324",
  "customerName": "Mayur",
  "items": [
    { "product": "NPK 19-19-19", "quantity": 2 }
  ],
  "orderId": "DF-MLJNU6D6-1001"
}
```
*(Also accepts `phone` instead of `to`, and `product` + `quantity` instead of `items` array)*

### GET/POST `/exotel/voice` — Exotel Voice Webhook

Initial webhook hit by the Exotel Dashboard Connect Applet (Dynamic URL). 
Returns ExoML (XML) with `<Play>` tags to tell Exotel to stream the greeting audio directly from our backend (e.g. `greeting.mp3`) instead of using `<Say>`, completely avoiding Exotel's strict XML parsing drops.

### GET/POST `/exotel/recording` — Exotel Recording Callback

Receives user audio recording, sends to Gemini, generates response TTS, returns ExoML to play response.

### GET/POST `/exotel/status` — Exotel Call Status

Updates call statistics and broadcasts `completed` or `in-progress` states to `/ui-sync`.

---

## Payment Link Format

Hardcoded in `smsService.ts`:

```
https://amrutpeth.com/product/mahadhan-smartek-102626
```

---

## SMS Template

```
नमस्कार {name}जी,

आपला ऑर्डर तपशील:

नाव: {name}
मोबाईल: {phone}
पत्ता: {village}, {taluka}, {pincode}

उत्पादन तपशील:
{product} – {quantity} पिशव्या
दर: ₹{price} प्रति पिशवी
उपएकूण: ₹{total}

ही लिंक वापरा:
https://amrutpeth.com/product/mahadhan-smartek-102626

धन्यवाद – दीपक फर्टिलायझर्स 🌾
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing Exotel credentials | Application logs error |
| Gemini API Failure | Exotel hangs up or plays error audio |
| No Farmer Audio / Silence | Exotel waits for timeout then hangs up or repeats prompt |
| SMS send fails | Logs error, call continues normally |
| Call context missing | Logs warning, skips initialization |
