require('dotenv').config();
const express = require('express');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { sendMessage, notifyJeff, sendDocument } = require('./handlers/whatsappHandler');
const { resumeBot, getSessionCount } = require('./utils/sessionStore');
const { loadCatalog, getCatalogCount, reloadCatalog, getCatalogAge } = require('./utils/booqableCatalog');
const { transcribeAudio }               = require('./utils/transcriber');
const { startScheduler }                = require('./utils/scheduler');
const { processIGWebhook }              = require('./handlers/igMessageHandler');
const { processChatwootWebhook }        = require('./handlers/chatwootHandler');

const app = express();
app.use(express.json());

// Load Booqable catalog at startup
loadCatalog().then(function() {
  console.log("[KINO] Catalog loaded: " + getCatalogCount() + " products");
});

// Start scheduler for follow-ups and reminders
startScheduler();

// Deduplication cache
const processed = new Set();

// Debounce store
const debounceStore = new Map();
const DEBOUNCE_MS = 4000;

app.get('/', (req, res) => {
  res.json({
    status:    'KINO is live',
    channel:   'Meta Cloud API',
    sessions:  getSessionCount(),
    catalog:   getCatalogCount() + ' products (refreshed ' + getCatalogAge() + ')',
    uptime:    Math.floor(process.uptime()) + 's',
  });
});

function extractText(body) {
  if (body.text && typeof body.text === 'string' && body.text.trim()) {
    return body.text.trim();
  }
  if (body.message && body.message.text) return body.message.text.trim();
  if (body.message && body.message.conversation) return body.message.conversation.trim();
  return null;
}

function debounceMessage(waId, text, name, imageUrl) {
  var existing = debounceStore.get(waId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(text);
    if (imageUrl) existing.imageUrl = imageUrl;
  } else {
    existing = { messages: [text], name: name, imageUrl: imageUrl };
    debounceStore.set(waId, existing);
  }
  existing.timer = setTimeout(async function() {
    debounceStore.delete(waId);
    var combined = existing.messages.join('\n');
    if (existing.messages.length > 1) {
      console.log('[KINO] Debounced ' + existing.messages.length + ' messages from ' + waId);
    }
    try {
      await handleIncomingMessage(waId, combined, existing.name, existing.imageUrl);
    } catch(err) {
      console.error('[KINO] handleIncomingMessage error:', err.message);
    }
  }, DEBOUNCE_MS);
}

// ── Meta Cloud API Webhook Verification ──────────────────────────────
app.get('/webhook/whatsapp', function(req, res) {
  var mode      = req.query['hub.mode'];
  var token     = req.query['hub.verify_token'];
  var challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[WA] Webhook verified');
    return res.status(200).send(challenge);
  }
  console.warn('[WA] Webhook verification failed');
  res.sendStatus(403);
});

// ── Meta Cloud API Webhook Events ─────────────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200);
  try {
    var body = req.body;
    if (!body.object || body.object !== 'whatsapp_business_account') return;

    var entries = body.entry || [];
    for (var ei = 0; ei < entries.length; ei++) {
      var entry   = entries[ei];
      var changes = entry.changes || [];
      for (var ci = 0; ci < changes.length; ci++) {
        var change = changes[ci];
        if (change.field !== 'messages') continue;
        var value    = change.value || {};
        var messages = value.messages || [];
        var contacts = value.contacts || [];

        for (var mi = 0; mi < messages.length; mi++) {
          var msg   = messages[mi];
          var waId  = msg.from;
          var name  = (contacts[0] && contacts[0].profile && contacts[0].profile.name) || 'Customer';
          var type  = msg.type;
          var msgId = msg.id;

          if (!waId) continue;

          if (msgId) {
            if (processed.has(msgId)) { console.log('[KINO] Duplicate ignored:', msgId); continue; }
            processed.add(msgId);
            setTimeout(function() { processed.delete(msgId); }, 3600000);
          }

          console.log('[WA] Message from', waId, '| type:', type, '| name:', name);

          // Text
          if (type === 'text') {
            var text = msg.text && msg.text.body;
            if (!text) continue;
            console.log('[KINO] Text from ' + waId + ': "' + text.substring(0, 80) + '" (debouncing...)');
            debounceMessage(waId, text, name, null);
            continue;
          }

          // Image
          if (type === 'image') {
            var imageMediaId = msg.image && msg.image.id;
            var caption      = (msg.image && msg.image.caption) || '';
            var imageUrl     = imageMediaId
              ? 'https://graph.facebook.com/' + (process.env.META_API_VERSION || 'v19.0') + '/' + imageMediaId
              : null;
            debounceMessage(waId, caption || '[Image sent by customer]', name, imageUrl);
            continue;
          }

          // Audio
          if (type === 'audio') {
            var audioMediaId = msg.audio && msg.audio.id;
            var audioUrl2    = audioMediaId
              ? 'https://graph.facebook.com/' + (process.env.META_API_VERSION || 'v19.0') + '/' + audioMediaId
              : null;
            if (!audioUrl2) {
              await sendMessage(waId, "I received a voice message but couldn\'t access the audio. Could you type that out for me?");
              continue;
            }
            var transcript = await transcribeAudio(audioUrl2);
            if (!transcript) {
              await sendMessage(waId, "Sorry, I had trouble understanding that voice message. Could you type it out instead?");
              continue;
            }
            console.log('[KINO] Voice transcript for ' + waId + ': "' + transcript.substring(0, 100) + '"');
            await handleIncomingMessage(waId, '[Voice message transcript: ' + transcript + ']', name);
            continue;
          }

          // Document
          if (type === 'document') {
            var docMediaId = msg.document && msg.document.id;
            var filename   = (msg.document && msg.document.filename) || null;
            var docUrl     = docMediaId
              ? 'https://graph.facebook.com/' + (process.env.META_API_VERSION || 'v19.0') + '/' + docMediaId
              : null;
            var docReply = 'Thank you for sending your equipment list. I have forwarded it to our team and they will be in touch with you shortly.';
            await sendMessage(waId, docReply);
            await notifyJeff(name, waId, null, docUrl, filename);
            await handleIncomingMessage(waId,
              '[Customer sent their equipment list as a document. You have acknowledged it and forwarded to Jeff. Continue the conversation.]',
              name);
            continue;
          }

          console.log('[KINO] Unsupported type ignored:', type);
        }
      }
    }
  } catch(err) {
    console.error('[KINO] WA Webhook error:', err.message);
  }
});

// ── Instagram Webhook Verification ───────────────────────────────────
app.get('/webhook/instagram', function(req, res) {
  var mode      = req.query['hub.mode'];
  var token     = req.query['hub.verify_token'];
  var challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_IG_WEBHOOK_VERIFY_TOKEN) {
    console.log('[IG] Webhook verified');
    return res.status(200).send(challenge);
  }
  console.warn('[IG] Webhook verification failed — token mismatch');
  res.sendStatus(403);
});

// ── Instagram Webhook Events ──────────────────────────────────────────
app.post('/webhook/instagram', function(req, res) {
  res.sendStatus(200);
  try {
    processIGWebhook(req.body);
  } catch(err) {
    console.error('[IG] Webhook error:', err.message);
  }
});

// ── Chatwoot Webhook ─────────────────────────────────────────────────
app.post('/webhook/chatwoot', function(req, res) {
  res.sendStatus(200); // Acknowledge immediately
  try {
    processChatwootWebhook(req.body);
  } catch(err) {
    console.error('[Chatwoot] Webhook error:', err.message);
  }
});

// Admin: force catalog reload
app.post('/admin/reload-catalog', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    var count = await reloadCatalog();
    console.log('[KINO] Catalog force-reloaded: ' + count + ' products');
    res.json({ success: true, products: count, message: 'Catalog reloaded from Booqable' });
  } catch(e) {
    res.status(500).json({ error: e.message });
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
  console.log('WA webhook  : POST /webhook/whatsapp');
  console.log('IG webhook  : POST /webhook/instagram');
  console.log('CW webhook  : POST /webhook/chatwoot');
  console.log('Debounce    : ' + DEBOUNCE_MS + 'ms');
  console.log('Health check: GET  /\n');
});
