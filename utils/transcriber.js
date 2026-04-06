// utils/transcriber.js
// Transcribes voice messages using OpenAI Whisper.
// Compatible with Node.js 18 (no global File needed).

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const OpenAI = require('openai');
const { toFile } = require('openai');

var openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('[Transcriber] OpenAI Whisper ready');
} else {
  console.log('[Transcriber] OPENAI_API_KEY not set — voice messages will not be transcribed');
}

// Download audio from WATI (authenticated)
async function downloadAudio(audioUrl) {
  try {
    console.log('[Transcriber] Downloading audio:', audioUrl.substring(0, 100));
    var res = await axios({
      method:       'GET',
      url:          audioUrl,
      responseType: 'arraybuffer',
      timeout:      20000,
      headers: {
        'Authorization': 'Bearer ' + process.env.WATI_API_KEY,
        'Accept':        '*/*',
      },
    });

    var contentType = (res.headers['content-type'] || 'audio/ogg').split(';')[0].trim();
    var ext = contentType.includes('ogg')  ? '.ogg'
            : contentType.includes('mp4')  ? '.mp4'
            : contentType.includes('mpeg') ? '.mp3'
            : contentType.includes('wav')  ? '.wav'
            : contentType.includes('m4a')  ? '.m4a'
            : '.ogg';

    var buffer  = Buffer.from(res.data);
    var tmpPath = path.join(os.tmpdir(), 'kino_audio_' + Date.now() + ext);
    fs.writeFileSync(tmpPath, buffer);

    console.log('[Transcriber] Downloaded ' + buffer.length + ' bytes → ' + tmpPath);
    return { filePath: tmpPath, buffer: buffer, ext: ext, contentType: contentType };
  } catch(err) {
    console.error('[Transcriber] Download error:', err.message);
    return null;
  }
}

// Transcribe using OpenAI Whisper — Node 18 compatible via toFile()
async function transcribeAudio(audioUrl) {
  if (!openai) {
    console.log('[Transcriber] OpenAI not configured — skipping transcription');
    return null;
  }

  var downloaded = await downloadAudio(audioUrl);
  if (!downloaded) return null;

  try {
    console.log('[Transcriber] Sending to Whisper...');

    // Use toFile() from openai package — Node 18 compatible, no global File needed
    var audioFile = await toFile(
      downloaded.buffer,
      'audio' + downloaded.ext,
      { type: downloaded.contentType }
    );

    var transcript = await openai.audio.transcriptions.create({
      file:     audioFile,
      model:    'whisper-1',
      language: 'ms',
      prompt:   'Cinema equipment rental inquiry in English or Bahasa Malaysia. May include camera names, lens names, and technical terms.',
    });

    try { fs.unlinkSync(downloaded.filePath); } catch(e) {}

    var text = transcript.text && transcript.text.trim();
    if (!text) return null;

    console.log('[Transcriber] Transcript:', text.substring(0, 150));
    return text;

  } catch(err) {
    console.error('[Transcriber] Whisper error:', err.message);
    try { fs.unlinkSync(downloaded.filePath); } catch(e) {}
    return null;
  }
}

module.exports = { transcribeAudio };
