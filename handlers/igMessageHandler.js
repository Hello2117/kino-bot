// handlers/igMessageHandler.js
// Processes Instagram DMs for KINO
// Routes to kino_system.txt (@2117_rentals) or kino_studio_system.txt (@2117_studio)

const path = require('path');
const fs   = require('fs');
const { sendIGMessage, getIGUserProfile, markAsSeen } = require('./instagramHandler');
const { askKino, detectsReadyToRent }                 = require('./claudeHandler');
const { notifyHandoff, notifyReadyToRent }            = require('./notificationHandler');

// ─────────────────────────────────────────────
// ACCOUNT CONFIG
// Maps IG Business Account ID → config
// ─────────────────────────────────────────────

var IG_ACCOUNTS = {
  '17841404595372464': {
    name:       '@2117_rentals',
    type:       'rentals',
    systemFile: path.join(__dirname, '../prompts/kino_system.txt'),
    greeting:   'Hi! I\'m Kino, the rental assistant for TWENTYONESEVENTEEN.\n\nI can help you with:\n- Gear recommendations\n- Pricing and availability\n- Getting you a quote\n\nWhat are you looking for? / Apa yang you nak?',
  },
  '17841472837248429': {
    name:       '@2117_studio',
    type:       'studio',
    systemFile: path.join(__dirname, '../prompts/kino_studio_system.txt'),
    greeting:   'Hi! I\'m Kino, the booking assistant for 2117 Studio.\n\nI can help you with:\n- Studio rates and availability\n- Booking enquiries\n- Cyc wall and production questions\n\nWhat are you looking for?',
  },
};

// ─────────────────────────────────────────────
// IN-MEMORY SESSION STORE (IG-specific)
// Key: igAccountId:senderId
// ─────────────────────────────────────────────

var igSessions   = new Map();
var igDebounce   = new Map();
var igProcessed  = new Set();
var DEBOUNCE_MS  = 3000;
var SESSION_TTL  = 24 * 60 * 60 * 1000; // 24hr

function sessionKey(igAccountId, senderId) {
  return igAccountId + ':' + senderId;
}

function getSession(igAccountId, senderId) {
  var key     = sessionKey(igAccountId, senderId);
  var session = igSessions.get(key);
  if (!session) return [];
  if (Date.now() - session.lastActive > SESSION_TTL) {
    igSessions.delete(key);
    return [];
  }
  return session.messages || [];
}

function addToSession(igAccountId, senderId, role, content) {
  var key     = sessionKey(igAccountId, senderId);
  var session = igSessions.get(key) || { messages: [], lastActive: Date.now() };
  session.messages.push({ role: role, content: content });
  if (session.messages.length > 30) session.messages = session.messages.slice(-30);
  session.lastActive = Date.now();
  igSessions.set(key, session);
}

// ─────────────────────────────────────────────
// LOAD SYSTEM PROMPT
// ─────────────────────────────────────────────

function loadSystemPrompt(systemFile) {
  try {
    return fs.readFileSync(systemFile, 'utf8');
  } catch(e) {
    console.error('[IG] Could not load system prompt:', systemFile, e.message);
    return 'You are KINO, a helpful rental assistant for TWENTYONESEVENTEEN.';
  }
}

// ─────────────────────────────────────────────
// PROCESS SINGLE IG DM
// ─────────────────────────────────────────────

async function processIGMessage(igAccountId, senderId, text, senderName) {
  var account = IG_ACCOUNTS[igAccountId];
  if (!account) {
    console.warn('[IG] Unknown account ID:', igAccountId);
    return;
  }

  if (!text || !text.trim()) return;
  var trimmed = text.trim();
  var lower   = trimmed.toLowerCase();

  // Mark as seen
  await markAsSeen(igAccountId, senderId);

  var history    = getSession(igAccountId, senderId);
  var isGreeting = ['hi', 'hello', 'hey', 'start', 'hai', 'alo'].some(function(g) {
    return lower === g;
  });

  // New customer greeting
  if (history.length === 0 && isGreeting) {
    addToSession(igAccountId, senderId, 'user', trimmed);
    addToSession(igAccountId, senderId, 'assistant', account.greeting);
    await sendIGMessage(igAccountId, senderId, account.greeting);
    return;
  }

  // Load system prompt for this account
  var systemPrompt = loadSystemPrompt(account.systemFile);

  // Get sender name if not provided
  if (!senderName || senderName === 'Customer') {
    var profile  = await getIGUserProfile(senderId);
    senderName   = (profile && (profile.name || profile.username)) || 'Customer';
  }

  console.log('[IG] Processing message from', senderName, '(' + senderId + ')',
    'via', account.name, ':', trimmed.substring(0, 60));

  // Ask KINO
  var result       = await askKino(history, trimmed, null, systemPrompt);
  var rawReply     = result.reply;
  var readyToRent  = detectsReadyToRent(rawReply);
  var needsHandoff = rawReply.includes('[HUMAN_HANDOFF]');

  // Strip signal tags before sending
  var reply = rawReply
    .replace(/\[HUMAN_HANDOFF\]/g, '')
    .replace(/\[READY_TO_RENT\]/g, '')
    .trim();

  // Save to session
  addToSession(igAccountId, senderId, 'user', trimmed);
  addToSession(igAccountId, senderId, 'assistant', reply);

  // Send reply
  await sendIGMessage(igAccountId, senderId, reply);

  // Fire signals
  if (needsHandoff) {
    console.log('[IG] HUMAN_HANDOFF signal for', senderId, 'via', account.name);
    notifyHandoff(senderId, senderName, trimmed, reply).catch(function(e) {
      console.error('[IG] HUMAN_HANDOFF notify error:', e.message);
    });
  }

  if (readyToRent) {
    console.log('[IG] READY_TO_RENT signal for', senderId, 'via', account.name);
    notifyReadyToRent(senderId, senderName, account.name, null).catch(function(e) {
      console.error('[IG] READY_TO_RENT notify error:', e.message);
    });
  }
}

// ─────────────────────────────────────────────
// DEBOUNCED ENTRY POINT
// Accumulates rapid messages before processing
// ─────────────────────────────────────────────

function handleIGMessage(igAccountId, senderId, text, senderName) {
  var key      = sessionKey(igAccountId, senderId);
  var existing = igDebounce.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(text);
  } else {
    existing = { messages: [text], senderName: senderName };
    igDebounce.set(key, existing);
  }

  existing.timer = setTimeout(async function() {
    igDebounce.delete(key);
    var combined = existing.messages.join('\n');
    try {
      await processIGMessage(igAccountId, senderId, combined, existing.senderName);
    } catch(e) {
      console.error('[IG] processIGMessage error:', e.message);
    }
  }, DEBOUNCE_MS);
}

// ─────────────────────────────────────────────
// WEBHOOK PROCESSOR
// Called from server.js with raw Meta webhook body
// ─────────────────────────────────────────────

function processIGWebhook(body) {
  if (body.object !== 'instagram') return;

  var entries = body.entry || [];
  entries.forEach(function(entry) {
    var igAccountId = entry.id; // the IG Business Account that received the message

    var messagingEvents = entry.messaging || [];
    messagingEvents.forEach(function(event) {
      // Skip if sent by the page itself (outgoing)
      if (event.sender && event.sender.id === igAccountId) return;
      if (!event.message) return;
      if (event.message.is_echo) return; // skip echoes of our own sends

      var senderId  = event.sender && event.sender.id;
      var msgId     = event.message && event.message.mid;
      var text      = event.message && event.message.text;

      if (!senderId || !text) return;

      // Deduplication
      if (msgId) {
        if (igProcessed.has(msgId)) {
          console.log('[IG] Duplicate ignored:', msgId);
          return;
        }
        igProcessed.add(msgId);
        setTimeout(function() { igProcessed.delete(msgId); }, 3600000);
      }

      console.log('[IG] Incoming DM | account:', igAccountId,
        '| from:', senderId, '| text:', (text || '').substring(0, 60));

      handleIGMessage(igAccountId, senderId, text, 'Customer');
    });
  });
}

module.exports = { processIGWebhook, handleIGMessage };
