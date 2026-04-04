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
    console.log('[WATI] Payload keys:', Object.keys(body).join(', '));
    console.log('[WATI] Full payload:', JSON.stringify(body).substring(0, 300));

    const waId = body.waId || body.senderWaId;
    const text = body.text || (body.message && body.message.text);
    const name = body.senderName || body.name || 'Customer';
    const type = body.type || (body.message && body.message.type);
    const msgId = body.id || body.messageId || body.wamid || (body.message && body.message.id);

    if (!waId || type !== 'text' || !text) return;

    // Deduplicate — ignore if same message ID seen before
    if (msgId && processed.has(msgId)) {
      console.log('[KINO] Duplicate message ignored:', msgId);
      return;
    }
    if (msgId) processed.add(msgId);

    // Only process if not our own message
    if (body.isOwner || body.owner || body.fromMe) {
      console.log('[KINO] Ignoring own outgoing message');
      return;
    }

    await handleIncomingMessage(waId, text, name);
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
