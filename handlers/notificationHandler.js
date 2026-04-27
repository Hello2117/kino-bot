
// ─────────────────────────────────────────────
// NOTIFY JEFF — IG ENQUIRY
// Fires when IG enquiry goes beyond KINO's scope
// ─────────────────────────────────────────────

async function notifyJeffIG(channel, customerName, conversationId, lastMessage) {
  var jeffNumber = process.env.JEFF_WHATSAPP || '60167040283';
  var timestamp  = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

  var msg = '[IG ENQUIRY - ' + (channel || 'Instagram').toUpperCase() + ']\n\n'
    + 'Customer: ' + (customerName || 'Unknown') + '\n'
    + 'Channel: ' + (channel || 'Instagram') + '\n'
    + 'Time: ' + timestamp + '\n\n'
    + 'Message: "' + (lastMessage || '').substring(0, 200) + '"\n\n'
    + 'Please follow up on Instagram / Chatwoot.';

  try {
    var { sendMessage } = require('./whatsappHandler');
    await sendMessage(jeffNumber, msg);
    console.log('[Notify] Jeff IG alert sent for', channel, customerName);
  } catch(e) {
    console.error('[Notify] Jeff IG alert error:', e.message);
  }

  var telegramMsg = '<b>[IG ENQUIRY - ' + (channel || 'Instagram').toUpperCase() + ']</b>\n\n'
    + '<b>Customer:</b> ' + (customerName || 'Unknown') + '\n'
    + '<b>Channel:</b> ' + (channel || 'Instagram') + '\n'
    + '<b>Time:</b> ' + timestamp + '\n\n'
    + '<b>Message:</b>\n"' + (lastMessage || '').substring(0, 200) + '"';

  await notifyViaTelegram(telegramMsg);
}

module.exports = { notifyHandoff, notifyReadyToRent, notifyDailySummary, notifyJeffIG };
