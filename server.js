require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');

const app = express();
app.use(express.json());

const processed = new Set();

app.get('/', (req, res) => {
  res.json({ status: 'KINO is live 🎬', sessions: getSessionCount(), uptime: Math.floor(process.uptime()) + 's' });
});

app.post('/webhook/wati', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;

    // Log payload type for debugging
    console.log('[WATI] eventType:', body.eventType);

    // Only process incoming customer messages
    if (!body.eventType || body.eventType !== 'message') {
      console.log('[KINO] Ignoring event type:', body.eventType);
      return;
    }

    const waId = body.waId || body.senderWaId;
    const name = body.senderName || body.name || 'Customer';
    const type = body.type || (body.message && body.message.type);
    const msgId = body.id || body.messageId;

    if (!waId) return;

    // Deduplicate
    if (msgId && processed.has(msgId)) {
      console.log('[KINO] Duplicate ignored:', msgId);
      return;
    }
    if (msgId) processed.add(msgId);

    // Handle text messages
    if (type === 'text') {
      const text = body.text || (body.message && body.message.text);
      if (!text) return;
      await handleIncomingMessage(waId, text, name);
      return;
    }

    // Handle image messages
    if (type === 'image') {
      const imageUrl = body.image && body.image.link
        || body.message && body.message.image && body.message.image.link
        || null;

      const caption = body.image && body.image.caption
        || body.message && body.message.image && body.message.image.caption
        || '';

      if (imageUrl) {
        await handleIncomingMessage(waId, caption || '[Image received]', name, imageUrl);
      } else {
        await handleIncomingMessage(waId, '[Customer sent an image]', name);
      }
      return;
    }

    // All other types — acknowledge but don't process
    console.log('[KINO] Unsupported message type:', type);

  } catch (err) {
    console.error('[KINO] Webhook error:', err.message);
  }
});

app.post('/admin/resume-bot', (req, res) => {
  const { waId, secret } = req.body;
  if (secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!waId) return res.status(400).json({ error: 'waId required' });
  resumeBot(waId);
  res.json({ success: true });
});

app.get('/admin/stats', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ activeSessions: getSessionCount(), uptime: Math.floor(process.uptime()) + 's' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🎬 KINO is live on port ' + PORT);
  console.log('📡 WATI webhook : POST /webhook/wati');
  console.log('🔑 Admin        : POST /admin/resume-bot');
  console.log('❤️  Health check : GET  /\n');
});
