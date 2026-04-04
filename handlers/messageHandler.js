// handlers/messageHandler.js
const { askKino }                            = require('./claudeHandler');
const { sendMessage, assignToTeam }          = require('./watiHandler');
const { notifyHandoff }                      = require('./notificationHandler');
const { extractAndUpdateForm }               = require('../utils/formExtractor');
const { extractFormFields, mapToFormUpdate } = require('../utils/semanticExtractor');
const {
  getSession, addMessage, markHandedOff,
  isHandedOff, updateForm, getMissingFields, formatFormSummary,
} = require('../utils/sessionStore');

const GREETING = 'Hi! 👋 I\'m *KINO*, the rental assistant for *TWENTYONESEVENTEEN* 🎬\n\nI can help you with:\n• Gear recommendations for your shoot\n• Package info & pricing\n• Availability checks\n• Getting you a quote\n\nWhat are you looking for today? / Apa yang you nak hari ni?';

async function handleIncomingMessage(waId, text, name, imageUrl) {
  if (name === undefined) name = 'Customer';
  if (!text || !text.trim()) return;
  var trimmedText = text.trim();

  if (isHandedOff(waId)) {
    console.log('[KINO] ' + waId + ' is with human — bot silent');
    return;
  }

  var lower   = trimmedText.toLowerCase();
  var history = getSession(waId);
  var greetingTriggers = ['hi', 'hello', 'hey', 'start', 'mula', 'hai', 'alo', 'helo'];

  if (history.length === 0 && greetingTriggers.some(function(g) { return lower === g; })) {
    addMessage(waId, 'user', trimmedText);
    addMessage(waId, 'assistant', GREETING);
    await sendMessage(waId, GREETING);
    return;
  }

  extractAndUpdateForm(waId, trimmedText);

  var missing = getMissingFields(waId);
  var formContext = missing.length > 0
    ? '\n[SYSTEM: Enquiry form status — still missing: ' + missing.join(', ') + '. Collect these naturally before generating a quote.]'
    : '\n[SYSTEM: Enquiry form is COMPLETE. All 5 fields collected. Ready to generate quote.]';

  console.log('[KINO] ' + waId + ': "' + trimmedText.substring(0, 80) + '..." | missing: [' + (missing.join(', ') || 'none') + ']');

  var results = await Promise.all([
    askKino(history, trimmedText + formContext, imageUrl),
    extractFormFields(trimmedText, history),
  ]);

  var kinoResult    = results[0];
  var semanticResult = results[1];
  var reply            = kinoResult.reply;
  var handoffTriggered = kinoResult.handoffTriggered;

  if (semanticResult) {
    var formUpdate = mapToFormUpdate(semanticResult);
    if (formUpdate) {
      updateForm(waId, formUpdate);
      console.log('[SemanticExtractor] Auto-filled: ' + Object.keys(formUpdate).join(', ') + ' for ' + waId);
    }
  }

  addMessage(waId, 'user', trimmedText);
  addMessage(waId, 'assistant', reply);
  await sendMessage(waId, reply);

  if (handoffTriggered) {
    console.log('[KINO] Handoff triggered for ' + waId);
    markHandedOff(waId);
    await Promise.all([
      assignToTeam(waId),
      notifyHandoff(waId, name, trimmedText, reply),
    ]);
  }
}

module.exports = { handleIncomingMessage };