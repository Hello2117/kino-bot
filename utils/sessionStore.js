// utils/sessionStore.js
// Stores per-customer conversation history and enquiry form state.
// Keyed by WhatsApp number. Auto-expiry after 24 hours of inactivity.
// For production at scale, swap the Map for Redis.

const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─────────────────────────────────────────────
// ENQUIRY FORM SCHEMA
// Mirrors the Equipment Rental Form fields.
// KINO collects these naturally across the conversation.
// ─────────────────────────────────────────────

function emptyForm() {
  return {
    prepPickupDate:   null,   // Prep/pick-up date
    shootingDate:     null,   // Actual shoot date(s)
    invoiceType:      null,   // 'individual' or 'company'
    invoiceDetails:   null,   // Full e-invoice compliant info (object — see below)
    jobName:          null,   // Project / job name
    equipmentList:    null,   // Gear items as a string or array
    formComplete:     false,  // True once all 5 fields are filled
  };
}

// invoiceDetails shape:
//   Individual: { name, icNumber, address, email }
//   Company:    { companyName, registrationNo, tinNumber, sstNumber,
//                 address, email, contactPerson }

// ─────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────

function _getOrCreate(waId) {
  const existing = sessions.get(waId);
  if (existing) {
    if (Date.now() - existing.lastActive > SESSION_TTL_MS) {
      sessions.delete(waId);
      return _fresh();
    }
    return existing;
  }
  return _fresh();
}

function _fresh() {
  return {
    messages:   [],
    form:       emptyForm(),
    handedOff:  false,
    lastActive: Date.now(),
  };
}

function _save(waId, session) {
  session.lastActive = Date.now();
  sessions.set(waId, session);
}

// ─────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────

function getSession(waId) {
  const session = sessions.get(waId);
  if (!session) return [];
  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    sessions.delete(waId);
    return [];
  }
  return session.messages;
}

function addMessage(waId, role, content) {
  const session = _getOrCreate(waId);
  session.messages.push({ role, content });
  if (session.messages.length > 30) {
    session.messages = session.messages.slice(-30);
  }
  _save(waId, session);
}

// ─────────────────────────────────────────────
// ENQUIRY FORM
// ─────────────────────────────────────────────

function getForm(waId) {
  const session = sessions.get(waId);
  return session ? { ...session.form } : emptyForm();
}

/**
 * Update one or more form fields.
 * @param {string} waId
 * @param {object} fields - partial form object e.g. { jobName: 'MV Najwa' }
 */
function updateForm(waId, fields) {
  const session = _getOrCreate(waId);
  session.form = { ...session.form, ...fields };
  session.form.formComplete = isFormComplete(session.form);
  _save(waId, session);
}

/**
 * Returns list of field names still missing from the form.
 */
function getMissingFields(waId) {
  const form = getForm(waId);
  const missing = [];
  if (!form.prepPickupDate) missing.push('prepPickupDate');
  if (!form.shootingDate)   missing.push('shootingDate');
  if (!form.invoiceType)    missing.push('invoiceType');
  if (!form.invoiceDetails) missing.push('invoiceDetails');
  if (!form.jobName)        missing.push('jobName');
  if (!form.equipmentList)  missing.push('equipmentList');
  return missing;
}

function isFormComplete(form) {
  return !!(
    form.prepPickupDate &&
    form.shootingDate   &&
    form.invoiceType    &&
    form.invoiceDetails &&
    form.jobName        &&
    form.equipmentList
  );
}

/**
 * Format the completed form as a clean summary string.
 * Used in handoff notifications and quote generation.
 */
function formatFormSummary(waId) {
  const form = getForm(waId);
  const inv = form.invoiceDetails || {};

  const invoiceBlock = form.invoiceType === 'company'
    ? `Company: ${inv.companyName || '—'}
   Reg No: ${inv.registrationNo || '—'}
   TIN: ${inv.tinNumber || '—'}
   SST No: ${inv.sstNumber || '—'}
   Address: ${inv.address || '—'}
   Email: ${inv.email || '—'}
   Contact: ${inv.contactPerson || '—'}`
    : `Name: ${inv.name || '—'}
   IC No: ${inv.icNumber || '—'}
   Address: ${inv.address || '—'}
   Email: ${inv.email || '—'}`;

  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EQUIPMENT RENTAL ENQUIRY FORM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Prep/Pick-up Date : ${form.prepPickupDate || '—'}
🎬 Shooting Date     : ${form.shootingDate || '—'}
🎯 Job Name          : ${form.jobName || '—'}
📦 Equipment List    :
   ${form.equipmentList || '—'}
🧾 Invoice Type      : ${form.invoiceType ? form.invoiceType.charAt(0).toUpperCase() + form.invoiceType.slice(1) : '—'}
   ${invoiceBlock}
✅ Form Complete     : ${form.formComplete ? 'Yes' : 'No — missing: ' + getMissingFields(waId).join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ─────────────────────────────────────────────
// HANDOFF
// ─────────────────────────────────────────────

function markHandedOff(waId) {
  const session = _getOrCreate(waId);
  session.handedOff = true;
  _save(waId, session);
}

function isHandedOff(waId) {
  const session = sessions.get(waId);
  return session ? !!session.handedOff : false;
}

function resumeBot(waId) {
  const session = sessions.get(waId);
  if (session) {
    session.handedOff = false;
    _save(waId, session);
  }
}

// ─────────────────────────────────────────────
// MISC
// ─────────────────────────────────────────────

function clearSession(waId) {
  sessions.delete(waId);
}

function getSessionCount() {
  return sessions.size;
}

module.exports = {
  getSession,
  addMessage,
  clearSession,
  getSessionCount,
  markHandedOff,
  isHandedOff,
  resumeBot,
  getForm,
  updateForm,
  getMissingFields,
  formatFormSummary,
  isFormComplete,
};
