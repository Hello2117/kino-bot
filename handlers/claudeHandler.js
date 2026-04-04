const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/kino_system.txt'),
  'utf8'
);

function detectsHandoffTrigger(text) {
  const triggers = [
    'loop in our team',
    'team kami handle',
    'expect a message from us shortly',
    'kejap lagi ada orang akan reach out',
    'let me flag that to our team',
  ];
  const lower = text.toLowerCase();
  return triggers.some(function(t) { return lower.includes(t); });
}

async function fetchImageAsBase64(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data).toString('base64');
    const contentType = response.headers['content-type'] || 'image/jpeg';
    return { base64, contentType };
  } catch (err) {
    console.error('[Claude] Image fetch error:', err.message);
    return null;
  }
}

async function askKino(conversationHistory, newUserMessage, imageUrl) {
  var userContent;

  if (imageUrl) {
    // Fetch image and build vision message
    var imageData = await fetchImageAsBase64(imageUrl);
    if (imageData) {
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageData.contentType,
            data: imageData.base64,
          },
        },
        {
          type: 'text',
          text: newUserMessage || 'The customer sent this image. Describe what you see and respond helpfully in the context of cinema equipment rental.',
        },
      ];
    } else {
      // Image fetch failed — treat as text
      userContent = newUserMessage + ' [Note: customer sent an image but it could not be loaded]';
    }
  } else {
    userContent = newUserMessage;
  }

  var messages = conversationHistory.concat([
    { role: 'user', content: userContent }
  ]);

  try {
    var response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    var reply = response.content[0] && response.content[0].text
      ? response.content[0].text
      : "Sorry, I didn't catch that. Could you repeat?";

    var handoffTriggered = detectsHandoffTrigger(reply);
    return { reply: reply, handoffTriggered: handoffTriggered };

  } catch (err) {
    console.error('[Claude] askKino error:', err.message);
    return {
      reply: "Sorry, I'm having a moment — please try again shortly, or message us directly!",
      handoffTriggered: false,
    };
  }
}

module.exports = { askKino };