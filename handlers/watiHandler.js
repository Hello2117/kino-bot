// handlers/watiHandler.js
const axios    = require('axios');
const FormData = require('form-data');

const WATI_BASE_URL = process.env.WATI_BASE_URL;
const WATI_API_KEY  = process.env.WATI_API_KEY;

// ─────────────────────────────────────────────
// SEND TEXT MESSAGE
// ─────────────────────────────────────────────

async function sendMessage(waId, message) {
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionMessage/' + waId,
      'messageText=' + encodeURIComponent(message),
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/x-www-form-urlencoded',
      }}
    );
    console.log('[WATI] Send success:', JSON.stringify(res.data).substring(0, 100));
    return res.data;
  } catch (err) {
    console.error('[WATI] sendMessage error:', err.response && err.response.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// ASSIGN TO TEAM
// ─────────────────────────────────────────────

async function assignToTeam(waId) {
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/assignConversation/' + waId,
      { assignedTo: null },
      { headers: { 'Authorization': 'Bearer ' + WATI_API_KEY } }
    );
    return res.data;
  } catch (err) {
    console.error('[WATI] assignToTeam error:', err.response && err.response.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND TEMPLATE
// ─────────────────────────────────────────────

async function sendTemplate(waId, templateName, parameters) {
  if (!parameters) parameters = [];
  try {
    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendTemplateMessage',
      {
        whatsappNumber: waId,
        template_name:  templateName,
        broadcast_name: templateName,
        parameters:     parameters.map(function(value) { return { name: 'text', value: value }; }),
      },
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/json',
      }}
    );
    return res.data;
  } catch (err) {
    console.error('[WATI] sendTemplate error:', err.response && err.response.data || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// DOWNLOAD FILE FROM WATI (authenticated)
// WATI internal URLs require the API bearer token
// ─────────────────────────────────────────────

async function downloadWatiFile(fileUrl) {
  try {
    console.log('[WATI] Downloading file from WATI:', fileUrl.substring(0, 100));
    var response = await axios({
      method:       'GET',
      url:          fileUrl,
      responseType: 'arraybuffer',
      maxRedirects: 5,
      timeout:      30000,
      headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Accept':        '*/*',
      },
    });

    // Determine correct content type
    var contentType = response.headers['content-type'] || 'application/pdf';
    // Strip charset or boundary info — keep only the mime type
    contentType = contentType.split(';')[0].trim();

    var buffer = Buffer.from(response.data);
    console.log('[WATI] Downloaded ' + buffer.length + ' bytes, type: ' + contentType);

    // Verify it looks like a PDF (starts with %PDF)
    var header = buffer.slice(0, 4).toString('ascii');
    if (header !== '%PDF') {
      console.warn('[WATI] Warning: file does not start with %PDF header, got:', header);
    }

    return { data: buffer, contentType: contentType };
  } catch (err) {
    console.error('[WATI] downloadWatiFile error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND FILE TO A WHATSAPP NUMBER
// Always downloads first (for auth) then re-uploads as multipart
// This avoids WATI fetching the URL without credentials
// ─────────────────────────────────────────────

async function sendFileToNumber(waId, fileUrl, filename, caption) {
  if (!filename) filename = 'equipment-list.pdf';
  if (!caption)  caption  = '';

  console.log('[WATI] Sending file to ' + waId + ': ' + filename);

  // Always download first — WATI internal URLs need auth
  var downloaded = await downloadWatiFile(fileUrl);
  if (!downloaded) {
    console.error('[WATI] Failed to download file — cannot forward');
    return null;
  }

  // Determine file extension for correct content type
  var ext = filename.split('.').pop().toLowerCase();
  var mimeMap = {
    pdf:  'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:  'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
  };
  var contentType = mimeMap[ext] || downloaded.contentType || 'application/pdf';

  try {
    var form = new FormData();
    form.append('file', downloaded.data, {
      filename:    filename,
      contentType: contentType,
      knownLength: downloaded.data.length,
    });
    if (caption) form.append('caption', caption);

    var headers = Object.assign(
      { 'Authorization': 'Bearer ' + WATI_API_KEY },
      form.getHeaders()
    );

    console.log('[WATI] Uploading ' + downloaded.data.length + ' bytes as ' + contentType + ' to ' + waId);

    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionFile/' + waId,
      form,
      {
        headers:          headers,
        timeout:          60000,
        maxContentLength: 25 * 1024 * 1024, // 25MB limit
        maxBodyLength:    25 * 1024 * 1024,
      }
    );

    console.log('[WATI] sendSessionFile response:', JSON.stringify(res.data).substring(0, 200));

    if (res.data && (res.data.ok || res.data.result === 'success')) {
      console.log('[WATI] File forwarded to ' + waId + ' successfully');
      return res.data;
    }

    console.warn('[WATI] sendSessionFile returned unexpected response:', JSON.stringify(res.data));
    return res.data;

  } catch (err) {
    console.error('[WATI] sendSessionFile error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// NOTIFY JEFF
// Text alert + forwards the actual file (no handoff)
// ─────────────────────────────────────────────

async function notifyJeff(customerName, customerWaId, lastMessage, fileUrl, filename) {
  var jeffNumber = process.env.JEFF_WHATSAPP;
  if (!jeffNumber) {
    console.log('[WATI] JEFF_WHATSAPP not set — skipping Jeff notification');
    return null;
  }

  // Text alert first
  var alertText = 'Hi Jeff, Kino has flagged a new enquiry for you.\n\n'
    + 'Customer: ' + customerName + '\n'
    + 'WA: +' + customerWaId + '\n\n'
    + 'Equipment list is attached below. Please follow up directly.';

  await sendMessage(jeffNumber, alertText);

  // Forward the actual file
  if (fileUrl) {
    var fileResult = await sendFileToNumber(
      jeffNumber,
      fileUrl,
      filename || 'equipment-list.pdf',
      'Equipment list from ' + customerName
    );

    if (!fileResult) {
      console.error('[WATI] File forward to Jeff failed completely');
      await sendMessage(jeffNumber,
        'Note: File could not be forwarded automatically. '
        + 'Please check the WATI conversation with +' + customerWaId + ' to access the original file.'
      );
    }
  } else if (lastMessage) {
    await sendMessage(jeffNumber, 'Details: "' + lastMessage.substring(0, 300) + '"');
  }

  console.log('[WATI] Jeff notification complete for customer ' + customerWaId);
  return true;
}

module.exports = { sendMessage, sendFileToNumber, assignToTeam, sendTemplate, notifyJeff };
