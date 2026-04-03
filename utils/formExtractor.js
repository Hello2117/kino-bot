// utils/formExtractor.js
// Attempts to extract Equipment Rental Form fields from the conversation.
// Called after each customer message to progressively fill the form.
// Uses simple pattern matching for dates/IC/reg numbers + Claude for semantic fields.

const { updateForm, getForm } = require('./sessionStore');

// ─────────────────────────────────────────────
// DATE PATTERNS
// Handles: "10 Jan", "10/01/2025", "January 10", "next Monday", etc.
// Note: For production, consider a proper date NLP library like chrono-node
// ─────────────────────────────────────────────

const DATE_PATTERNS = [
  /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/,              // 10/01/2025
  /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{0,4})\b/i, // 10 Jan 2025
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})[,\s]*(\d{0,4})\b/i, // Jan 10 2025
];

function extractDate(text) {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ─────────────────────────────────────────────
// IC NUMBER PATTERN (Malaysian)
// Format: YYMMDD-PB-XXXX e.g. 900101-14-5678
// ─────────────────────────────────────────────

function extractICNumber(text) {
  const match = text.match(/\b\d{6}[-\s]?\d{2}[-\s]?\d{4}\b/);
  return match ? match[0].replace(/\s/g, '') : null;
}

// ─────────────────────────────────────────────
// COMPANY REGISTRATION NUMBER (SSM)
// Format: 12-digit number, or old format XXXXXX-X
// ─────────────────────────────────────────────

function extractRegistrationNo(text) {
  const newFormat = text.match(/\b\d{12}\b/);       // New 12-digit format
  const oldFormat = text.match(/\b\d{6,7}-[A-Z]\b/); // Old format e.g. 123456-A
  return (newFormat || oldFormat)?.[0] || null;
}

// ─────────────────────────────────────────────
// TIN NUMBER (Malaysia LHDN)
// Format: C/IG/OG/SG + digits e.g. C12345678900
// ─────────────────────────────────────────────

function extractTIN(text) {
  const match = text.match(/\b(C|IG|OG|SG|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|TJ|LE|SA)\d{10,12}\b/i);
  return match ? match[0].toUpperCase() : null;
}

// ─────────────────────────────────────────────
// EMAIL
// ─────────────────────────────────────────────

function extractEmail(text) {
  const match = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
  return match ? match[0] : null;
}

// ─────────────────────────────────────────────
// INVOICE TYPE DETECTION
// ─────────────────────────────────────────────

function detectInvoiceType(text) {
  const lower = text.toLowerCase();
  const companyKeywords = ['company', 'syarikat', 'sdn bhd', 'sdn. bhd', 'berhad', 'enterprise', 'plt', 'llp', 'my company', 'our company', 'corporate'];
  const individualKeywords = ['individual', 'personal', 'myself', 'my name', 'nama saya', 'individu', 'persendirian'];

  if (companyKeywords.some(k => lower.includes(k))) return 'company';
  if (individualKeywords.some(k => lower.includes(k))) return 'individual';
  return null;
}

// ─────────────────────────────────────────────
// MAIN EXTRACTOR
// Called after each customer message. Updates form fields when detected.
// ─────────────────────────────────────────────

/**
 * Scan a customer message and update any form fields that can be extracted.
 * @param {string} waId
 * @param {string} customerMessage
 * @param {object} [contextHints] - Optional hints from Claude's interpretation
 *   e.g. { jobName: 'MV Najwa Latif', equipmentList: 'Sig Primes + Alexa 35' }
 */
function extractAndUpdateForm(waId, customerMessage, contextHints = {}) {
  const form = getForm(waId);
  const updates = {};
  const text = customerMessage;

  // ── Dates ──────────────────────────────────────────────────────────────────
  // If we don't have shoot date yet, try to extract
  if (!form.shootingDate) {
    const date = extractDate(text);
    if (date) updates.shootingDate = date;
  }

  // ── Invoice type ───────────────────────────────────────────────────────────
  if (!form.invoiceType) {
    const type = detectInvoiceType(text);
    if (type) updates.invoiceType = type;
  }

  // ── Invoice details — email ────────────────────────────────────────────────
  const email = extractEmail(text);
  if (email) {
    const existing = form.invoiceDetails || {};
    updates.invoiceDetails = { ...existing, email };
  }

  // ── Individual IC ──────────────────────────────────────────────────────────
  if (form.invoiceType === 'individual' || updates.invoiceType === 'individual') {
    const ic = extractICNumber(text);
    if (ic) {
      const existing = form.invoiceDetails || {};
      updates.invoiceDetails = { ...(updates.invoiceDetails || existing), icNumber: ic };
    }
  }

  // ── Company fields ─────────────────────────────────────────────────────────
  if (form.invoiceType === 'company' || updates.invoiceType === 'company') {
    const regNo = extractRegistrationNo(text);
    const tin   = extractTIN(text);
    if (regNo || tin) {
      const existing = form.invoiceDetails || {};
      updates.invoiceDetails = {
        ...(updates.invoiceDetails || existing),
        ...(regNo && { registrationNo: regNo }),
        ...(tin   && { tinNumber: tin }),
      };
    }
  }

  // ── Context hints from Claude interpretation ───────────────────────────────
  // These are passed in when Claude identifies semantic fields from conversation
  if (contextHints.jobName        && !form.jobName)        updates.jobName        = contextHints.jobName;
  if (contextHints.equipmentList  && !form.equipmentList)  updates.equipmentList  = contextHints.equipmentList;
  if (contextHints.prepPickupDate && !form.prepPickupDate) updates.prepPickupDate = contextHints.prepPickupDate;
  if (contextHints.shootingDate   && !form.shootingDate)   updates.shootingDate   = contextHints.shootingDate;
  if (contextHints.invoiceType    && !form.invoiceType)    updates.invoiceType    = contextHints.invoiceType;
  if (contextHints.invoiceDetails) {
    const existing = form.invoiceDetails || {};
    updates.invoiceDetails = { ...existing, ...contextHints.invoiceDetails };
  }

  // Apply all updates if any
  if (Object.keys(updates).length > 0) {
    updateForm(waId, updates);
  }

  return updates;
}

module.exports = { extractAndUpdateForm, extractDate, extractEmail, extractICNumber, detectInvoiceType };
