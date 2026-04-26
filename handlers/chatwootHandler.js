// handlers/chatwootHandler.js
// Receives incoming message webhooks from Chatwoot
// Processes through KINO/Claude
// Replies back via Chatwoot Messages API
//
// Env vars required:
//   CHATWOOT_URL        — https://chatwoot-production-48b7.up.railway.app
//   CHATWOOT_API_TOKEN  — vXfm6KsomanSUDxeE2vGy4Kj
//   CHATWOOT_ACCOUNT_ID — 161699

const axios  = require('axios');
const path   = require('path');
const fs     = require('fs');
const { askKino, detectsReadyToRent } = require('./claudeHandler');
const { notifyHandoff, notifyReadyToRent } = require('./notificationHandler');
const {
  getSession,
  addMessage,
} = require('../utils/sessionStore');

var CHATWOOT_URL        = process.env.CHATWOOT_URL        || 'https://chatwoot-production-48b7.up.railway.app';
var CHATWOOT_API_TOKEN  = process.env.CHATWOOT_API_TOKEN  || 'vXfm6KsomanSUDxeE2vGy4Kj';
var CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '161699';

// ─────────────────────────────────────────────
// CHATWOOT API — send reply to conversation
// ─────────────────────────────────────────────

async function sendChatwootReply(conversationId, message) {
  try {
    var cleaned = message.replace(/\*\*([^*]+)\*\*/g, '*$1*');
    var url = CHATWOOT_URL + '/api/v1/accounts/' + CHATWOOT_ACCOUNT_ID
      + '/conversations/' + conversationId + '/messages';

    var res = await axios.post(url,
      {
        content:      cleaned,
        message_type: 'outgoing',
        private:      false,
      },
      {
        headers: {
          'api_access_token': CHATWOOT_API_TOKEN,
          'Content-Type':     'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('[Chatwoot] Reply sent to conversation', conversationId,
      '| msg id:', res.data && res.data.id);
    return res.data;
  } catch(err) {
    console.error('[Chatwoot] sendChatwootReply error:',
      err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SYSTEM PROMPT ROUTING
// Routes to correct system prompt based on inbox name
// ─────────────────────────────────────────────

function getSystemPrompt(inboxName) {
  var name = (inboxName || '').toLowerCase();
  if (name.includes('studio')) {
    try {
      return fs.readFileSync(
        path.join(__dirname, '../prompts/kino_studio_system.txt'), 'utf8'
      );
    } catch(e) {
      console.error('[Chatwoot] Could not load kino_studio_system.txt:', e.message);
    }
  }
  // Default — rentals
  return null; // null = use default kino_system.txt in askKino
}

// ─────────────────────────────────────────────
// SESSION STORE — uses Supabase via sessionStore.js
// Session key format: ig:{conversationId}
// Keeps IG sessions separate from WA sessions
// ─────────────────────────────────────────────

var cwProcessed = new Set();
var cwDebounce  = new Map();
var DEBOUNCE_MS = 3000;

function igSessionKey(conversationId) {
  return 'ig:' + String(conversationId);
}

// ─────────────────────────────────────────────
// GREETING
// ─────────────────────────────────────────────

var RENTALS_GREETING = 'Hey! I\'m Kino, the rental assistant for TWENTYONESEVENTEEN 🎬\n\nI can help with gear recommendations, pricing, availability, and putting together a quote for your shoot.\n\nWhat are you working on?';

var STUDIO_GREETING = 'Hey! I\'m Kino, the booking assistant for 2117 Studio 🎬\n\nI can help with studio rates, availability, bookings, and any production questions you have.\n\nWhat\'s the shoot?';

function getGreeting(inboxName) {
  var name = (inboxName || '').toLowerCase();
  return name.includes('studio') ? STUDIO_GREETING : RENTALS_GREETING;
}

// ─────────────────────────────────────────────
// PROCESS SINGLE MESSAGE
// ─────────────────────────────────────────────

async function processChatwootMessage(conversationId, text, senderName, inboxName, accountId) {
  if (!text || !text.trim()) return;
  var trimmed = text.trim();
  var lower   = trimmed.toLowerCase();

  var history    = await getSession(igSessionKey(conversationId));
  var isGreeting = ['hi', 'hello', 'hey', 'start', 'hai', 'alo'].some(function(g) {
    return lower === g;
  });

  // New conversation greeting
  if (history.length === 0 && isGreeting) {
    var greeting = getGreeting(inboxName);
    await addMessage(igSessionKey(conversationId), 'user', trimmed);
    await addMessage(igSessionKey(conversationId), 'assistant', greeting);
    await sendChatwootReply(conversationId, greeting);
    return;
  }

  var systemPromptOverride = getSystemPrompt(inboxName);

  console.log('[Chatwoot] Processing | conv:', conversationId,
    '| inbox:', inboxName, '| from:', senderName,
    '| text:', trimmed.substring(0, 60));

  // Ask KINO
  var result      = await askKino(history, trimmed, null, systemPromptOverride);
  var rawReply    = result.reply;
  var readyToRent = detectsReadyToRent(rawReply);
  var needsHandoff = rawReply.includes('[HUMAN_HANDOFF]');

  // Strip signal tags
  var reply = rawReply
    .replace(/\[HUMAN_HANDOFF\]/g, '')
    .replace(/\[READY_TO_RENT\]/g, '')
    .trim();

  // Save to Supabase session
  await addMessage(igSessionKey(conversationId), 'user', trimmed);
  await addMessage(igSessionKey(conversationId), 'assistant', reply);

  // Send reply via Chatwoot API
  await sendChatwootReply(conversationId, reply);

  // Fire signals
  if (needsHandoff) {
    console.log('[Chatwoot] HUMAN_HANDOFF signal | conv:', conversationId);
    notifyHandoff(conversationId, senderName, trimmed, reply).catch(function(e) {
      console.error('[Chatwoot] HUMAN_HANDOFF notify error:', e.message);
    });
  }

  if (readyToRent) {
    console.log('[Chatwoot] READY_TO_RENT signal | conv:', conversationId);
    notifyReadyToRent(conversationId, senderName, inboxName, null).catch(function(e) {
      console.error('[Chatwoot] READY_TO_RENT notify error:', e.message);
    });
  }
}

// ─────────────────────────────────────────────
// DEBOUNCED ENTRY POINT
// ─────────────────────────────────────────────

function handleChatwootMessage(conversationId, text, senderName, inboxName, accountId) {
  // Async wrapper — Supabase session store requires await
  var key      = String(conversationId);
  var existing = cwDebounce.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(text);
  } else {
    existing = { messages: [text], senderName: senderName, inboxName: inboxName };
    cwDebounce.set(key, existing);
  }

  existing.timer = setTimeout(async function() {
    cwDebounce.delete(key);
    var combined = existing.messages.join('\n');
    try {
      await processChatwootMessage(
        conversationId, combined,
        existing.senderName, existing.inboxName, accountId
      );
    } catch(e) {
      console.error('[Chatwoot] processChatwootMessage error:', e.message);
    }
  }, DEBOUNCE_MS);
}

// ─────────────────────────────────────────────
// WEBHOOK PROCESSOR
// Called from server.js with raw Chatwoot webhook body
// ─────────────────────────────────────────────

function processChatwootWebhook(body) {
  // Only process incoming customer messages
  if (body.event !== 'message_created') return;
  if (body.message_type !== 'incoming') return;  // skip outgoing/bot messages
  if (!body.content || !body.content.trim()) return;

  var conversationId = body.conversation && body.conversation.id;
  var msgId          = body.id;
  var text           = body.content;
  var senderName     = (body.sender && body.sender.name) || 'Customer';
  var inboxName      = (body.inbox && body.inbox.name) || '';
  var accountId      = body.account && body.account.id;

  if (!conversationId) return;

  // Deduplication
  if (msgId) {
    var dedupKey = 'cw:' + msgId;
    if (cwProcessed.has(dedupKey)) {
      console.log('[Chatwoot] Duplicate ignored:', msgId);
      return;
    }
    cwProcessed.add(dedupKey);
    setTimeout(function() { cwProcessed.delete(dedupKey); }, 3600000);
  }

  console.log('[Chatwoot] Incoming | conv:', conversationId,
    '| inbox:', inboxName, '| from:', senderName,
    '| text:', (text || '').substring(0, 60));

  handleChatwootMessage(conversationId, text, senderName, inboxName, accountId);
}

module.exports = { processChatwootWebhook, sendChatwootReply };
