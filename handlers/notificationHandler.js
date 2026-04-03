// handlers/notificationHandler.js
// Notifies the 2117 team when KINO triggers a human handoff.
// Channels: Console log (always) + optional Telegram or email.
// Extend this file to add Slack, WhatsApp Business API alerts, etc.

const axios = require('axios');
const { formatFormSummary } = require('../utils/sessionStore');

// ─────────────────────────────────────────────
// TELEGRAM NOTIFICATION (optional but recommended)
// Setup: Create a Telegram bot via @BotFather
//        Get your chat ID via @userinfobot
//        Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env
// ─────────────────────────────────────────────

async function notifyViaTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return; // Silently skip if not configured

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('[Notify] Telegram error:', err.message);
  }
}

// ─────────────────────────────────────────────
// MAIN NOTIFICATION — Handoff Alert
// Called from messageHandler.js when KINO detects handoff
// ─────────────────────────────────────────────

/**
 * Send a handoff alert to the team.
 * @param {string} waId         - Customer's WhatsApp number
 * @param {string} customerName - Customer's display name
 * @param {string} lastMessage  - The customer's last message (context for team)
 * @param {string} kinoReply    - What KINO said before handing off
 */
async function notifyHandoff(waId, customerName, lastMessage, kinoReply) {
  const timestamp = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
  const watiUrl   = `https://app.wati.io/conversations/${waId}`;
  const formSummary = formatFormSummary(waId);

  const consoleMsg = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ KINO HANDOFF — Action Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Customer : ${customerName}
WA Number: +${waId}
Time     : ${timestamp}
──────────────────────────────────
Last message : "${lastMessage}"
KINO replied : "${kinoReply.substring(0, 120)}..."
──────────────────────────────────
${formSummary}
──────────────────────────────────
Action: Open WATI inbox → assign to yourself → reply
Link  : ${watiUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  console.log(consoleMsg);

  const telegramMsg = `⚡ <b>KINO Handoff — Action Required</b>

👤 <b>Customer:</b> ${customerName}
📱 <b>WA:</b> +${waId}
🕐 <b>Time:</b> ${timestamp}

💬 <b>Their message:</b>
"${lastMessage}"

<pre>${formSummary}</pre>

👉 <a href="${watiUrl}">Open in WATI</a>`;

  await notifyViaTelegram(telegramMsg);
}

// ─────────────────────────────────────────────
// DAILY SUMMARY (optional — call via cron)
// ─────────────────────────────────────────────

/**
 * Send a daily summary of KINO activity.
 * Wire this up to a daily cron job (e.g. node-cron or Railway cron).
 * @param {object} stats - { totalMessages, quotesGenerated, handoffs, activeSessions }
 */
async function notifyDailySummary(stats) {
  const timestamp = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

  const telegramMsg = `📊 <b>KINO Daily Summary</b>
🗓 ${timestamp}

💬 Messages handled: ${stats.totalMessages}
📄 Quotes generated: ${stats.quotesGenerated}
👥 Handoffs to team: ${stats.handoffs}
🟢 Active sessions:  ${stats.activeSessions}

— TWENTYONESEVENTEEN 🎬`;

  await notifyViaTelegram(telegramMsg);
}

module.exports = { notifyHandoff, notifyDailySummary };
