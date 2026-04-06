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
    // Strip double-asterisk markdown (**bold**) but keep single *bold* for WhatsApp native bold
    var cleaned = message
      .replace(/[*][*]([^*]+)[*][*]/g, '*$1*');

    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionMessage/' + waId,
      'messageText=' + encodeURIComponent(cleaned),
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
      WATI_BASE_URL + '/api/v1/assignConversation',
      { whatsappNumber: waId, assignedTo: null },
      { headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Content-Type':  'application/json',
      }}
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
// DOWNLOAD FILE — handles WATI redirect to CDN
// WATI's showFile endpoint often redirects to S3/CDN
// We get the redirect URL first, then download from there
// ─────────────────────────────────────────────

async function downloadWatiFile(fileUrl) {
  // Attempt 1 — follow redirect, try with auth first
  try {
    console.log('[WATI] Downloading (with auth):', fileUrl.substring(0, 100));
    var res = await axios({
      method:       'GET',
      url:          fileUrl,
      responseType: 'arraybuffer',
      maxRedirects: 10,
      timeout:      30000,
      headers: {
        'Authorization': 'Bearer ' + WATI_API_KEY,
        'Accept':        'application/pdf,application/octet-stream,*/*',
      },
    });
    var buf = Buffer.from(res.data);
    var header = buf.slice(0, 4).toString('ascii');
    console.log('[WATI] Downloaded ' + buf.length + ' bytes, header: "' + header + '"');
    if (header === '%PDF') {
      return { data: buf, contentType: 'application/pdf' };
    }
    console.warn('[WATI] Auth download did not return PDF, trying without auth...');
  } catch (e) {
    console.warn('[WATI] Auth download failed:', e.message);
  }

  // Attempt 2 — get redirect URL first, then download without auth
  // (CDN URLs like S3 reject extra auth headers)
  try {
    console.log('[WATI] Getting redirect URL...');
    var redirect = await axios({
      method:       'GET',
      url:          fileUrl,
      maxRedirects: 0,
      timeout:      10000,
      headers: { 'Authorization': 'Bearer ' + WATI_API_KEY },
      validateStatus: function(s) { return s < 400; },
    });

    var cdnUrl = redirect.headers && redirect.headers['location'];
    if (cdnUrl) {
      console.log('[WATI] Got CDN redirect URL:', cdnUrl.substring(0, 80));
      var cdnRes = await axios({
        method:       'GET',
        url:          cdnUrl,
        responseType: 'arraybuffer',
        maxRedirects: 5,
        timeout:      30000,
      });
      var cdnBuf    = Buffer.from(cdnRes.data);
      var cdnHeader = cdnBuf.slice(0, 4).toString('ascii');
      console.log('[WATI] CDN download: ' + cdnBuf.length + ' bytes, header: "' + cdnHeader + '"');
      if (cdnHeader === '%PDF') {
        return { data: cdnBuf, contentType: 'application/pdf' };
      }
    }
  } catch (e) {
    console.warn('[WATI] Redirect/CDN download failed:', e.message);
  }

  // Attempt 3 — try WATI getMedia endpoint by filename
  try {
    var fileNameMatch = fileUrl.match(/fileName=([^&]+)/);
    if (fileNameMatch) {
      var encodedName = fileNameMatch[1];
      var mediaUrl    = WATI_BASE_URL + '/api/v1/getMedia?fileName=' + encodedName;
      console.log('[WATI] Trying getMedia endpoint:', mediaUrl.substring(0, 100));
      var mediaRes = await axios({
        method:       'GET',
        url:          mediaUrl,
        responseType: 'arraybuffer',
        timeout:      30000,
        headers: { 'Authorization': 'Bearer ' + WATI_API_KEY },
      });
      var mediaBuf    = Buffer.from(mediaRes.data);
      var mediaHeader = mediaBuf.slice(0, 4).toString('ascii');
      console.log('[WATI] getMedia: ' + mediaBuf.length + ' bytes, header: "' + mediaHeader + '"');
      if (mediaHeader === '%PDF') {
        return { data: mediaBuf, contentType: 'application/pdf' };
      }
    }
  } catch (e) {
    console.warn('[WATI] getMedia failed:', e.message);
  }

  console.error('[WATI] All download attempts failed or returned non-PDF data');
  return null;
}

// ─────────────────────────────────────────────
// SEND FILE TO A WHATSAPP NUMBER
// Downloads with auth, uploads as clean multipart
// ─────────────────────────────────────────────

async function sendFileToNumber(waId, fileUrl, filename, caption) {
  if (!filename) filename = 'equipment-list.pdf';
  if (!caption)  caption  = '';

  console.log('[WATI] Forwarding file to ' + waId + ': ' + filename);

  var downloaded = await downloadWatiFile(fileUrl);
  if (!downloaded) {
    console.error('[WATI] Download failed — cannot forward file');
    return null;
  }

  try {
    var form = new FormData();
    form.append('file', downloaded.data, {
      filename:    filename,
      contentType: 'application/pdf',
      knownLength: downloaded.data.length,
    });
    if (caption) form.append('caption', caption);

    var headers = Object.assign(
      { 'Authorization': 'Bearer ' + WATI_API_KEY },
      form.getHeaders()
    );

    console.log('[WATI] Uploading ' + downloaded.data.length + ' bytes to ' + waId);

    var res = await axios.post(
      WATI_BASE_URL + '/api/v1/sendSessionFile/' + waId,
      form,
      {
        headers:          headers,
        timeout:          60000,
        maxContentLength: 25 * 1024 * 1024,
        maxBodyLength:    25 * 1024 * 1024,
      }
    );

    console.log('[WATI] sendSessionFile response:', JSON.stringify(res.data).substring(0, 200));
    return res.data;

  } catch (err) {
    console.error('[WATI] sendSessionFile error:', err.response && JSON.stringify(err.response.data) || err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// NOTIFY JEFF
// Text alert + clean file forward — no handoff
// ─────────────────────────────────────────────

async function notifyJeff(customerName, customerWaId, lastMessage, fileUrl, filename) {
  var jeffNumber = process.env.JEFF_WHATSAPP;
  if (!jeffNumber) {
    console.log('[WATI] JEFF_WHATSAPP not set — skipping');
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
        + 'Please check the WATI conversation with +' + customerWaId + ' to view the original.'
      );
    }
  } else if (lastMessage) {
    await sendMessage(jeffNumber, 'Details: "' + lastMessage.substring(0, 300) + '"');
  }

  console.log('[WATI] Jeff notification complete for ' + customerWaId);
  return true;
}

module.exports = { sendMessage, sendFileToNumber, assignToTeam, sendTemplate, notifyJeff };
