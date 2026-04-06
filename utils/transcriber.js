// utils/transcriber.js
// Transcribes voice messages using OpenAI Whisper.
// Supports OGG (WhatsApp default), MP3, MP4, WAV, M4A.

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const OpenAI = require('openai');

var openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('[Transcriber] OpenAI Whisper ready');
} else {
  console.log('[Transcriber] OPENAI_API_KEY not set — voice messages will not be transcribed');
}

// Download audio file from WATI (requires auth)
async function downloadAudio(audioUrl, watiApiKey) {
  try {
    console.log('[Transcriber] Downloading audio:', audioUrl.substring(0, 80));
    var res = await axios({
      method:       'GET',
      url:          audioUrl,
      responseType: 'arraybuffer',
      timeout:      20000,
      headers: {
        'Authorization': 'Bearer ' + watiApiKey,
        'Accept':        '*/*',
      },
    });
    var contentType = (res.headers['content-type'] || 'audio/ogg').split(';')[0].trim();
    var ext         = contentType.includes('ogg')  ? '.ogg'
                    : contentType.includes('mp4')  ? '.mp4'
                    : contentType.includes('mpeg') ? '.mp3'
                    : contentType.includes('wav')  ? '.wav'
                    : contentType.includes('m4a')  ? '.m4a'
                    : '.ogg';

    var tmpFile = path.join(os.tmpdir(), 'kino_audio_' + Date.now() + ext);
    fs.writeFileSync(tmpFile, Buffer.from(res.data));
    console.log('[Transcriber] Downloaded ' + res.data.byteLength + ' bytes → ' + tmpFile);
    return { filePath: tmpFile, ext: ext };
  } catch(err) {
    console.error('[Transcriber] Download error:', err.message);
    return null;
  }
}

// Transcribe audio file using OpenAI Whisper
async function transcribeAudio(audioUrl) {
  if (!openai) {
    console.log('[Transcriber] OpenAI not configured — skipping transcription');
    return null;
  }

  var downloaded = await downloadAudio(audioUrl, process.env.WATI_API_KEY);
  if (!downloaded) return null;

  try {
    console.log('[Transcriber] Sending to Whisper...');
    var transcript = await openai.audio.transcriptions.create({
      file:     fs.createReadStream(downloaded.filePath),
      model:    'whisper-1',
      language: 'ms', // Malay — Whisper also picks up English automatically
      prompt:   'Cinema equipment rental inquiry in English or Malay. May include camera names, lens names, technical terms.',
    });

    // Clean up temp file
    try { fs.unlinkSync(downloaded.filePath); } catch(e) {}

    var text = transcript.text && transcript.text.trim();
    if (!text) return null;

    console.log('[Transcriber] Transcript:', text.substring(0, 120));
    return text;

  } catch(err) {
    console.error('[Transcriber] Whisper error:', err.message);
    try { fs.unlinkSync(downloaded.filePath); } catch(e) {}
    return null;
  }
}

module.exports = { transcribeAudio };
