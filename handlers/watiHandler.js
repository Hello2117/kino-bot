const axios = require('axios');

const WATI_BASE_URL = process.env.WATI_BASE_URL;
const WATI_API_KEY  = process.env.WATI_API_KEY;

async function sendMessage(waId, message) {
  try {
    console.log('[WATI] Sending to ' + waId + ' via ' + WATI_BASE_URL);
    console.log('[WATI] Key starts with: ' + (WATI_API_KEY ? WATI_API_KEY.substring(0, 20) : 'MISSING'));
    const res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionMessage/' + waId,
      'messageText=' + encodeURIComponent(message),
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      }}
    );
    console.log('[WATI] Send success:', JSON.stringify(res.data).substring(0, 100));
    return res.data;
  } catch (err) {
    console.error('[WATI] sendMessage FAILED');
    console.error('[WATI] Status:', err.response && err.response.status);
    console.error('[WATI] Data:', JSON.stringify(err.response && err.response.data));
    console.error('[WATI] Message:', err.message);
    return null;
  }
}

async function assignToTeam(waId) {
  try {
    const res = await axios.post(
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

async function sendTemplate(waId, templateName, parameters) {
  if (!parameters) parameters = [];
  try {
    const res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendTemplateMessage',
      {
        whatsappNumber: waId,
        template_name: templateName,
        broadcast_name: templateName,
        parameters: parameters.map(function(value) { return { name: 'text', value: value }; }),
      },
      { headers: { 'Authorization': 'Bearer ' + WATI_API_KEY, 'Content-Type': 'application/json' } }
    );
    return res.data;
  } catch (err) {
    console.error('[WATI] sendTemplate error:', err.response && err.response.data || err.message);
    return null;
  }
}

async function notifyJeff(customerName, customerWaId, message) {
  try {
    var jeffNumber = process.env.JEFF_WHATSAPP;
    if (!jeffNumber) {
      console.log('[WATI] JEFF_WHATSAPP not set — skipping Jeff notification');
      return null;
    }
    var alertText = 'Hi Jeff, KINO has flagged a new enquiry for you.\n\n'
      + 'Customer: ' + customerName + '\n'
      + 'WA: +' + customerWaId + '\n\n'
      + 'They sent a custom equipment list. Please follow up directly.\n\n'
      + 'Last message: "' + message.substring(0, 200) + '"';

    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionMessage/' + jeffNumber,
      'messageText=' + encodeURIComponent(alertText),
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      }}
    );
    console.log('[WATI] Jeff notified successfully');
    return res.data;
  } catch (err) {
    console.error('[WATI] notifyJeff error:', err.response && err.response.data || err.message);
    return null;
  }
}

module.exports = { sendMessage, assignToTeam, sendTemplate, notifyJeff };
