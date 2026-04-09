// handlers/messageHandler.js
const { askKino }                            = require('./claudeHandler');
const { createCustomer }                     = require('../utils/booqableCustomer');
const { sendMessage, assignToTeam, notifyJeff, sendDocument } = require('./watiHandler');
const { notifyHandoff }                      = require('./notificationHandler');
const { extractAndUpdateForm }               = require('../utils/formExtractor');
const { extractFormFields, mapToFormUpdate } = require('../utils/semanticExtractor');
const { generateQuotePDF }                  = require('../utils/pdfGenerator');
const { createBooqableOrder }                = require('../utils/booqableOrder');
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
  markQuoteSent,
  markPICConfirmed,
  storeOrderNumber,
  storePIC,
} = require('../utils/sessionStore');

const GREETING = 'Hi! I\'m Kino, the rental assistant for TWENTYONESEVENTEEN.\n\nI can help you with:\n- Gear recommendations for your shoot\n- Package info and pricing\n- Availability checks\n- Getting you a quote\n\nWhat are you looking for today? / Apa yang you nak hari ni?';


// ─────────────────────────────────────────────
// PDF QUOTE SENDER
// Fires when KINO's reply contains >10 equipment line items
// ─────────────────────────────────────────────

async function maybeSendQuotePDF(waId, reply, name) {
  try {
    // Prevent duplicate sends within same response cycle
    if (pdfInFlight.has(waId)) {
      console.log('[PDF] Skipping — already generating for', waId);
      return;
    }
    pdfInFlight.add(waId);
    setTimeout(function() { pdfInFlight.delete(waId); }, 30000); // clear after 30s

    // Only generate PDF + Booqable order when form is fully complete
    var missingFields = await getMissingFields(waId);
    if (missingFields.length > 0) {
      pdfInFlight.delete(waId);
      console.log('[PDF] Skipping — form incomplete, missing: ' + missingFields.join(', '));
      return;
    }

    console.log('[PDF] Form complete — generating quote PDF for ' + waId);

    // Pull form data
    var form      = await getForm(waId).catch(function() { return {}; });
    var custName  = (form && form.invoiceDetails && form.invoiceDetails.name) || name || 'Customer';
    var jobName   = (form && form.jobName) || 'Quote';
    var shootDate = (form && form.shootingDate) || null;

    // Create Booqable order to get real booking number
    var orderNumber = null;
    try {
      var orderResult = await createBooqableOrder(form, reply);
      orderNumber = orderResult.orderNumber;
      console.log('[PDF] Booqable order created: #' + orderNumber + ' (' + orderResult.itemsAdded + '/' + orderResult.totalItems + ' items)');
    } catch(orderErr) {
      console.warn('[PDF] Booqable order creation failed (continuing without order number):', orderErr.message);
    }

    // Generate PDF with order number embedded
    var pdfBuffer = await generateQuotePDF(reply, custName, jobName, shootDate, orderNumber);
    var filename  = buildFilename(waId, jobName);
    var publicUrl = await uploadQuotePDF(pdfBuffer, filename);

    var caption = orderNumber
      ? 'Your quote from TWENTYONESEVENTEEN — ' + jobName + ' | Booking #' + orderNumber
      : 'Your quote from TWENTYONESEVENTEEN — ' + jobName;

    await sendDocument(waId, publicUrl, 'Quote_2117_' + (orderNumber || 'draft') + '.pdf', caption);
    console.log('[PDF] Sent to ' + waId + ' | Order #' + orderNumber + ' | URL: ' + publicUrl);

    // Stamp quote sent time + store order number for scheduler
    await markQuoteSent(waId);
    if (orderNumber) await storeOrderNumber(waId, orderNumber);

    // Ask for PIC right after quote is sent — only once (skip if already provided)
    var picForm = await getForm(waId).catch(function() { return {}; });
    if (!picForm.picName && !picForm.picWaId) {
      setTimeout(async function() {
        try {
          var form2   = await getForm(waId).catch(function() { return {}; });
          var jName   = (form2 && form2.jobName) || 'your shoot';
          var cName   = (form2 && form2.invoiceDetails && (form2.invoiceDetails.name || form2.invoiceDetails.contactPerson)) || null;
          var picMsg  = 'Also' + (cName ? ', ' + cName.split(' ')[0] : '') + ' — who will be coming in to collect the gear for *' + jName + '*? Just so we can have everything ready for them.';
          await sendMessage(waId, picMsg);
        } catch(e) { console.error('[PDF] PIC prompt error:', e.message); }
      }, 3000);
    }
  } catch (err) {
    pdfInFlight.delete(waId);
    console.error('[PDF] maybeSendQuotePDF error:', err.message);
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

  // ── PIC detection — extract name and/or WA number ──────────────────
  var picForm = await getForm(waId).catch(function() { return {}; });
  if (picForm && picForm.booqableOrderNumber) {
    var lowerText = trimmedText.toLowerCase();

    // Detect WA number in message — Malaysian format
    var waNumMatch = trimmedText.match(/(?:\+?60|0)1[0-9][\s\-]?[0-9]{7,8}/);
    if (waNumMatch) {
      var rawNum  = waNumMatch[0].replace(/[\s\-]/g, '');
      var picWaId = rawNum.startsWith('0') ? '6' + rawNum.slice(1) : rawNum.replace(/^\+/, '');
      await storePIC(waId, picForm.picName || null, picWaId);
      console.log('[KINO] PIC WA number stored for', waId, ':', picWaId);
    }

    // Detect PIC name (short reply that looks like a name, after quote was sent)
    var picKeywords = ['will be', 'collecting is', 'pic is', 'person is', 'coming is',
      'my name', 'nama saya', 'he will', 'she will', 'i will collect', 'saya ambil'];
    var looksLikeName = picKeywords.some(function(k) { return lowerText.includes(k); })
      || (!waNumMatch && trimmedText.length < 50
          && /^[A-Z][a-z]/.test(trimmedText.trim())
          && trimmedText.trim().split(' ').length <= 5
          && picForm.quote_sent_at);
    if (looksLikeName && !picForm.picName) {
      // Extract name from message
      var nameExtract = trimmedText
        .replace(/will be|collecting is|pic is|person is|coming is|my name is|nama saya/gi, '')
        .replace(/[,.:]/g, '').trim();
      if (nameExtract.length > 1) {
        await storePIC(waId, nameExtract, picForm.picWaId || null);
        console.log('[KINO] PIC name stored for', waId, ':', nameExtract);
      }
    }
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
