require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status:   'KINO is live 🎬',
    service:  'TWENTYONESEVENTEEN WhatsApp Bot',
    channel:  'Meta Cloud API via WATI',
    sessions: getSessionCount(),
    uptime:   Math.floor(process.uptime()) + 's',
  });
});

app.post('/webhook/wati', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const waId = body.waId || body.senderWaId;
    const text = body.text || body.message?.text;
    const name = body.senderName || body.name || 'Customer';
    const type = body.type || body.message?.type;
    if (!waId || type !== 'text' || !text) return;
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
  console.log(`\n🎬 KINO is live on port ${PORT}`);
  console.log(`📡 WATI webhook : POST /webhook/wati`);
  console.log(`🔑 Admin        : POST /admin/resume-bot`);
  console.log(`❤️  Health check : GET  /\n`);
});