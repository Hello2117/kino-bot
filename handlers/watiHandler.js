// handlers/watiHandler.js
// Sends messages back to customers via WATI's API.

const axios = require('axios');

const WATI_BASE_URL = process.env.WATI_BASE_URL;
const WATI_API_KEY  = process.env.WATI_API_KEY;

const wati = axios.create({
  baseURL: WATI_BASE_URL,
  headers: {
    'Authorization': `Bearer ${WATI_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Send a plain text message to a WhatsApp number via WATI.
 * @param {string} waId - Customer's phone number e.g. "60123456789" (no +)
 * @param {string} message - Text to send
 */
async function sendMessage(waId, message) {
  try {
    // WATI send session message endpoint
    const res = await wati.post(`/api/v1/sendSessionMessage/${waId}`, {
      messageText: message,
    });
    return res.data;
  } catch (err) {
    console.error('[WATI] sendMessage error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Assign a conversation to the unassigned queue (triggers staff notification).
 * Call this when KINO hands off to a human.
 * @param {string} waId
 */
async function assignToTeam(waId) {
  try {
    // Unassign from bot — WATI team inbox will pick it up
    const res = await wati.post(`/api/v1/assignConversation/${waId}`, {
      assignedTo: null, // null = back to unassigned pool for team
    });
    return res.data;
  } catch (err) {
    console.error('[WATI] assignToTeam error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Send a template message (for first-contact outside 24hr window).
 * You must create the template in WATI dashboard first.
 * @param {string} waId
 * @param {string} templateName - as registered in WATI
 * @param {Array<string>} parameters - values for template placeholders
 */
async function sendTemplate(waId, templateName, parameters = []) {
  try {
    const res = await wati.post('/api/v1/sendTemplateMessage', {
      whatsappNumber: waId,
      template_name: templateName,
      broadcast_name: templateName,
      parameters: parameters.map(value => ({ name: 'text', value })),
    });
    return res.data;
  } catch (err) {
    console.error('[WATI] sendTemplate error:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { sendMessage, assignToTeam, sendTemplate };
