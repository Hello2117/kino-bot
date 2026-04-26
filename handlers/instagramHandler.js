// handlers/instagramHandler.js
// Sends Instagram DMs via Meta Graph API
// Used by KINO for @2117_rentals and @2117_studio inbox replies

const axios = require('axios');

var API_VERSION = process.env.META_API_VERSION || 'v19.0';
var BASE_URL    = 'https://graph.facebook.com/' + API_VERSION;

// Token map — keyed by IG Business Account ID
var IG_TOKENS = {
  '17841404595372464': function() { return process.env.META_IG_TOKEN_RENTALS; }, // @2117_rentals
  '17841472837248429': function() { return process.env.META_IG_TOKEN_STUDIO;  }, // @2117_studio
};

function getToken(igAccountId) {
  var tokenFn = igAccountId && IG_TOKENS[igAccountId];
  if (tokenFn) {
    var token = tokenFn();
    if (token) return token;
  }
  // Fallback to generic IG token or general Meta token
  return process.env.META_IG_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
}

// ─────────────────────────────────────────────
// SEND TEXT DM
// ─────────────────────────────────────────────

async function sendIGMessage(igUserId, recipientIgId, message) {
  try {
    // Convert **bold** to *bold* (IG doesn't render markdown but cleaner)
    var cleaned = message.replace(/\*\*([^*]+)\*\*/g, '*$1*');

    var res = await axios.post(
      BASE_URL + '/' + igUserId + '/messages',
      {
        recipient: { id: recipientIgId },
        message:   { text: cleaned },
      },
      {
        headers: {
          'Authorization': 'Bearer ' + getToken(igUserId),
          'Content-Type':  'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('[IG] Message sent to', recipientIgId, 'via', igUserId,
      '| id:', res.data && res.data.message_id);
    return res.data;
  } catch(err) {
    console.error('[IG] sendIGMessage error:',
      err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// GET USER PROFILE
// Fetches the sender's IG name for personalisation
// ─────────────────────────────────────────────

async function getIGUserProfile(recipientIgId, igAccountId) {
  try {
    var res = await axios.get(
      BASE_URL + '/' + recipientIgId,
      {
        params: {
          fields:       'name,username',
          access_token: getToken(igAccountId),
        },
        timeout: 8000,
      }
    );
    return res.data || null;
  } catch(err) {
    console.error('[IG] getIGUserProfile error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// MARK MESSAGE AS SEEN (optional UX improvement)
// ─────────────────────────────────────────────

async function markAsSeen(igUserId, recipientIgId) {
  try {
    await axios.post(
      BASE_URL + '/' + igUserId + '/messages',
      {
        recipient:      { id: recipientIgId },
        sender_action:  'mark_seen',
      },
      {
        headers: {
          'Authorization': 'Bearer ' + getToken(igUserId),
          'Content-Type':  'application/json',
        },
        timeout: 5000,
      }
    );
  } catch(err) {
    // Non-fatal — just log
    console.warn('[IG] markAsSeen error:', err.message);
  }
}

module.exports = { sendIGMessage, getIGUserProfile, markAsSeen };
