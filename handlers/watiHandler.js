const axios = require('axios');

const WATI_BASE_URL = process.env.WATI_BASE_URL;
const WATI_API_KEY  = process.env.WATI_API_KEY;

const wati = axios.create({
  baseURL: WATI_BASE_URL,
  headers: {
    'Authorization': 'Bearer ' + WATI_API_KEY,
  },
});

async function sendMessage(waId, message) {
  try {
    const res = await wati.post(
      '/api/v1/sendSessionMessage/' + waId,
      'messageText=' + encodeURIComponent(message),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return res.data;
  } catch (err) {
    console.error('[WATI] sendMessage error:', err.response?.data || err.message);
    return null;
  }
}

async function assignToTeam(waId) {
  try {
    const res = await wati.post('/api/v1/assignConversation/' + waId, { assignedTo: null });
    return res.data;
  } catch (err) {
    console.error('[WATI] assignToTeam error:', err.response?.data || err.message);
    return null;
  }
}

async function sendTemplate(waId, templateName, parameters) {
  if (!parameters) parameters = [];
  try {
    const res = await wati.post('/api/v1/sendTemplateMessage', {
      whatsappNumber: waId,
      template_name: templateName,
      broadcast_name: templateName,
      parameters: parameters.map(function(value) { return { name: 'text', value: value }; }),
    });
    return res.data;
  } catch (err) {
    console.error('[WATI] sendTemplate error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { sendMessage, assignToTeam, sendTemplate };
