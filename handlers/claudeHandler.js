// handlers/claudeHandler.js
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Load system prompt once at startup
var SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/kino_system.txt'),
  'utf8'
);

// ─────────────────────────────────────────────
// HANDOFF DETECTION
// ─────────────────────────────────────────────

function detectsHandoffTrigger(text) {
  var triggers = [
    'loop in our team',
    'team kami handle',
    'expect a message from us shortly',
    'kejap lagi ada orang akan reach out',
    'let me flag that to our team',
    'pass this to jeff',
    'serahkan kepada jeff',
  ];
  var lower = text.toLowerCase();
  return triggers.some(function(t) { return lower.includes(t); });
}

// ─────────────────────────────────────────────
// CURRENT DATE (Malaysia time)
// ─────────────────────────────────────────────

function getMalaysiaDateString() {
  var now = new Date();
  return now.toLocaleDateString('en-MY', {
    weekday:  'long',
    year:     'numeric',
    month:    'long',
    day:      'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

// ─────────────────────────────────────────────
// IMAGE FETCHING (for vision support)
// ─────────────────────────────────────────────

async function fetchImageAsBase64(imageUrl) {
  try {
    var response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': 'Bearer ' + process.env.WATI_API_KEY },
    });
    var base64 = Buffer.from(response.data).toString('base64');
    var contentType = response.headers['content-type'] || 'image/jpeg';
    return { base64: base64, contentType: contentType };
  } catch (err) {
    console.error('[Claude] Image fetch error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// BOOQABLE AVAILABILITY CHECK
// ─────────────────────────────────────────────

// Detect if customer message is asking about availability
function detectsAvailabilityQuery(text) {
  var keywords = [
    'available', 'availability', 'ada tak', 'ada ke',
    'boleh dapat', 'still free', 'book', 'reserve', 'tempah',
    'is there', 'do you have', 'in stock',
  ];
  var lower = text.toLowerCase();
  return keywords.some(function(k) { return lower.includes(k); });
}

// Extract a date from natural text e.g. "15 April", "10/04/2025"
function extractSimpleDate(text) {
  var months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  var year = new Date().getFullYear();

  // "15 April" or "15 Apr"
  var match = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (match) {
    var month = months[match[2].toLowerCase().substring(0, 3)];
    return year + '-' + String(month).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0');
  }

  // "April 15"
  match = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
  if (match) {
    var month2 = months[match[1].toLowerCase().substring(0, 3)];
    return year + '-' + String(month2).padStart(2, '0') + '-' + String(match[2]).padStart(2, '0');
  }

  // "15/04" or "15-04"
  match = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    var y = match[3] ? (match[3].length === 2 ? '20' + match[3] : match[3]) : year;
    return y + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0');
  }

  return null;
}

// Gear keywords to match against customer message
var GEAR_KEYWORDS = [
  'alexa 35', 'alexa mini', 'venice', 'raptor', 'burano',
  'fx3', 'fx6', 'signature prime', 'atlas orion', 'atlas mercury',
  'zeiss super speed', 'contax zeiss', 'sigma cine', 'cooke sp3',
  'lomo', 'dzofilm', 'arles', 'vespid', 'laowa', 'blazar', 'remus',
  'aivascope', 'dulens', 'leica-r', 'olympus zuiko', 'canon nfd',
  'hollyland', 'teradek', 'vaxis', 'sachtler', 'ronin', 'tilta',
  'smallhd', 'atomos', 'swit',
];

async function getAvailabilityContext(text, fromDate) {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return '';

  try {
    var lower = text.toLowerCase();
    var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    if (!gearMention) return '';

    // Search Booqable for this product
    var axios2 = require('axios');
    var booqable = axios2.create({
      baseURL: process.env.BOOQABLE_BASE_URL,
      headers: {
        'Authorization': 'Bearer ' + process.env.BOOQABLE_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    var searchRes = await booqable.get('/products', {
      params: { 'filter[q]': gearMention, 'filter[status]': 'active', 'page[size]': 3 },
    });

    var products = searchRes.data.products || [];
    if (products.length === 0) return '';

    // Check availability for each product found
    var availLines = [];
    for (var i = 0; i < products.length; i++) {
      var product = products[i];
      try {
        var availRes = await booqable.get('/products/' + product.id + '/stock_items', {
          params: { 'filter[from]': fromDate, 'filter[till]': fromDate },
        });
        var items     = availRes.data.stock_items || [];
        var available = items.filter(function(item) { return item.status === 'available'; });
        availLines.push(product.name + ': ' + (available.length > 0 ? 'AVAILABLE (' + available.length + ' unit(s))' : 'NOT AVAILABLE'));
      } catch(e) {
        availLines.push(product.name + ': availability unknown');
      }
    }

    if (availLines.length === 0) return '';

    return '\n[BOOQABLE LIVE AVAILABILITY for ' + fromDate + ': ' + availLines.join(' | ') + '. Use this to answer the customer accurately. Do not guess.]';

  } catch (err) {
    console.error('[Claude] getAvailabilityContext error:', err.message);
    return '';
  }
}

// ─────────────────────────────────────────────
// MAIN KINO FUNCTION
// ─────────────────────────────────────────────

async function askKino(conversationHistory, newUserMessage, imageUrl) {

  // 1 — Inject current Malaysia date
  var dateString    = getMalaysiaDateString();
  var systemWithDate = SYSTEM_PROMPT + '\n\nCURRENT DATE: ' + dateString + ' (Malaysia time). Always use this when answering questions about dates, scheduling, and availability.';

  // 2 — Check Booqable availability if customer asks about specific gear + date
  var availabilityContext = '';
  if (detectsAvailabilityQuery(newUserMessage)) {
    var date = extractSimpleDate(newUserMessage);
    if (date) {
      console.log('[Claude] Checking Booqable availability for date:', date);
      availabilityContext = await getAvailabilityContext(newUserMessage, date);
      if (availabilityContext) {
        console.log('[Claude] Availability context added:', availabilityContext.substring(0, 100));
      }
    }
  }

  // 3 — Build user content (text or image)
  var userContent;
  if (imageUrl) {
    var imageData = await fetchImageAsBase64(imageUrl);
    if (imageData) {
      userContent = [
        {
          type: 'image',
          source: {
            type:       'base64',
            media_type: imageData.contentType,
            data:       imageData.base64,
          },
        },
        {
          type: 'text',
          text: (newUserMessage || 'The customer sent this image. Describe what you see and respond helpfully in the context of cinema equipment rental.') + availabilityContext,
        },
      ];
    } else {
      userContent = newUserMessage + ' [Note: customer sent an image but it could not be loaded]' + availabilityContext;
    }
  } else {
    userContent = newUserMessage + availabilityContext;
  }

  // 4 — Build messages array
  var messages = conversationHistory.concat([
    { role: 'user', content: userContent }
  ]);

  // 5 — Call Claude
  try {
    var response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     systemWithDate,
      messages:   messages,
    });

    var reply = response.content[0] && response.content[0].text
      ? response.content[0].text
      : "Sorry, I didn't catch that. Could you repeat?";

    var handoffTriggered = detectsHandoffTrigger(reply);
    return { reply: reply, handoffTriggered: handoffTriggered };

  } catch (err) {
    console.error('[Claude] askKino error:', err.message);
    return {
      reply:            "Sorry, I'm having a moment — please try again shortly, or message us directly.",
      handoffTriggered: false,
    };
  }
}

module.exports = { askKino };
