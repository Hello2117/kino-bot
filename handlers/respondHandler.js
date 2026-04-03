// handlers/respondHandler.js
// Sends messages and manages conversations via Respond.io API.
// Respond.io sits between Meta Cloud API and your KINO server —
// it handles the team inbox UI while KINO handles the AI.
//
// API docs: https://developers.respond.io/docs
// Base URL: https://api.respond.io/v2

const axios = require('axios');

const RESPOND_API_KEY  = process.env.RESPOND_API_KEY;
const RESPOND_CHANNEL_ID = process.env.RESPOND_CHANNEL_ID; // Your WhatsApp channel ID in Respond.io

const respond = axios.create({
  baseURL: 'https://api.respond.io/v2',
  headers: {
    'Authorization': `Bearer ${RESPOND_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ─────────────────────────────────────────────
// SEND MESSAGE
// ─────────────────────────────────────────────

/**
 * Send a plain text message to a customer via Respond.io.
 * Respond.io routes it through Meta Cloud API → customer's WhatsApp.
 *
 * @param {string} waId    - Customer's phone number e.g. "60123456789" (no +)
 * @param {string} message - Text to send
 */
async function sendMessage(waId, message) {
  try {
    // Respond.io contact identifier uses phone number format
    const res = await respond.post(`/contact/phone:${waId}/message`, {
      channelId: Number(RESPOND_CHANNEL_ID),
      message: {
        type: 'text',
        text: message,
      },
    });
    return res.data;
  } catch (err) {
    console.error('[Respond] sendMessage error:', err.response?.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// ASSIGN TO TEAM (Handoff)
// ─────────────────────────────────────────────

/**
 * Unassign conversation from bot — surfaces in Respond.io team inbox.
 * Staff will see it as unassigned and can pick it up.
 *
 * @param {string} waId - Customer's phone number
 */
async function assignToTeam(waId) {
  try {
    // First get the contact to find their conversation ID
    const contactRes = await respond.get(`/contact/phone:${waId}`);
    const contactId  = contactRes.data?.id;
    if (!contactId) return null;

    // Unassign the conversation — puts it in the unassigned queue in Respond.io
    const res = await respond.patch(`/contact/${contactId}/conversation`, {
      assignee: null,         // null = unassigned
      status: 'open',         // keep open so team can see it
    });
    return res.data;
  } catch (err) {
    console.error('[Respond] assignToTeam error:', err.response?.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND TEMPLATE (for first-contact / re-engagement)
// ─────────────────────────────────────────────

/**
 * Send a pre-approved WhatsApp template message via Respond.io.
 * Templates are created and approved in Meta Business Manager,
 * then available in Respond.io's channel settings.
 *
 * @param {string}   waId         - Customer phone number
 * @param {string}   templateName - Template name as registered in Meta
 * @param {string}   languageCode - e.g. "en" or "ms"
 * @param {Array}    components   - Template variable components
 */
async function sendTemplate(waId, templateName, languageCode = 'en', components = []) {
  try {
    const res = await respond.post(`/contact/phone:${waId}/message`, {
      channelId: Number(RESPOND_CHANNEL_ID),
      message: {
        type:     'template',
        template: {
          name:     templateName,
          language: { code: languageCode },
          components,
        },
      },
    });
    return res.data;
  } catch (err) {
    console.error('[Respond] sendTemplate error:', err.response?.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// ADD NOTE (visible to team only, not customer)
// ─────────────────────────────────────────────

/**
 * Add an internal note to a conversation in Respond.io.
 * Staff see this note in the inbox — customer never sees it.
 * Use this to attach the completed enquiry form to the conversation.
 *
 * @param {string} waId    - Customer phone number
 * @param {string} content - Note content (e.g. formatted form summary)
 */
async function addNote(waId, content) {
  try {
    const contactRes = await respond.get(`/contact/phone:${waId}`);
    const contactId  = contactRes.data?.id;
    if (!contactId) return null;

    const res = await respond.post(`/contact/${contactId}/note`, {
      content,
    });
    return res.data;
  } catch (err) {
    console.error('[Respond] addNote error:', err.response?.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// CREATE / UPDATE CONTACT
// ─────────────────────────────────────────────

/**
 * Upsert a contact in Respond.io.
 * Called when a new customer starts a conversation.
 *
 * @param {string} waId  - Phone number
 * @param {string} name  - Display name from WhatsApp
 */
async function upsertContact(waId, name) {
  try {
    const res = await respond.post('/contact', {
      phone:    `+${waId}`,
      name:     name || 'Customer',
      channel:  Number(RESPOND_CHANNEL_ID),
    });
    return res.data;
  } catch (err) {
    // 409 conflict = contact already exists, that's fine
    if (err.response?.status !== 409) {
      console.error('[Respond] upsertContact error:', err.response?.data || err.message);
    }
    return null;
  }
}

module.exports = { sendMessage, assignToTeam, sendTemplate, addNote, upsertContact };
