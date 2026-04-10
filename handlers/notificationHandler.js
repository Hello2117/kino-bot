// handlers/notificationHandler.js
// Team alerts for KINO events.
// Channels: Telegram + Jeff WhatsApp

const axios = require('axios');
const { formatFormSummary } = require('../utils/sessionStore');

// ─────────────────────────────────────────────
// TELEGRAM
// ─────────────────────────────────────────────

async function notifyViaTelegram(message) {
  var token  = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await axios.post('https://api.telegram.org/bot' + token + '/sendMessage', {
      chat_id:    chatId,
      text:       message,
      parse_mode: 'HTML',
    });
  } catch(err) {
    console.error('[Notify] Telegram error:', err.message);
  }
}

// ─────────────────────────────────────────────
// JEFF WHATSAPP
// ─────────────────────────────────────────────

async function notifyJeffWhatsApp(message) {
  var jeffNumber = process.env.JEFF_WHATSAPP;
  if (!jeffNumber) return;
  try {
    var { sendMessage } = require('./watiHandler');
    await sendMessage(jeffNumber, message);
  } catch(err) {
    console.error('[Notify] Jeff WA error:', err.message);
  }
}

// ─────────────────────────────────────────────
// [HUMAN_HANDOFF] SIGNAL
// Fires when KINO escalates to a human
// ─────────────────────────────────────────────

async function notifyHandoff(waId, customerName, lastMessage, kinoReply) {
  var timestamp   = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
  var watiUrl     = 'https://app.wati.io/conversations/' + waId;
  var formSummary = await formatFormSummary(waId).catch(function() { return ''; });

  console.log('\n[HUMAN_HANDOFF] ' + customerName + ' (+' + waId + ') at ' + timestamp);

  // Telegram
  var telegramMsg = '🚨 <b>[HUMAN_HANDOFF]</b>\n\n'
    + '👤 <b>Customer:</b> ' + customerName + '\n'
    + '📱 <b>WA:</b> +' + waId + '\n'
    + '🕐 <b>Time:</b> ' + timestamp + '\n\n'
    + '💬 <b>Their message:</b>\n"' + (lastMessage || '').substring(0, 200) + '"\n\n'
    + '<pre>' + formSummary + '</pre>\n\n'
    + '👉 <a href="' + watiUrl + '">Open in WATI</a>';

  await notifyViaTelegram(telegramMsg);

  // Jeff WhatsApp
  var jeffMsg = '[HUMAN_HANDOFF]\n\n'
    + 'Customer: ' + customerName + '\n'
    + 'WA: +' + waId + '\n'
    + 'Time: ' + timestamp + '\n\n'
    + 'Message: "' + (lastMessage || '').substring(0, 150) + '"\n\n'
    + 'Open WATI to respond.';

  await notifyJeffWhatsApp(jeffMsg);
}

// ─────────────────────────────────────────────
// [READY_TO_RENT] SIGNAL
// Fires when customer confirms intent after receiving quote
// ─────────────────────────────────────────────

async function notifyReadyToRent(waId, customerName, jobName, orderNumber) {
  var timestamp = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
  var watiUrl   = 'https://app.wati.io/conversations/' + waId;
  var orderRef  = orderNumber ? ' | Booking #' + orderNumber : '';

  console.log('\n[READY_TO_RENT] ' + customerName + ' (+' + waId + ') — ' + (jobName || 'Unknown Job') + orderRef);

  // Telegram
  var telegramMsg = '💰 <b>[READY_TO_RENT]</b>\n\n'
    + '👤 <b>Customer:</b> ' + customerName + '\n'
    + '📱 <b>WA:</b> +' + waId + '\n'
    + '🎬 <b>Job:</b> ' + (jobName || 'Unknown') + '\n'
    + (orderNumber ? '🔖 <b>Booking:</b> #' + orderNumber + '\n' : '')
    + '🕐 <b>Time:</b> ' + timestamp + '\n\n'
    + '✅ Customer has confirmed intent to proceed.\n\n'
    + '👉 <a href="' + watiUrl + '">Open in WATI</a>';

  await notifyViaTelegram(telegramMsg);

  // Jeff WhatsApp
  var jeffMsg = '[READY_TO_RENT]\n\n'
    + 'Customer: ' + customerName + '\n'
    + 'WA: +' + waId + '\n'
    + 'Job: ' + (jobName || 'Unknown') + '\n'
    + (orderNumber ? 'Booking: #' + orderNumber + '\n' : '')
    + 'Time: ' + timestamp + '\n\n'
    + 'Customer has confirmed — follow up on payment and collection details.';

  await notifyJeffWhatsApp(jeffMsg);
}

// ─────────────────────────────────────────────
// DAILY SUMMARY
// ─────────────────────────────────────────────

async function notifyDailySummary(stats) {
  var timestamp = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
  var telegramMsg = '📊 <b>KINO Daily Summary</b>\n'
    + '🗓 ' + timestamp + '\n\n'
    + '💬 Messages handled: ' + stats.totalMessages + '\n'
    + '📄 Quotes generated: ' + stats.quotesGenerated + '\n'
    + '💰 Ready to rent:    ' + (stats.readyToRent || 0) + '\n'
    + '👥 Handoffs to team: ' + stats.handoffs + '\n'
    + '🟢 Active sessions:  ' + stats.activeSessions + '\n\n'
    + '— TWENTYONESEVENTEEN 🎬';
  await notifyViaTelegram(telegramMsg);
}

module.exports = { notifyHandoff, notifyReadyToRent, notifyDailySummary };
