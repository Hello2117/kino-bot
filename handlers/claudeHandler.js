// handlers/claudeHandler.js
// Sends conversation to Claude API with KINO system prompt.
// Loads system prompt from file on startup — swap file contents without redeploying.

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Load KINO system prompt once at startup
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/kino_system.txt'),
  'utf8'
);

// Detect handoff trigger in KINO's response
function detectsHandoffTrigger(text) {
  const triggers = [
    'loop in our team',
    'team kami handle',
    'expect a message from us shortly',
    'kejap lagi ada orang akan reach out',
    'let me flag that to our team',
  ];
  const lower = text.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

/**
 * Send a message to Claude and get KINO's response.
 *
 * @param {Array<{role: string, content: string}>} conversationHistory
 * @param {string} newUserMessage
 * @returns {Promise<{reply: string, handoffTriggered: boolean}>}
 */
async function askKino(conversationHistory, newUserMessage) {
  // Append the new user message to history for this call
  const messages = [
    ...conversationHistory,
    { role: 'user', content: newUserMessage },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content[0]?.text || "Sorry, I didn't catch that. Could you repeat?";
    const handoffTriggered = detectsHandoffTrigger(reply);

    return { reply, handoffTriggered };
  } catch (err) {
    console.error('[Claude] askKino error:', err.message);
    return {
      reply: "Sorry, I'm having a moment — please try again shortly, or message us directly! 🙏",
      handoffTriggered: false,
    };
  }
}

module.exports = { askKino };
