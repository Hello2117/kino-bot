require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');

const app = express();
app.use(express.json());

// Deduplication cache — prevents processing the same message twice
const processed = new Set();

// Health check
app.get('/', (req, res) => {
  res.json({
    status:   'KINO is live',
    channel:  'Meta Cloud API via WATI',
    sessions: getSessionCount(),
    uptime:   Math.floor(process.uptime()) + 's',
  });
});

// WATI Webhook
// Set in WATI Dashboard -> Settings -> Webhooks
// URL: https://your-app.railway.app/webhook/wati
app.post('/webhook/wati', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    // Log event type for debugging
    console.log('[WATI] eventType:', body.eventType, '| type:', body.type);

    // Only process incoming customer messages — ignore all other events
    // (read receipts, delivery status, sent messages etc.)
    if (body.eventType && body.eventType !== 'message') {
      console.log('[KINO] Ignoring event:', body.eventType);
      return;
    }

    // Ignore outgoing messages sent by KINO
    if (body.owner === true || body.isOwner === true || body.fromMe === true) {
      console.log('[KINO] Ignoring own outgoing message');
      return;
    }

    const waId = body.waId || body.senderWaId;
    const name = body.senderName || body.name || 'Customer';
    const type = body.type || (body.message && body.message.type);
    const msgId = body.id || body.messageId || body.wamid;

    if (!waId) return;

    // Deduplicate — skip if we've seen this message ID before
    if (msgId) {
      if (processed.has(msgId)) {
        console.log('[KINO] Duplicate ignored:', msgId);
        return;
      }
      processed.add(msgId);
      // Clean up old IDs after 1 hour to prevent memory leak
      setTimeout(function() { processed.delete(msgId); }, 3600000);
    }

    // Handle text messages
    if (type === 'text') {
      const text = body.text || (body.message && body.message.text);
      if (!text) return;
      console.log('[KINO] Text from ' + waId + ': "' + text.substring(0, 80) + '"');
      await handleIncomingMessage(waId, text, name);
      return;
    }

    // Handle image messages
    if (type === 'image') {
      // Log full image payload so we can identify the correct URL field
      console.log('[WATI] Image payload:', JSON.stringify(body).substring(0, 600));

      // Try all known WATI image URL field locations
      const imageUrl = (body.image && (body.image.link || body.image.url || body.image.mediaUrl))
        || (body.message && body.message.image && (body.message.image.link || body.message.image.url))
        || body.mediaUrl
        || body.fileUrl
        || null;

      const caption = (body.image && body.image.caption)
        || (body.message && body.message.image && body.message.image.caption)
        || body.caption
        || '';

      console.log('[KINO] Image from ' + waId + ' | URL found:', !!imageUrl, '| caption:', caption);
      await handleIncomingMessage(waId, caption || '[Image]', name, imageUrl);
      return;
    }

    // Handle document/file messages
    if (type === 'document') {
      const filename = (body.document && body.document.filename) || 'document';
      console.log('[KINO] Document from ' + waId + ':', filename);
      await handleIncomingMessage(waId, '[Customer sent a document: ' + filename + ']', name);
      return;
    }

    // All other types — log and ignore
    console.log('[KINO] Unsupported message type ignored:', type);

  } catch (err) {
    console.error('[KINO] Webhook error:', err.message);
  }
});

// Admin: Resume bot after human handoff
// POST /admin/resume-bot  Body: { "waId": "60123456789", "secret": "..." }
app.post('/admin/resume-bot', (req, res) => {
  const { waId, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!waId) return res.status(400).json({ error: 'waId required' });
  resumeBot(waId);
  console.log('[KINO] Bot resumed for ' + waId);
  res.json({ success: true, message: 'Bot resumed for ' + waId });
});

// Admin: Stats
app.get('/admin/stats', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    activeSessions: getSessionCount(),
    uptime:         Math.floor(process.uptime()) + 's',
    timestamp:      new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('\nKINO is live on port ' + PORT);
  console.log('WATI webhook : POST /webhook/wati');
  console.log('Admin        : POST /admin/resume-bot');
  console.log('Health check : GET  /\n');
});
