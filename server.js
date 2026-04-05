require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { sendMessage, notifyJeff } = require('./handlers/watiHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');

const app = express();
app.use(express.json());

// Deduplication cache
const processed = new Set();

// Debounce store — holds pending messages per customer
// Key: waId, Value: { timer, messages: [], name }
const debounceStore = new Map();
const DEBOUNCE_MS = 4000; // Wait 4 seconds after last message before responding

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

// Debounced message handler
// Accumulates messages for DEBOUNCE_MS then fires once with combined text
function debounceMessage(waId, text, name, imageUrl) {
  var existing = debounceStore.get(waId);

  if (existing) {
    // Cancel previous timer
    clearTimeout(existing.timer);
    // Append new message to accumulated list
    existing.messages.push(text);
    if (imageUrl) existing.imageUrl = imageUrl;
  } else {
    existing = { messages: [text], name: name, imageUrl: imageUrl };
    debounceStore.set(waId, existing);
  }

  // Set new timer
  existing.timer = setTimeout(async function() {
    debounceStore.delete(waId);

    // Combine all accumulated messages into one
    var combined = existing.messages.join('\n');
    var msgCount = existing.messages.length;

    if (msgCount > 1) {
      console.log('[KINO] Debounced ' + msgCount + ' messages from ' + waId + ' into one');
    }

    try {
      await handleIncomingMessage(waId, combined, existing.name, existing.imageUrl);
    } catch(err) {
      console.error('[KINO] handleIncomingMessage error:', err.message);
    }
  }, DEBOUNCE_MS);
}

async function handleStaffMessage(waId, text, name) {
  var lower = text.toLowerCase().trim();

  // Unblock a customer
  if (lower.startsWith('unblock ')) {
    var targetNumber = text.split(' ')[1].trim();
    try {
      var sb = require('@supabase/supabase-js')
        .createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
      await sb.from('kino_sessions').delete().eq('wa_id', targetNumber);
      await sendMessage(waId, 'Done — ' + targetNumber + ' has been unblocked. Kino is active again for this customer.');
    } catch(e) {
      await sendMessage(waId, 'Error unblocking ' + targetNumber + ': ' + e.message);
    }
    return;
  }

  // Resume bot for a customer
  if (lower.startsWith('resume ')) {
    var targetNumber = text.split(' ')[1].trim();
    var { resumeBot } = require('./utils/sessionStore');
    await resumeBot(targetNumber);
    await sendMessage(waId, 'Done — Kino resumed for ' + targetNumber);
    return;
  }

  // Check session status
  if (lower.startsWith('status ')) {
    var targetNumber = text.split(' ')[1].trim();
    var sb = require('@supabase/supabase-js')
      .createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    var result = await sb.from('kino_sessions').select('*').eq('wa_id', targetNumber).single();
    if (result.data) {
      var session = result.data;
      var form    = JSON.parse(session.form || '{}');
      await sendMessage(waId,
        'Session for ' + targetNumber + ':\n'
        + 'Handed off: ' + session.handed_off + '\n'
        + 'Job: ' + (form.jobName || 'not set') + '\n'
        + 'Shoot date: ' + (form.shootingDate || 'not set') + '\n'
        + 'Equipment: ' + (form.equipmentList || 'not set') + '\n'
        + 'Messages: ' + (JSON.parse(session.messages || '[]').length) + ' in history'
      );
    } else {
      await sendMessage(waId, 'No session found for ' + targetNumber);
    }
    return;
  }

  // Help menu
  if (lower === 'help' || lower === 'kino help') {
    await sendMessage(waId,
      'Kino Staff Commands:\n\n'
      + 'unblock [number] — Remove handoff block for a customer\n'
      + 'resume [number] — Resume Kino for a customer\n'
      + 'status [number] — View customer session details\n\n'
      + 'Example: unblock 60123456789'
    );
    return;
  }

  // Default — staff messages are ignored by Kino
  console.log('[KINO] Staff message ignored (not a command):', text.substring(0, 60));
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

// Staff number whitelist — loaded from env var
var STAFF_NUMBERS = (process.env.STAFF_NUMBERS || '')
  .split(',')
  .map(function(n) { return n.trim(); })
  .filter(Boolean);

function isStaff(waId) {
  return STAFF_NUMBERS.includes(waId);
}

    // ── Text messages — debounced ─────────────────────────────────────────
    if (type === 'text') {
      var text = extractText(body);
      if (!text) {
        console.log('[KINO] Could not extract text:', JSON.stringify(body).substring(0, 200));
        return;
      }
      console.log('[KINO] Text from ' + waId + ': "' + text.substring(0, 80) + '" (debouncing...)');
if (type === 'text') {
      var text = extractText(body);
      if (!text) return;

      // Staff commands
      if (isStaff(waId)) {
        console.log('[KINO] Staff message from ' + waId + ': "' + text.substring(0, 60) + '"');
        await handleStaffMessage(waId, text, name);
        return;
      }

      console.log('[KINO] Text from ' + waId + ': "' + text.substring(0, 80) + '" (debouncing...)');
      debounceMessage(waId, text, name, null);
      return;
    }
      debounceMessage(waId, text, name, null);
      return;
    }

    // ── Image messages — debounced ────────────────────────────────────────
    if (type === 'image') {
      console.log('[WATI] Image payload:', JSON.stringify(body).substring(0, 400));
      var imageUrl = body.data || null;
      var caption  = body.text || body.caption || '';
      console.log('[KINO] Image from ' + waId + ' | URL found:', !!imageUrl);
      debounceMessage(waId, caption || '[Image sent by customer]', name, imageUrl);
      return;
    }

    // ── Document — notify Jeff immediately, no debounce needed ───────────
    if (type === 'document') {
      var filename = (body.document && body.document.filename)
        || body.fileName || body.filename || null;
      var fileUrl  = body.data || body.fileUrl || body.url || null;

      console.log('[KINO] Document from ' + waId + ' | file:', filename || 'unknown');

      var docReply = 'Thank you for sending your equipment list. '
        + 'I have forwarded it to our team and they will be in touch with you shortly.';
      await sendMessage(waId, docReply);
      await notifyJeff(name, waId, null, fileUrl, filename);

      await handleIncomingMessage(
        waId,
        '[Customer sent their equipment list as a document. '
        + 'You have acknowledged it and forwarded to Jeff. '
        + 'Continue the conversation — ask if they have any other questions.]',
        name
      );
      return;
    }

    console.log('[KINO] Unsupported type ignored:', type);

  } catch (err) {
    console.error('[KINO] Webhook error:', err.message);
  }
});

// Admin: unblock a number
app.get('/admin/unblock/:waId', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    var sb = require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    await sb.from('kino_sessions').delete().eq('wa_id', req.params.waId);
    console.log('[KINO] Unblocked ' + req.params.waId);
    res.json({ success: true, message: req.params.waId + ' unblocked' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: resume bot
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
  console.log('Debounce     : ' + DEBOUNCE_MS + 'ms');
  console.log('Unblock      : GET  /admin/unblock/:waId?secret=xxx');
  console.log('Resume bot   : POST /admin/resume-bot');
  console.log('Health check : GET  /\n');
});
