// handlers/whatsappHandler.js
// Meta Cloud API replacement for watiHandler.js
// Env vars required:
//   META_ACCESS_TOKEN   — System User permanent token
//   META_PHONE_NUMBER_ID — e.g. 1022228760982019
//   META_API_VERSION    — optional, defaults to v19.0
//   JEFF_WHATSAPP       — Jeff's WA number (without +)

const axios    = require('axios');
const FormData = require('form-data');

var META_TOKEN      = process.env.META_ACCESS_TOKEN;
var PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
var API_VERSION     = process.env.META_API_VERSION || 'v19.0';
var BASE_URL        = 'https://graph.facebook.com/' + API_VERSION;

function getHeaders() {
  return {
    'Authorization': 'Bearer ' + (process.env.META_ACCESS_TOKEN || META_TOKEN),
    'Content-Type':  'application/json',
  };
}

function getPhoneNumberId() {
  return process.env.META_PHONE_NUMBER_ID || PHONE_NUMBER_ID;
}

// ─────────────────────────────────────────────
// FORMAT WA ID
// Meta requires full international format without +
// e.g. 60162178573 (not +60162178573 or 0162178573)
// ─────────────────────────────────────────────

function formatWaId(waId) {
  var id = String(waId).replace(/[^0-9]/g, '');
  // If starts with 0, assume Malaysian and replace with 60
  if (id.startsWith('0')) id = '60' + id.slice(1);
  return id;
}

// ─────────────────────────────────────────────
// SEND TEXT MESSAGE
// ─────────────────────────────────────────────

async function sendMessage(waId, message) {
  try {
    // Convert **bold** markdown to *bold* for WhatsApp native bold
    var cleaned = message.replace(/\*\*([^*]+)\*\*/g, '*$1*');
    var to      = formatWaId(waId);

    var res = await axios.post(
      BASE_URL + '/' + getPhoneNumberId() + '/messages',
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                to,
        type:              'text',
        text:              { body: cleaned, preview_url: false },
      },
      { headers: getHeaders(), timeout: 15000 }
    );

    console.log('[WA] Send success to', to, '| msg id:', res.data && res.data.messages && res.data.messages[0] && res.data.messages[0].id);
    return res.data;
  } catch(err) {
    console.error('[WA] sendMessage error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// UPLOAD MEDIA
// Upload a file buffer to Meta, returns media_id
// ─────────────────────────────────────────────

async function uploadMedia(buffer, filename, contentType) {
  try {
    var form = new FormData();
    form.append('file', buffer, {
      filename:    filename || 'file.pdf',
      contentType: contentType || 'application/pdf',
      knownLength: buffer.length,
    });
    form.append('messaging_product', 'whatsapp');
    form.append('type', contentType || 'application/pdf');

    var headers = Object.assign(
      { 'Authorization': 'Bearer ' + (process.env.META_ACCESS_TOKEN || META_TOKEN) },
      form.getHeaders()
    );

    var res = await axios.post(
      BASE_URL + '/' + getPhoneNumberId() + '/media',
      form,
      { headers: headers, timeout: 60000, maxContentLength: 25 * 1024 * 1024, maxBodyLength: 25 * 1024 * 1024 }
    );

    console.log('[WA] Media uploaded, id:', res.data && res.data.id);
    return res.data && res.data.id;
  } catch(err) {
    console.error('[WA] uploadMedia error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND DOCUMENT
// Downloads file from URL, uploads to Meta, sends as document
// ─────────────────────────────────────────────

async function sendDocument(waId, fileUrl, filename, caption) {
  try {
    var to = formatWaId(waId);

    // Download the file first
    var downloaded = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout:      30000,
    });

    var buffer      = Buffer.from(downloaded.data);
    var contentType = downloaded.headers['content-type'] || 'application/pdf';
    console.log('[WA] Downloaded file:', buffer.length, 'bytes for', to);

    // Upload to Meta
    var mediaId = await uploadMedia(buffer, filename || 'Quote_2117.pdf', contentType);
    if (!mediaId) {
      console.error('[WA] Upload failed — sending link instead');
      // Fallback: send as text with link
      return await sendMessage(waId, (caption || 'Your quote') + '\n\n' + fileUrl);
    }

    // Send as document message
    var res = await axios.post(
      BASE_URL + '/' + getPhoneNumberId() + '/messages',
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                to,
        type:              'document',
        document: {
          id:       mediaId,
          filename: filename || 'Quote_2117.pdf',
          caption:  caption  || '',
        },
      },
      { headers: getHeaders(), timeout: 15000 }
    );

    console.log('[WA] Document sent to', to, '| msg id:', res.data && res.data.messages && res.data.messages[0] && res.data.messages[0].id);
    return res.data;
  } catch(err) {
    console.error('[WA] sendDocument error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND FILE TO NUMBER (alias — used by notifyJeff)
// ─────────────────────────────────────────────

async function sendFileToNumber(waId, fileUrl, filename, caption) {
  return sendDocument(waId, fileUrl, filename, caption);
}

// ─────────────────────────────────────────────
// ASSIGN TO TEAM
// Meta Cloud API has no built-in assignment — 
// handled by Chatwoot inbox instead.
// This is a no-op kept for interface compatibility.
// ─────────────────────────────────────────────

async function assignToTeam(waId) {
  console.log('[WA] assignToTeam — handled by Chatwoot inbox for', waId);
  return true;
}

// ─────────────────────────────────────────────
// SEND TEMPLATE MESSAGE
// Sends a pre-approved WhatsApp template
// ─────────────────────────────────────────────

async function sendTemplate(waId, templateName, parameters) {
  try {
    var to         = formatWaId(waId);
    var components = [];

    if (parameters && parameters.length > 0) {
      components.push({
        type:       'body',
        parameters: parameters.map(function(value) {
          return { type: 'text', text: String(value) };
        }),
      });
    }

    var res = await axios.post(
      BASE_URL + '/' + getPhoneNumberId() + '/messages',
      {
        messaging_product: 'whatsapp',
        to:                to,
        type:              'template',
        template: {
          name:       templateName,
          language:   { code: 'en' },
          components: components,
        },
      },
      { headers: getHeaders(), timeout: 15000 }
    );

    console.log('[WA] Template sent to', to, ':', templateName);
    return res.data;
  } catch(err) {
    console.error('[WA] sendTemplate error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// NOTIFY JEFF
// ─────────────────────────────────────────────

async function notifyJeff(customerName, customerWaId, lastMessage, fileUrl, filename) {
  var jeffNumber = process.env.JEFF_WHATSAPP;
  if (!jeffNumber) {
    console.log('[WA] JEFF_WHATSAPP not set — skipping');
    return null;
  }

  var alertText = 'Hi Jeff, Kino has flagged a new enquiry for you.\n\n'
    + 'Customer: ' + customerName + '\n'
    + 'WA: +' + customerWaId + '\n\n'
    + 'Equipment list attached below. Please follow up directly.';

  await sendMessage(jeffNumber, alertText);

  if (fileUrl) {
    var result = await sendFileToNumber(
      jeffNumber,
      fileUrl,
      filename || 'equipment-list.pdf',
      'Equipment list from ' + customerName
    );
    if (!result) {
      await sendMessage(jeffNumber,
        'Note: Could not auto-forward the file. '
        + 'Please check the Chatwoot conversation with +' + customerWaId + ' to view the original.'
      );
    }
  } else if (lastMessage) {
    await sendMessage(jeffNumber, 'Details: "' + lastMessage.substring(0, 300) + '"');
  }

  console.log('[WA] Jeff notification complete for', customerWaId);
  return true;
}

module.exports = {
  sendMessage,
  sendDocument,
  sendFileToNumber,
  sendTemplate,
  assignToTeam,
  notifyJeff,
};
