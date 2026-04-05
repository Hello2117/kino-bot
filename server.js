require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { sendMessage, notifyJeff } = require('./handlers/watiHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');

const app = express();
app.use(express.json());

const processed = new Set();

app.get('/', (req, res) => {
  res.json({
    status:   'KINO is live',
    channel:  'Meta Cloud API via WATI',
    sessions: getSessionCount(),
    uptime:   Math.floor(process.uptime()) + 's',
  });
});

function extractText(body) {
  if (body.text && typeof body.text === 'string' && body.text.trim()) {
    return body.text.trim();
  }
  if (body.contextInfo && body.contextInfo.quotedMessage) {
    var quoted = body.contextInfo.quotedMessage;
    if (quoted.conversation) return quoted.conversation.trim();
    if (quoted.extendedTextMessage && quoted.extendedTextMessage.text) {
      return quoted.extendedTextMessage.text.trim();
    }
  }
  if (body.replyContextId && body.text) return body.text.trim();
  if (body.message && body.message.text) return body.message.text.trim();
  if (body.message && body.message.conversation) return body.message.conversation.trim();
  if (body.message && body.message.extendedTextMessage) {
    return body.message.extendedTextMessage.text.trim();
  }
  return null;
}

app.post('/webhook/wati', async (req, res) => {
  res.sendStatus(200);
  try {
    var body = req.body;
    console.log('[WATI] eventType:', body.eventType, '| type:', body.type);

    if (body.eventType && body.eventType !== 'message') {
      console.log('[KINO] Ignoring event:', body.eventType);
      return;
    }
    if (body.owner === true || body.isOwner === true || body.fromMe === true) {
      console.log('[KINO] Ignoring own outgoing message');
      return;
    }

    var waId  = body.waId || body.senderWaId;
    var name  = body.senderName || body.name || 'Customer';
    var type  = body.type || (body.message && body.message.type);
    var msgId = body.id || body.messageId || body.wamid;

    if (!waId) return;

    if (msgId) {
      if (processed.has(msgId)) {
        console.log('[KINO] Duplicate ignored:', msgId);
        return;
      }
      processed.add(msgId);
      setTimeout(function() { processed.delete(msgId); }, 3600000);
    }

    // ── Text messages ─────────────────────────────────────────────────────
    if (type === 'text') {
      var text = extractText(body);
      if (!text) {
        console.log('[KINO] Could not extract text — payload:', JSON.stringify(body).substring(0, 300));
        return;
      }
      console.log('[KINO] Text from ' + waId + ': "' + text.substring(0, 80) + '"');
      await handleIncomingMessage(waId, text, name);
      return;
    }

    // ── Image messages ────────────────────────────────────────────────────
    if (type === 'image') {
      console.log('[WATI] Image payload:', JSON.stringify(body).substring(0, 400));
      var imageUrl = body.data || null;
      var caption  = body.text || body.caption || '';
      console.log('[KINO] Image from ' + waId + ' | URL found:', !!imageUrl);
      await handleIncomingMessage(waId, caption || '[Image sent by customer]', name, imageUrl);
      return;
    }

    // ── Document messages — notify Jeff silently, Kino keeps talking ──────
    if (type === 'document') {
      var filename = (body.document && body.document.filename)
        || body.fileName || body.filename || 'document';
      var fileUrl  = body.data || body.fileUrl || body.url || null;

      console.log('[KINO] Document from ' + waId + ' | file:', filename, '| url:', !!fileUrl);

      // Reply to customer — Kino stays in the conversation (no handoff)
      var docReply = 'Thank you for sending your equipment list. I have forwarded it to our team and they will be in touch with you shortly.';
      await sendMessage(waId, docReply);

      // Notify Jeff silently with text alert + forward the actual file
      await notifyJeff(name, waId, null, fileUrl, filename);

      // Pass document info into conversation context so Kino knows it was received
      await handleIncomingMessage(waId, '[Customer sent a document: ' + filename + '. You have acknowledged receipt and notified the team. Continue the conversation normally.]', name);
      return;
    }

    console.log('[KINO] Unsupported message type ignored:', type);

  } catch (err) {
    console.error('[KINO] Webhook error:', err.message);
  }
});

// Admin: unblock a number directly
app.get('/admin/unblock/:waId', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  await sb.from('kino_sessions').delete().eq('wa_id', req.params.waId);
  console.log('[KINO] Unblocked ' + req.params.waId);
  res.json({ success: true, message: req.params.waId + ' unblocked' });
});

// Admin: resume bot after handoff
app.post('/admin/resume-bot', (req, res) => {
  var body = req.body;
  if (body.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!body.waId) return res.status(400).json({ error: 'waId required' });
  resumeBot(body.waId);
  console.log('[KINO] Bot resumed for ' + body.waId);
  res.json({ success: true });
});

// Admin: stats
app.get('/admin/stats', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ activeSessions: getSessionCount(), uptime: Math.floor(process.uptime()) + 's', timestamp: new Date().toISOString() });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('\nKINO is live on port ' + PORT);
  console.log('WATI webhook : POST /webhook/wati');
  console.log('Admin unblock: GET  /admin/unblock/:waId?secret=xxx');
  console.log('Admin resume : POST /admin/resume-bot');
  console.log('Health check : GET  /\n');
});
