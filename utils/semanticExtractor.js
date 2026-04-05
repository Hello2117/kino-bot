// utils/semanticExtractor.js
// Uses Claude Haiku to extract form fields from customer messages.
// Falls back gracefully if JSON parse fails.

const Anthropic = require('@anthropic-ai/sdk');
const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

var EXTRACTOR_SYSTEM = 'You are a data extraction assistant for a cinema equipment rental company in Malaysia. '
  + 'Read the customer message and extract any rental form fields that are present. '
  + 'Return ONLY a valid JSON object with no markdown formatting, no backticks, no code fences, no explanation. '
  + 'If nothing relevant is found return exactly: {} '
  + 'Fields to extract: '
  + 'prepPickupDate (pickup/collection date), '
  + 'shootingDate (shoot date or dates), '
  + 'jobName (project or job name), '
  + 'equipmentList (gear or equipment mentioned), '
  + 'invoiceType (individual or company), '
  + 'invoiceDetails (object with name, icNumber, companyName, registrationNo, tinNumber, sstNumber, address, email, contactPerson). '
  + 'Only include fields that are clearly present in the message. Do not guess.';

async function extractFormFields(customerMessage, recentHistory) {
  if (!recentHistory) recentHistory = [];
  try {
    var response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     EXTRACTOR_SYSTEM,
      messages:   [{ role: 'user', content: 'Customer message: "' + customerMessage + '"\n\nExtract any form fields present. Return only a JSON object, no backticks, no markdown.' }],
    });

    var raw = response.content && response.content[0] && response.content[0].text
      ? response.content[0].text.trim()
      : '';

    if (!raw || raw === '{}') return null;

    // Strip any backticks or code fences Haiku might add despite instructions
    var cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Must start with { to be valid JSON object
    if (!cleaned.startsWith('{')) {
      console.warn('[SemanticExtractor] Response not JSON object — skipping:', cleaned.substring(0, 80));
      return null;
    }

    var parsed = JSON.parse(cleaned);

    // Return null if empty object
    if (Object.keys(parsed).length === 0) return null;

    return parsed;

  } catch (err) {
    console.warn('[SemanticExtractor] skipping:', err.message);
    return null;
  }
}

function mapToFormUpdate(extracted) {
  if (!extracted || Object.keys(extracted).length === 0) return null;
  var update = {};
  if (extracted.prepPickupDate) update.prepPickupDate = extracted.prepPickupDate;
  if (extracted.shootingDate)   update.shootingDate   = extracted.shootingDate;
  if (extracted.jobName)        update.jobName        = extracted.jobName;
  if (extracted.equipmentList)  update.equipmentList  = extracted.equipmentList;
  if (extracted.invoiceType)    update.invoiceType    = extracted.invoiceType;
  if (extracted.invoiceDetails) update.invoiceDetails = extracted.invoiceDetails;
  return Object.keys(update).length > 0 ? update : null;
}

module.exports = { extractFormFields, mapToFormUpdate };
