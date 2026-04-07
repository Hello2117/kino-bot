// handlers/messageHandler.js
const { askKino }                            = require('./claudeHandler');
const { createCustomer }                     = require('../utils/booqableCustomer');
const { sendMessage, assignToTeam, notifyJeff, sendDocument } = require('./watiHandler');
const { notifyHandoff }                      = require('./notificationHandler');
const { extractAndUpdateForm }               = require('../utils/formExtractor');
const { extractFormFields, mapToFormUpdate } = require('../utils/semanticExtractor');
const { generateQuotePDF, countQuoteItems }  = require('../utils/pdfGenerator');
const { uploadQuotePDF, buildFilename }      = require('../utils/supabaseStorage');
const {
  getSession,
  addMessage,
  markHandedOff,
  isHandedOff,
  updateForm,
  getMissingFields,
  formatFormSummary,
  getForm,
} = require('../utils/sessionStore');

const GREETING = 'Hi! I\'m Kino, the rental assistant for TWENTYONESEVENTEEN.\n\nI can help you with:\n- Gear recommendations for your shoot\n- Package info and pricing\n- Availability checks\n- Getting you a quote\n\nWhat are you looking for today? / Apa yang you nak hari ni?';

const PDF_ITEM_THRESHOLD = 10;

// ─────────────────────────────────────────────
// PDF QUOTE SENDER
// Fires when KINO's reply contains >10 equipment line items
// ─────────────────────────────────────────────

async function maybeSendQuotePDF(waId, reply, name) {
  try {
    var itemCount = countQuoteItems(reply);
    if (itemCount <= PDF_ITEM_THRESHOLD) return;

    console.log('[PDF] ' + itemCount + ' items detected — generating quote PDF for ' + waId);

    // Pull form data for customer/job name
    var form       = await getForm(waId).catch(function() { return {}; });
    var custName   = (form && form.invoiceDetails && form.invoiceDetails.name) || name || 'Customer';
    var jobName    = (form && form.jobName) || 'Quote';
    var shootDate  = (form && form.shootingDate) || null;

    var pdfBuffer  = await generateQuotePDF(reply, custName, jobName, shootDate);
    var filename   = buildFilename(waId, jobName);
    var publicUrl  = await uploadQuotePDF(pdfBuffer, filename);

    var caption = 'Your quote from TWENTYONESEVENTEEN — ' + jobName + '. Full pricing breakdown inside.';
    await sendDocument(waId, publicUrl, 'Quote_2117.pdf', caption);

    console.log('[PDF] Sent to ' + waId + ' | URL: ' + publicUrl);
  } catch (err) {
    console.error('[PDF] maybeSendQuotePDF error:', err.message);
    // Non-fatal — KINO's text reply was already sent, PDF is a bonus
  }
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

async function handleIncomingMessage(waId, text, name, imageUrl) {
  if (name === undefined) name = 'Customer';
  if (!text || !text.trim()) return;
  var trimmedText = text.trim();

  // Check handoff status
  var handedOff = await isHandedOff(waId);
  if (handedOff) {
    console.log('[KINO] ' + waId + ' is with human — bot silent');
    return;
  }

  var lower   = trimmedText.toLowerCase();
  var history = await getSession(waId);
  var greetingTriggers = ['hi', 'hello', 'hey', 'start', 'mula', 'hai', 'alo', 'helo'];
  var isGreeting = greetingTriggers.some(function(g) { return lower === g; });

  // ── Returning customer ─────────────────────────────────────────────────
  if (history.length > 0 && isGreeting) {
    console.log('[KINO] Returning customer ' + waId + ' — continuing from history');
    var returningContext = trimmedText
      + '\n[SYSTEM: This is a returning customer. You have previous conversation history with them shown above. '
      + 'Do not re-introduce yourself or restart the enquiry process. '
      + 'Greet them warmly by referencing what you already know — their shoot, gear, or quote. '
      + 'Pick up naturally from where you left off.]';

    var missing = await getMissingFields(waId);
    var formContext = missing.length > 0
      ? '\n[SYSTEM: Enquiry form still missing: ' + missing.join(', ') + '.]'
      : '\n[SYSTEM: Enquiry form is COMPLETE.]';

    var results = await Promise.all([
      askKino(history, returningContext + formContext, imageUrl),
      extractFormFields(trimmedText, history),
    ]);

    var reply            = results[0].reply;
    var handoffTriggered = results[0].handoffTriggered;
    var semanticResult   = results[1];

    if (semanticResult) {
      var formUpdate = mapToFormUpdate(semanticResult);
      if (formUpdate) await updateForm(waId, formUpdate);
    }

    await addMessage(waId, 'user', trimmedText);
    await addMessage(waId, 'assistant', reply);
    await sendMessage(waId, reply);

    // PDF trigger
    await maybeSendQuotePDF(waId, reply, name);

    var updatedMissing2 = await getMissingFields(waId);
    if (updatedMissing2.length === 0) {
      var form2 = await getForm(waId);
      if (form2 && form2.invoiceDetails && !form2.booqableCustomerId) {
        createCustomer(form2.invoiceDetails, form2.invoiceType).then(function(result) {
          if (result && result.customer) {
            console.log('[Booqable] Customer registered: ' + result.customer.id + ' — ' + result.customer.name);
            updateForm(waId, { booqableCustomerId: result.customer.id });
          }
        }).catch(function(e) { console.error('[Booqable] Customer creation error:', e.message); });
      }
    }

    if (handoffTriggered) {
      await markHandedOff(waId);
      await Promise.all([
        assignToTeam(waId),
        notifyHandoff(waId, name, trimmedText, reply),
        notifyJeff(name, waId, trimmedText),
      ]);
    }
    return;
  }

  // ── New customer greeting ──────────────────────────────────────────────
  if (history.length === 0 && isGreeting) {
    await addMessage(waId, 'user', trimmedText);
    await addMessage(waId, 'assistant', GREETING);
    await sendMessage(waId, GREETING);
    return;
  }

  // ── Standard message flow ─────────────────────────────────────────────
  extractAndUpdateForm(waId, trimmedText);

  var missing = await getMissingFields(waId);
  var formContext = missing.length > 0
    ? '\n[SYSTEM: Enquiry form status — still missing: ' + missing.join(', ') + '. Collect these naturally before generating a quote.]'
    : '\n[SYSTEM: Enquiry form is COMPLETE. All 5 fields collected. Ready to generate quote.]';

  console.log('[KINO] ' + waId + ': "' + trimmedText.substring(0, 80) + '..." | missing: [' + (missing.join(', ') || 'none') + ']');

  var results = await Promise.all([
    askKino(history, trimmedText + formContext, imageUrl),
    extractFormFields(trimmedText, history),
  ]);

  var kinoResult       = results[0];
  var semanticResult   = results[1];
  var reply            = kinoResult.reply;
  var handoffTriggered = kinoResult.handoffTriggered;

  if (semanticResult) {
    var formUpdate = mapToFormUpdate(semanticResult);
    if (formUpdate) {
      await updateForm(waId, formUpdate);
      console.log('[SemanticExtractor] Auto-filled: ' + Object.keys(formUpdate).join(', '));
    }
  }

  await addMessage(waId, 'user', trimmedText);
  await addMessage(waId, 'assistant', reply);
  await sendMessage(waId, reply);

  // PDF trigger — runs async, non-blocking
  maybeSendQuotePDF(waId, reply, name).catch(function(e) {
    console.error('[PDF] Async trigger error:', e.message);
  });

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
