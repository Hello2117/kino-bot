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
// DOWNLOAD FILE FROM WATI (requires auth)
// ─────────────────────────────────────────────

async function downloadWatiFile(fileUrl) {
  try {
    console.log('[WATI] Downloading file from:', fileUrl.substring(0, 80));
    var response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': 'Bearer ' + WATI_API_KEY },
      timeout: 20000,
    });
    var contentType = response.headers['content-type'] || 'application/pdf';
    console.log('[WATI] File downloaded, size:', response.data.byteLength, 'bytes, type:', contentType);
    return {
      data:        Buffer.from(response.data),
      contentType: contentType,
    };
  } catch (err) {
    console.error('[WATI] downloadWatiFile error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// SEND FILE TO WHATSAPP NUMBER
// Downloads from WATI then sends as multipart upload
// ─────────────────────────────────────────────

async function sendFileToNumber(waId, fileUrl, filename, caption) {
  if (!filename) filename = 'equipment-list.pdf';
  if (!caption)  caption  = '';

  // Step 1 — Try sendSessionFileViaUrl (simplest — WATI fetches the file itself)
  // This only works if the URL is publicly accessible
  try {
    console.log('[WATI] Trying sendSessionFileViaUrl...');
    var res1 = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionFileViaUrl/' + waId,
      { url: fileUrl, filename: filename, caption: caption },
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/json',
      }}
    );
    if (res1.data && (res1.data.ok || res1.data.result === 'success')) {
      console.log('[WATI] sendSessionFileViaUrl success');
      return res1.data;
    }
    console.log('[WATI] sendSessionFileViaUrl returned:', JSON.stringify(res1.data).substring(0, 100));
  } catch (err) {
    console.warn('[WATI] sendSessionFileViaUrl failed:', err.response && JSON.stringify(err.response.data) || err.message);
  }

  // Step 2 — Download file using WATI auth then send as multipart upload
  console.log('[WATI] Falling back to download + multipart upload...');
  var downloaded = await downloadWatiFile(fileUrl);
  if (!downloaded) {
    console.error('[WATI] Could not download file');
    return null;
  }

  try {
    var form = new FormData();
    form.append('file', downloaded.data, {
      filename:    filename,
      contentType: downloaded.contentType,
      knownLength: downloaded.data.length,
    });
    if (caption) form.append('caption', caption);

    var headers = Object.assign(
      { 'Authorization': 'Bearer ' + WATI_API_KEY },
      form.getHeaders()
    );

    var res2 = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionFile/' + waId,
      form,
      { headers: headers, timeout: 30000, maxContentLength: 20 * 1024 * 1024 }
    );
    console.log('[WATI] sendSessionFile (multipart) response:', JSON.stringify(res2.data).substring(0, 200));
    if (res2.data && (res2.data.ok || res2.data.result === 'success')) {
      console.log('[WATI] File sent successfully via multipart upload');
      return res2.data;
    }
    return res2.data;
  } catch (err) {
    console.error('[WATI] sendSessionFile multipart error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// NOTIFY JEFF
// Sends text alert then forwards the actual file
// No handoff — Kino keeps the conversation going
// ─────────────────────────────────────────────

async function notifyJeff(customerName, customerWaId, lastMessage, fileUrl, filename) {
  var jeffNumber = process.env.JEFF_WHATSAPP;
  if (!jeffNumber) {
    console.log('[WATI] JEFF_WHATSAPP not set — skipping Jeff notification');
    return null;
  }

  // Text alert
  var alertText = 'Hi Jeff, Kino has flagged a new enquiry for you.\n\n'
    + 'Customer: ' + customerName + '\n'
    + 'WA: +' + customerWaId + '\n\n'
    + 'Equipment list attached below.';

  await sendMessage(jeffNumber, alertText);

  // Forward the file
  if (fileUrl) {
    var fileResult = await sendFileToNumber(
      jeffNumber,
      fileUrl,
      filename || 'equipment-list.pdf',
      'Equipment list from ' + customerName
    );
    if (!fileResult) {
      // Final fallback — send the internal URL so Jeff can retrieve manually
      console.log('[WATI] All file send attempts failed — sending URL as fallback text');
      await sendMessage(jeffNumber,
        'Could not auto-forward the file. Access it here (requires WATI login):\n' + fileUrl
      );
    }
  } else if (lastMessage) {
    await sendMessage(jeffNumber, 'Details: "' + lastMessage.substring(0, 300) + '"');
  }

  console.log('[WATI] Jeff notification complete for customer ' + customerWaId);
  return true;
}

module.exports = { sendMessage, sendFileToNumber, assignToTeam, sendTemplate, notifyJeff };
