// handlers/watiHandler.js
const axios = require('axios');

const WATI_BASE_URL = process.env.WATI_BASE_URL;
const WATI_API_KEY  = process.env.WATI_API_KEY;

// ─────────────────────────────────────────────
// SEND TEXT MESSAGE
// ─────────────────────────────────────────────

async function sendMessage(waId, message) {
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionMessage/' + waId,
      'messageText=' + encodeURIComponent(message),
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/x-www-form-urlencoded',
      }}
    );
    console.log('[WATI] Send success:', JSON.stringify(res.data).substring(0, 100));
    return res.data;
  } catch (err) {
    console.error('[WATI] sendMessage error:', err.response && err.response.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND FILE/DOCUMENT TO A NUMBER
// Forwards a file URL as a document message via WATI
// Used to forward customer documents to Jeff
// ─────────────────────────────────────────────

async function sendFile(waId, fileUrl, filename, caption) {
  if (!caption) caption = '';
  if (!filename) filename = 'document';
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionFile/' + waId,
      {
        url:      fileUrl,
        filename: filename,
        caption:  caption,
      },
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/json',
      }}
    );
    console.log('[WATI] File sent to ' + waId + ':', filename);
    return res.data;
  } catch (err) {
    // Some WATI plans use a different endpoint — try fallback
    console.warn('[WATI] sendFile primary failed, trying fallback:', err.response && err.response.data || err.message);
    try {
      var res2 = await axios.post(
        WATI_BASE_URL + '/api/v1/sendSessionDocument/' + waId,
        {
          document: fileUrl,
          filename: filename,
          caption:  caption,
        },
        { headers: {
          'Authorization': 'Bearer ' + WATI_API_KEY,
          'Content-Type':  'application/json',
        }}
      );
      console.log('[WATI] File sent via fallback to ' + waId);
      return res2.data;
    } catch (err2) {
      console.error('[WATI] sendFile fallback also failed:', err2.response && err2.response.data || err2.message);
      return null;
    }
  }
}

// ─────────────────────────────────────────────
// ASSIGN TO TEAM
// ─────────────────────────────────────────────

async function assignToTeam(waId) {
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/assignConversation/' + waId,
      { assignedTo: null },
      { headers: { 'Authorization': 'Bearer ' + WATI_API_KEY } }
    );
    return res.data;
  } catch (err) {
    console.error('[WATI] assignToTeam error:', err.response && err.response.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND TEMPLATE
// ─────────────────────────────────────────────

async function sendTemplate(waId, templateName, parameters) {
  if (!parameters) parameters = [];
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendTemplateMessage',
      {
        whatsappNumber: waId,
        template_name:  templateName,
        broadcast_name: templateName,
        parameters:     parameters.map(function(value) { return { name: 'text', value: value }; }),
      },
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/json',
      }}
    );
    return res.data;
  } catch (err) {
    console.error('[WATI] sendTemplate error:', err.response && err.response.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// NOTIFY JEFF
// Sends Jeff a text alert + forwards the actual document
// Does NOT trigger handoff — Kino continues the conversation
// ─────────────────────────────────────────────

async function notifyJeff(customerName, customerWaId, lastMessage, fileUrl, filename) {
  var jeffNumber = process.env.JEFF_WHATSAPP;
  if (!jeffNumber) {
    console.log('[WATI] JEFF_WHATSAPP not set — skipping Jeff notification');
    return null;
  }

  // Step 1 — Send text alert to Jeff
  var alertText = 'Hi Jeff, Kino has flagged a new enquiry for you.\n\n'
    + 'Customer: ' + customerName + '\n'
    + 'WA: +' + customerWaId + '\n\n'
    + 'They sent an equipment list. Please follow up directly.\n\n'
    + (lastMessage && !fileUrl ? 'Details: "' + lastMessage.substring(0, 200) + '"' : '');

  await sendMessage(jeffNumber, alertText);

  // Step 2 — Forward the actual document to Jeff if we have a URL
  if (fileUrl) {
    console.log('[WATI] Forwarding document to Jeff:', filename || 'document');
    await sendFile(jeffNumber, fileUrl, filename || 'equipment-list.pdf', 'Equipment list from ' + customerName);
  }

  console.log('[WATI] Jeff notified for customer ' + customerWaId);
  return true;
}

module.exports = { sendMessage, sendFile, assignToTeam, sendTemplate, notifyJeff };
