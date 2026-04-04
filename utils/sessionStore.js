// utils/sessionStore.js
// Persistent session store using Supabase.
// Sessions survive Railway restarts and deployments.
// Falls back to in-memory if Supabase is not configured.

const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────

var supabase = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log('[SessionStore] Using Supabase persistent storage');
} else {
  console.log('[SessionStore] Supabase not configured — using in-memory storage (sessions will reset on restart)');
}

// ─────────────────────────────────────────────
// IN-MEMORY FALLBACK
// ─────────────────────────────────────────────

var memoryStore = new Map();
var SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function emptyForm() {
  return {
    prepPickupDate:   null,
    shootingDate:     null,
    invoiceType:      null,
    invoiceDetails:   null,
    jobName:          null,
    equipmentList:    null,
    formComplete:     false,
  };
}

// ─────────────────────────────────────────────
// SUPABASE HELPERS
// ─────────────────────────────────────────────

async function dbGet(waId) {
  if (!supabase) return null;
  try {
    var result = await supabase
      .from('kino_sessions')
      .select('*')
      .eq('wa_id', waId)
      .single();
    if (result.error || !result.data) return null;
    var row = result.data;
    // Check TTL
    if (Date.now() - new Date(row.updated_at).getTime() > SESSION_TTL_MS) {
      await dbDelete(waId);
      return null;
    }
    return row;
  } catch (e) {
    console.error('[SessionStore] dbGet error:', e.message);
    return null;
  }
}

async function dbUpsert(waId, messages, form, handedOff) {
  if (!supabase) return;
  try {
    await supabase.from('kino_sessions').upsert({
      wa_id:      waId,
      messages:   JSON.stringify(messages),
      form:       JSON.stringify(form),
      handed_off: handedOff || false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wa_id' });
  } catch (e) {
    console.error('[SessionStore] dbUpsert error:', e.message);
  }
}

async function dbDelete(waId) {
  if (!supabase) return;
  try {
    await supabase.from('kino_sessions').delete().eq('wa_id', waId);
  } catch (e) {
    console.error('[SessionStore] dbDelete error:', e.message);
  }
}

// ─────────────────────────────────────────────
// MEMORY HELPERS (fallback)
// ─────────────────────────────────────────────

function memGet(waId) {
  var session = memoryStore.get(waId);
  if (!session) return null;
  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    memoryStore.delete(waId);
    return null;
  }
  return session;
}

function memSet(waId, session) {
  session.lastActive = Date.now();
  memoryStore.set(waId, session);
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

async function getSession(waId) {
  if (supabase) {
    var row = await dbGet(waId);
    if (!row) return [];
    try { return JSON.parse(row.messages) || []; } catch(e) { return []; }
  }
  var session = memGet(waId);
  return session ? session.messages : [];
}

async function addMessage(waId, role, content) {
  if (supabase) {
    var row = await dbGet(waId);
    var messages = [];
    var form = emptyForm();
    var handedOff = false;
    if (row) {
      try { messages = JSON.parse(row.messages) || []; } catch(e) {}
      try { form = JSON.parse(row.form) || emptyForm(); } catch(e) {}
      handedOff = row.handed_off || false;
    }
    messages.push({ role: role, content: content });
    if (messages.length > 30) messages = messages.slice(-30);
    await dbUpsert(waId, messages, form, handedOff);
    return;
  }
  var session = memGet(waId) || { messages: [], form: emptyForm(), handedOff: false };
  session.messages.push({ role: role, content: content });
  if (session.messages.length > 30) session.messages = session.messages.slice(-30);
  memSet(waId, session);
}

async function getForm(waId) {
  if (supabase) {
    var row = await dbGet(waId);
    if (!row) return emptyForm();
    try { return JSON.parse(row.form) || emptyForm(); } catch(e) { return emptyForm(); }
  }
  var session = memGet(waId);
  return session ? session.form : emptyForm();
}

async function updateForm(waId, fields) {
  if (supabase) {
    var row = await dbGet(waId);
    var messages = [];
    var form = emptyForm();
    var handedOff = false;
    if (row) {
      try { messages = JSON.parse(row.messages) || []; } catch(e) {}
      try { form = JSON.parse(row.form) || emptyForm(); } catch(e) {}
      handedOff = row.handed_off || false;
    }
    Object.assign(form, fields);
    form.formComplete = isFormComplete(form);
    await dbUpsert(waId, messages, form, handedOff);
    return;
  }
  var session = memGet(waId) || { messages: [], form: emptyForm(), handedOff: false };
  Object.assign(session.form, fields);
  session.form.formComplete = isFormComplete(session.form);
  memSet(waId, session);
}

async function getMissingFields(waId) {
  var form = await getForm(waId);
  var missing = [];
  if (!form.prepPickupDate) missing.push('prepPickupDate');
  if (!form.shootingDate)   missing.push('shootingDate');
  if (!form.invoiceType)    missing.push('invoiceType');
  if (!form.invoiceDetails) missing.push('invoiceDetails');
  if (!form.jobName)        missing.push('jobName');
  if (!form.equipmentList)  missing.push('equipmentList');
  return missing;
}

function isFormComplete(form) {
  return !!(form.prepPickupDate && form.shootingDate && form.invoiceType &&
            form.invoiceDetails && form.jobName && form.equipmentList);
}

async function formatFormSummary(waId) {
  var form = await getForm(waId);
  var inv = form.invoiceDetails || {};
  var missing = await getMissingFields(waId);

  var invoiceBlock = form.invoiceType === 'company'
    ? 'Company: ' + (inv.companyName || '-') + '\n' +
      '   Reg No: ' + (inv.registrationNo || '-') + '\n' +
      '   TIN: ' + (inv.tinNumber || '-') + '\n' +
      '   SST No: ' + (inv.sstNumber || '-') + '\n' +
      '   Address: ' + (inv.address || '-') + '\n' +
      '   Email: ' + (inv.email || '-') + '\n' +
      '   Contact: ' + (inv.contactPerson || '-')
    : 'Name: ' + (inv.name || '-') + '\n' +
      '   IC No: ' + (inv.icNumber || '-') + '\n' +
      '   Address: ' + (inv.address || '-') + '\n' +
      '   Email: ' + (inv.email || '-');

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'EQUIPMENT RENTAL ENQUIRY FORM',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Prep/Pick-up Date : ' + (form.prepPickupDate || '-'),
    'Shooting Date     : ' + (form.shootingDate || '-'),
    'Job Name          : ' + (form.jobName || '-'),
    'Equipment List    :\n   ' + (form.equipmentList || '-'),
    'Invoice Type      : ' + (form.invoiceType ? form.invoiceType.charAt(0).toUpperCase() + form.invoiceType.slice(1) : '-'),
    '   ' + invoiceBlock,
    'Form Complete     : ' + (form.formComplete ? 'Yes' : 'No — missing: ' + missing.join(', ')),
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

async function markHandedOff(waId) {
  if (supabase) {
    var row = await dbGet(waId);
    var messages = [];
    var form = emptyForm();
    if (row) {
      try { messages = JSON.parse(row.messages) || []; } catch(e) {}
      try { form = JSON.parse(row.form) || emptyForm(); } catch(e) {}
    }
    await dbUpsert(waId, messages, form, true);
    return;
  }
  var session = memGet(waId) || { messages: [], form: emptyForm(), handedOff: false };
  session.handedOff = true;
  memSet(waId, session);
}

async function isHandedOff(waId) {
  if (supabase) {
    try {
      var result = await supabase
        .from('kino_sessions')
        .select('handed_off')
        .eq('wa_id', waId);
      
      console.log('[SessionStore] isHandedOff check for ' + waId + ':', JSON.stringify(result.data), 'error:', result.error && result.error.message);
      
      if (!result.data || result.data.length === 0) {
        console.log('[SessionStore] No row found — returning false');
        return false;
      }
      
      var val = result.data[0].handed_off === true;
      console.log('[SessionStore] handed_off value:', val);
      return val;
    } catch(e) {
      console.error('[SessionStore] isHandedOff error:', e.message);
      return false;
    }
  }
  var session = memGet(waId);
  return session ? !!session.handedOff : false;
}

async function resumeBot(waId) {
  if (supabase) {
    try {
      await supabase
        .from('kino_sessions')
        .upsert({
          wa_id:      waId,
          handed_off: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wa_id' });
      console.log('[SessionStore] Bot resumed for ' + waId);
    } catch(e) {
      console.error('[SessionStore] resumeBot error:', e.message);
    }
    return;
  }
  var session = memGet(waId);
  if (session) { session.handedOff = false; memSet(waId, session); }
}

async function clearSession(waId) {
  if (supabase) { await dbDelete(waId); return; }
  memoryStore.delete(waId);
}

function getSessionCount() {
  if (supabase) return -1; // Not tracked for Supabase
  return memoryStore.size;
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
