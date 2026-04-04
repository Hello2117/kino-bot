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

module.exports = { sendMessage, assignToTeam, sendTemplate };
