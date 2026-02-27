/**
 * Transcript Sanitizer — banking-grade Unicode script filter.
 *
 * Ensures live transcript only contains:
 *   - English (Latin letters)
 *   - Hindi / Marathi (Devanagari)
 *   - Digits, common punctuation, whitespace
 *
 * Strips Japanese, Chinese, Arabic, Telugu, Tamil, etc. that ASR may
 * hallucinate on noise or unclear speech.
 *
 * Used by: liveClient.ts (demo), backend/mediaStream.ts (Twilio), App.tsx (safety net).
 */

// ── Noise patterns ──────────────────────────────────────────────────────
const NOISE_REGEX = /^(hmm+|uh+|ah+|um+|hm+|…+|\.+|-+)$/i;

// ── Allowed Unicode ranges ──────────────────────────────────────────────
//   Basic Latin          : U+0000 – U+007F  (English, digits, punctuation)
//   Devanagari           : U+0900 – U+097F  (Hindi, Marathi)
//   Devanagari Extended  : U+A8E0 – U+A8FF  (vedic extensions used in some Hindi/Marathi text)
//   Common Indic Number Forms : U+A830 – U+A83F
const ALLOWED_REGEX = /[^\u0000-\u007F\u0900-\u097F\uA8E0-\uA8FF0-9.,?!;:'"()\-–—…₹\s]/g;

// ── Language detection (lightweight, Unicode-based) ─────────────────────
type DetectedLang = 'en' | 'hi' | 'unknown';

function detectLangConfidence(text: string): { lang: DetectedLang; confidence: number } {
  let en = 0;
  let dev = 0;
  let other = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) en++;
    else if (code >= 0x0900 && code <= 0x097F) dev++;
    else if (ch.trim() !== '') other++;
  }

  const total = en + dev + other;
  if (total === 0) return { lang: 'unknown', confidence: 0 };

  const max = Math.max(en, dev);
  if (max === en) return { lang: 'en', confidence: en / total };
  return { lang: 'hi', confidence: dev / total };
}

// ── Public API ──────────────────────────────────────────────────────────

export interface SanitizeResult {
  /** Cleaned text to display, or null if should be dropped entirely. */
  output: string | null;
  /** True when the text was too ambiguous to show verbatim. */
  isUnclear: boolean;
}

/**
 * Sanitize a customer transcript line.
 *
 * 1. Strip all characters outside English + Devanagari + digits + punctuation.
 * 2. Drop pure noise (hmm, uh, ah, dots).
 * 3. Confidence gate:
 *    - ≥ 0.5 → show cleaned text
 *    - < 0.5 and some chars remain → show "[unclear]"
 *    - nothing left → return null (drop silently)
 */
export function sanitizeTranscript(text: string): SanitizeResult {
  if (!text) return { output: null, isUnclear: false };

  // Step 1: strip unsupported scripts
  const cleaned = text.replace(ALLOWED_REGEX, '').trim();

  // Step 2: nothing left after cleaning
  if (cleaned.length === 0) {
    return { output: null, isUnclear: false };
  }

  // Step 3: noise-only
  if (NOISE_REGEX.test(cleaned)) {
    return { output: null, isUnclear: false };
  }

  // Step 4: too short (single char remnant)
  if (cleaned.length < 2) {
    return { output: null, isUnclear: false };
  }

  // Step 5: confidence gate
  const { confidence } = detectLangConfidence(cleaned);

  if (confidence >= 0.5) {
    return { output: cleaned, isUnclear: false };
  }

  // Some text, but low confidence — show [unclear]
  if (cleaned.length >= 2) {
    return { output: '[unclear]', isUnclear: true };
  }

  return { output: null, isUnclear: false };
}

/**
 * Quick boolean check — true if the text is safe to display.
 * Use when you only need a pass/fail (e.g. safety net in UI).
 */
export function isCleanTranscript(text: string): boolean {
  const { output } = sanitizeTranscript(text);
  return output !== null;
}
