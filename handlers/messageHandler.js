// handlers/messageHandler.js
const { askKino }                            = require('./claudeHandler');
const { sendMessage, assignToTeam, notifyJeff } = require('./watiHandler');
const { notifyHandoff }                      = require('./notificationHandler');
const { extractAndUpdateForm }               = require('../utils/formExtractor');
const { extractFormFields, mapToFormUpdate } = require('../utils/semanticExtractor');
const {
  getSession,
  addMessage,
  markHandedOff,
  isHandedOff,
  updateForm,
  getMissingFields,
  formatFormSummary,
} = require('../utils/sessionStore');

const GREETING = 'Hi! I\'m Kino, the rental assistant for TWENTYONESEVENTEEN.\n\nI can help you with:\n- Gear recommendations for your shoot\n- Package info and pricing\n- Availability checks\n- Getting you a quote\n\nWhat are you looking for today? / Apa yang you nak hari ni?';

async function handleIncomingMessage(waId, text, name, imageUrl) {
  if (name === undefined) name = 'Customer';
  if (!text || !text.trim()) return;
  var trimmedText = text.trim();

  // Check handoff status from Supabase
  var handedOff = await isHandedOff(waId);
  if (handedOff) {
    console.log('[KINO] ' + waId + ' is with human — bot silent');
    return;
  }

  var lower = trimmedText.toLowerCase();
  var history = await getSession(waId);
  var greetingTriggers = ['hi', 'hello', 'hey', 'start', 'mula', 'hai', 'alo', 'helo'];

  if (history.length === 0 && greetingTriggers.some(function(g) { return lower === g; })) {
    await addMessage(waId, 'user', trimmedText);
    await addMessage(waId, 'assistant', GREETING);
    await sendMessage(waId, GREETING);
    return;
  }

  // Pattern-based form extraction
  extractAndUpdateForm(waId, trimmedText);

  // Get missing fields
  var missing = await getMissingFields(waId);
  var formContext = missing.length > 0
    ? '\n[SYSTEM: Enquiry form status — still missing: ' + missing.join(', ') + '. Collect these naturally before generating a quote.]'
    : '\n[SYSTEM: Enquiry form is COMPLETE. All 5 fields collected. Ready to generate quote.]';

  console.log('[KINO] ' + waId + ': "' + trimmedText.substring(0, 80) + '..." | missing: [' + (missing.join(', ') || 'none') + ']');

  // Fire KINO reply + semantic extraction in parallel
  var results = await Promise.all([
    askKino(history, trimmedText + formContext, imageUrl),
    extractFormFields(trimmedText, history),
  ]);

  var kinoResult     = results[0];
  var semanticResult = results[1];
  var reply            = kinoResult.reply;
  var handoffTriggered = kinoResult.handoffTriggered;

  // Merge semantic extraction into form
  if (semanticResult) {
    var formUpdate = mapToFormUpdate(semanticResult);
    if (formUpdate) {
      await updateForm(waId, formUpdate);
      console.log('[SemanticExtractor] Auto-filled: ' + Object.keys(formUpdate).join(', ') + ' for ' + waId);
    }
  }

  // Store messages
  await addMessage(waId, 'user', trimmedText);
  await addMessage(waId, 'assistant', reply);

  // Send reply
  await sendMessage(waId, reply);

  // Handle handoff
  if (handoffTriggered) {
    console.log('[KINO] Handoff triggered for ' + waId);
    await markHandedOff(waId);
    await Promise.all([
      assignToTeam(waId),
      notifyHandoff(waId, name, trimmedText, reply),
      notifyJeff(name, waId, trimmedText),
    ]);
  }
}

module.exports = { handleIncomingMessage };
