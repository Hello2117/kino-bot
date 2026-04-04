// handlers/messageHandler.js
const { askKino }                          = require('./claudeHandler');
const { sendMessage, assignToTeam }        = require('./watiHandler');
const { notifyHandoff }                    = require('./notificationHandler');
const { extractAndUpdateForm }             = require('../utils/formExtractor');
const { extractFormFields, mapToFormUpdate } = require('../utils/semanticExtractor');
const {
  getSession, addMessage, markHandedOff,
  isHandedOff, updateForm, getMissingFields, formatFormSummary,
} = require('../utils/sessionStore');

const GREETING = `Hi! 👋 I'm *KINO*, the rental assistant for *TWENTYONESEVENTEEN* 🎬

I can help you with:
- Gear recommendations for your shoot
- Package info & pricing
- Availability checks
- Getting you a quote

What are you looking for today? / Apa yang you nak hari ni?`;

async function handleIncomingMessage(waId, text, name = 'Customer') {
  if (!text || !text.trim()) return;
  const trimmedText = text.trim();

  if (isHandedOff(waId)) {
    console.log(\`[KINO] \${waId} is with human — bot silent\`);
    return;
  }

  const lower   = trimmedText.toLowerCase();
  const history = getSession(waId);
  const greetingTriggers = ['hi', 'hello', 'hey', 'start', 'mula', 'hai', 'alo', 'helo'];

  if (history.length === 0 && greetingTriggers.some(g => lower === g)) {
    addMessage(waId, 'user', trimmedText);
    addMessage(waId, 'assistant', GREETING);
    await sendMessage(waId, GREETING);
    return;
  }

  extractAndUpdateForm(waId, trimmedText);

  const missing = getMissingFields(waId);
  const formContext = missing.length > 0
    ? \`\n[SYSTEM: Enquiry form status — still missing: \${missing.join(', ')}. Collect these naturally before generating a quote.]\`
    : \`\n[SYSTEM: Enquiry form is COMPLETE. All 5 fields collected. Ready to generate quote.]\`;

  console.log(\`[KINO] \${waId}: "\${trimmedText.substring(0, 80)}..." | missing: [\${missing.join(', ') || 'none'}]\`);

  const [kinoResult, semanticResult] = await Promise.all([
    askKino(history, trimmedText + formContext),
    extractFormFields(trimmedText, history),
  ]);

  const { reply, handoffTriggered } = kinoResult;

  if (semanticResult) {
    const formUpdate = mapToFormUpdate(semanticResult);
    if (formUpdate) {
      updateForm(waId, formUpdate);
      console.log(\`[SemanticExtractor] Auto-filled: \${Object.keys(formUpdate).join(', ')} for \${waId}\`);
    }
  }

  addMessage(waId, 'user', trimmedText);
  addMessage(waId, 'assistant', reply);
  await sendMessage(waId, reply);

  if (handoffTriggered) {
    console.log(\`[KINO] Handoff triggered for \${waId}\`);
    markHandedOff(waId);
    await Promise.all([
      assignToTeam(waId),
      notifyHandoff(waId, name, trimmedText, reply),
    ]);
  }
}

module.exports = { handleIncomingMessage };
