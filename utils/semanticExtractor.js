// utils/semanticExtractor.js
// A dedicated, lightweight Claude call that reads a customer message in context
// and extracts any Equipment Rental Form fields it can identify — returning clean JSON.
//
// Design:
//   - Uses claude-haiku-4-5 (fast + cheap — ~10x cheaper than Sonnet)
//   - Runs in PARALLEL with the main KINO Sonnet call — zero added latency
//   - Returns null gracefully on any failure — never blocks the main flow
//   - Results are merged into sessionStore via formExtractor.extractAndUpdateForm()

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────
// EXTRACTION PROMPT
// Tight and deterministic. Haiku performs best with very explicit JSON schemas.
// ─────────────────────────────────────────────────────────────

const EXTRACTOR_SYSTEM = `You are a data extraction assistant for a Malaysian cinema equipment rental company.

Your ONLY job is to read a customer's WhatsApp message (and optionally some conversation context) and extract specific fields if they are clearly present.

Return ONLY a valid JSON object. No explanation. No preamble. No markdown. No code fences. Just raw JSON.

Schema to extract (all fields optional — only include a field if you are confident it is present):
{
  "prepPickupDate":   string | null,   // date customer wants to pick up gear
  "shootingDate":     string | null,   // actual shoot date(s)
  "jobName":          string | null,   // project or production name
  "equipmentList":    string | null,   // gear items mentioned (as a clean summary string)
  "invoiceType":      "individual" | "company" | null,
  "invoiceDetails": {
    "name":           string | null,   // individual: full name
    "icNumber":       string | null,   // individual: IC number
    "companyName":    string | null,   // company: registered name
    "registrationNo": string | null,   // company: SSM number
    "tinNumber":      string | null,   // company or individual: LHDN TIN
    "sstNumber":      string | null,   // company: SST reg number
    "address":        string | null,   // billing address
    "email":          string | null,   // billing email
    "contactPerson":  string | null    // company: contact person name
  } | null
}

Rules:
- Only include invoiceDetails if at least one sub-field is present.
- For dates, preserve the customer's phrasing (e.g. "15 Jan", "next Monday", "10/02/2025").
- For equipmentList, summarise gear mentions naturally e.g. "ARRI Alexa 35 + Signature Primes (LPL) — 3 days".
- For jobName, extract the production/project name if stated — NOT the shoot type (not "TVC" alone, but "Nike TVC 2025").
- If genuinely nothing is present, return exactly: {}
- Never hallucinate. If uncertain, omit the field.`;

// ─────────────────────────────────────────────────────────────
// MAIN EXTRACTOR FUNCTION
// ─────────────────────────────────────────────────────────────

/**
 * Extract form fields from a customer message using Claude Haiku.
 * Runs fast and cheap in parallel with the main KINO Sonnet call.
 *
 * @param {string} customerMessage   - The raw customer message
 * @param {Array}  [recentHistory]   - Last 3-4 messages for context (optional)
 * @returns {Promise<object|null>}   - Extracted fields object, or null on failure
 */
async function extractFormFields(customerMessage, recentHistory = []) {
  // Build a compact context string from recent history (last 4 messages max)
  const contextLines = recentHistory.slice(-4).map(m =>
    `${m.role === 'user' ? 'Customer' : 'KINO'}: ${m.content.substring(0, 200)}`
  );

  const userPrompt = contextLines.length > 0
    ? `Recent conversation:\n${contextLines.join('\n')}\n\nNew customer message:\n"${customerMessage}"\n\nExtract any form fields present.`
    : `Customer message:\n"${customerMessage}"\n\nExtract any form fields present.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: EXTRACTOR_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.text?.trim();
    if (!raw || raw === '{}') return null;

    const parsed = JSON.parse(raw);

    // Flatten nulls — remove any explicitly-null fields to keep updates clean
    return removeNulls(parsed);

  } catch (err) {
    // JSON parse errors or API errors — silently return null, never block main flow
    if (err instanceof SyntaxError) {
      console.warn('[SemanticExtractor] JSON parse failed — skipping:', err.message);
    } else {
      console.error('[SemanticExtractor] API error:', err.message);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function removeNulls(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      const inner = removeNulls(value);
      if (Object.keys(inner).length > 0) cleaned[key] = inner;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Map extracted fields to the sessionStore updateForm() shape.
 * Handles the invoiceDetails merge correctly.
 */
function mapToFormUpdate(extracted) {
  if (!extracted || Object.keys(extracted).length === 0) return null;

  const update = {};

  if (extracted.prepPickupDate)  update.prepPickupDate  = extracted.prepPickupDate;
  if (extracted.shootingDate)    update.shootingDate    = extracted.shootingDate;
  if (extracted.jobName)         update.jobName         = extracted.jobName;
  if (extracted.equipmentList)   update.equipmentList   = extracted.equipmentList;
  if (extracted.invoiceType)     update.invoiceType     = extracted.invoiceType;
  if (extracted.invoiceDetails)  update.invoiceDetails  = extracted.invoiceDetails;

  return Object.keys(update).length > 0 ? update : null;
}

module.exports = { extractFormFields, mapToFormUpdate };
