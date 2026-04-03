// server.js
// KINO — WhatsApp AI Rental Assistant
// TWENTYONESEVENTEEN Cinema Equipment Rental
//
// Message flow:
//   Customer → Meta Cloud API → Respond.io → POST /webhook/respond → KINO → Respond.io API → Customer

require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');

const app = express();
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:   'KINO is live 🎬',
    service:  'TWENTYONESEVENTEEN WhatsApp Bot',
    channel:  'Meta Cloud API via Respond.io',
    sessions: getSessionCount(),
    uptime:   Math.floor(process.uptime()) + 's',
  });
});

// ── Respond.io Webhook — incoming WhatsApp messages ───────────────────────────
// Set this URL in Respond.io: Settings → Integrations → Webhooks → Add
// URL: https://your-app.railway.app/webhook/respond
// Events: contact.message.created (inbound messages only)
//
// Respond.io webhook payload shape:
// {
//   "event": "contact.message.created",
//   "contact": { "phone": "+60123456789", "name": "Ahmad" },
//   "message": { "type": "text", "text": "Hello" },
//   "channel": { "id": 12345 }
// }

app.post('/webhook/respond', async (req, res) => {
  res.sendStatus(200); // Ack immediately — Respond.io retries on timeout

  try {
    const body    = req.body;
    const event   = body.event;

    // Only handle inbound customer messages
    if (event !== 'contact.message.created') return;

    const contact = body.contact || {};
    const message = body.message || {};

    // Skip non-text messages (images, audio, stickers etc.)
    if (message.type !== 'text' || !message.text) {
      console.log(`[KINO] Skipping non-text message (type: ${message.type})`);
      return;
    }

    // Normalise phone: strip leading + and spaces → "60123456789"
    const rawPhone = contact.phone || '';
    const waId     = rawPhone.replace(/^\+/, '').replace(/\s/g, '');
    const name     = contact.name || 'Customer';
    const text     = message.text;

    if (!waId || !text) return;

    await handleIncomingMessage(waId, text, name);

  } catch (err) {
    console.error('[KINO] Webhook error:', err.message);
  }
});

// ── Meta Cloud API Webhook Verification ──────────────────────────────────────
// Meta calls this GET endpoint to verify your webhook when you set it up.
// Required even though messages come via Respond.io — Meta needs to verify
// the webhook URL you entered in the Meta Developer App.
// VERIFY_TOKEN is any string you set in Meta + in your .env

app.get('/webhook/meta', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('[Meta] Webhook verified ✅');
    return res.status(200).send(challenge);
  }
  console.warn('[Meta] Webhook verification failed — token mismatch');
  res.sendStatus(403);
});

// ── Admin: Resume bot after human handoff ────────────────────────────────────
// POST /admin/resume-bot  Body: { "waId": "60123456789", "secret": "..." }
app.post('/admin/resume-bot', (req, res) => {
  const { waId, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!waId) return res.status(400).json({ error: 'waId required' });
  resumeBot(waId);
  console.log(`[KINO] Bot resumed for ${waId}`);
  res.json({ success: true, message: `Bot resumed for ${waId}` });
});

// ── Admin: Stats ──────────────────────────────────────────────────────────────
app.get('/admin/stats', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    activeSessions: getSessionCount(),
    uptime:         Math.floor(process.uptime()) + 's',
    timestamp:      new Date().toISOString(),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎬 KINO is live on port ${PORT}`);
  console.log(`📡 Respond.io webhook : POST /webhook/respond`);
  console.log(`🔐 Meta verification  : GET  /webhook/meta`);
  console.log(`🔑 Admin endpoint     : POST /admin/resume-bot`);
  console.log(`❤️  Health check       : GET  /\n`);
});
