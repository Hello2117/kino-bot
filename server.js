require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');
const { sendMessage, assignToTeam, notifyJeff } = require('./handlers/watiHandler');
const { markHandedOff } = require('./utils/sessionStore');
const { notifyHandoff } = require('./handlers/notificationHandler');

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

    var waId = body.waId || body.senderWaId;
    var name = body.senderName || body.name || 'Customer';
    var type = body.type || (body.message && body.message.type);
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

    // Text messages
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

    // Image messages
    if (type === 'image') {
      console.log('[WATI] Image payload:', JSON.stringify(body).substring(0, 600));
      var imageUrl = body.data || null;
      var caption = body.text || body.caption || '';
      console.log('[KINO] Image from ' + waId + ' | URL found:', !!imageUrl, '| caption:', caption);
      await handleIncomingMessage(waId, caption || '[Image sent by customer]', name, imageUrl);
      return;
    }

    // Document messages — auto handoff to Jeff
    if (type === 'document') {
      var filename = (body.document && body.document.filename)
        || body.fileName || body.filename || 'document';
      console.log('[KINO] Document from ' + waId + ':', filename);

      var docReply = 'I have received your document (' + filename + '). '
        + 'I will pass this to Jeff from our team who will review it and get back to you with a detailed quote. Sit tight!';

      await sendMessage(waId, docReply);
      markHandedOff(waId);

      await Promise.all([
        assignToTeam(waId),
        notifyJeff(name, waId, '[Document received: ' + filename + ']'),
        notifyHandoff(waId, name, '[Document: ' + filename + ']', docReply),
      ]);
      return;
    }

    console.log('[KINO] Unsupported message type ignored:', type);

  } catch (err) {
    console.error('[KINO] Webhook error:', err.message);
  }
});

app.post('/admin/resume-bot', (req, res) => {
  var body = req.body;
  if (body.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!body.waId) return res.status(400).json({ error: 'waId required' });
  resumeBot(body.waId);
  console.log('[KINO] Bot resumed for ' + body.waId);
  res.json({ success: true });
});

app.get('/admin/stats', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ activeSessions: getSessionCount(), uptime: Math.floor(process.uptime()) + 's', timestamp: new Date().toISOString() });
});

var PORT = process.env.PORT || 3000;

app.get('/admin/unblock/:waId', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  await sb.from('kino_sessions').delete().eq('wa_id', req.params.waId);
  res.json({ success: true, message: req.params.waId + ' unblocked' });
});

app.listen(PORT, function() {
  console.log('\nKINO is live on port ' + PORT);
  console.log('WATI webhook : POST /webhook/wati');
  console.log('Admin        : POST /admin/resume-bot');
  console.log('Health check : GET  /\n');
});
