// handlers/claudeHandler.js
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
// IMAGE FETCHING
// ─────────────────────────────────────────────

async function fetchImageAsBase64(imageUrl) {
  try {
    var response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': 'Bearer ' + process.env.WATI_API_KEY },
      timeout: 10000,
    });
    var base64      = Buffer.from(response.data).toString('base64');
    var contentType = response.headers['content-type'] || 'image/jpeg';
    return { base64: base64, contentType: contentType };
  } catch (err) {
    console.error('[Claude] Image fetch error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// BOOQABLE CLIENT
// ─────────────────────────────────────────────

function getBooqableClient() {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return null;
  return axios.create({
    baseURL: process.env.BOOQABLE_BASE_URL,
    timeout: 12000,
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─────────────────────────────────────────────
// GEAR KEYWORDS + SEARCH MAP
// ─────────────────────────────────────────────

var GEAR_KEYWORDS = [
  'arri alexa 35', 'alexa 35',
  'arri alexa mini lf', 'alexa mini lf',
  'arri alexa mini', 'alexa mini',
  'sony venice 2 8k', 'venice 2',
  'sony venice 6k', 'venice 6k', 'venice 6', 'venice 1',
  'venice rialto', 'rialto',
  'red v-raptor', 'v-raptor', 'raptor',
  'sony burano', 'burano',
  'sony fx3', 'fx3',
  'sony fx6', 'fx6',
  'red komodo', 'komodo',
  'signature prime', 'arri signature',
  'atlas orion', 'atlas mercury',
  'zeiss super speed', 'super speed',
  'contax zeiss', 'cooke sp3',
  'sigma cine', 'sigma ff',
  'dzofilm arles', 'arles',
  'dzofilm vespid', 'vespid',
  'blazar remus', 'remus',
  'laowa', 'aivascope', 'dulens',
  'leica-r', 'olympus zuiko', 'canon nfd', 'zero optik',
  'hollyland', 'teradek', 'vaxis storm',
  'sachtler', 'tilta', 'nucleus-m',
  'smallhd', 'atomos', 'swit', 'fxlion',
];

var GEAR_SEARCH_MAP = {
  'alexa 35':          'Arri Alexa 35',
  'arri alexa 35':     'Arri Alexa 35',
  'alexa mini lf':     'Arri Alexa Mini LF',
  'arri alexa mini lf':'Arri Alexa Mini LF',
  'alexa mini':        'ARRI ALEXA Mini',
  'venice 2':          'Sony Venice 2 8K',
  'sony venice 2 8k':  'Sony Venice 2 8K',
  'venice 6k':         'Sony Venice 6K',
  'venice 6':          'Sony Venice 6K',
  'venice 1':          'Sony Venice 6K',
  'rialto':            'Sony Venice 2 8K Cinema Camera with Rialto',
  'venice rialto':     'Sony Venice 2 8K Cinema Camera with Rialto',
  'raptor':            'RED V-Raptor',
  'v-raptor':          'RED V-Raptor',
  'burano':            'Sony Burano',
  'fx3':               'Sony FX3',
  'fx6':               'Sony FX6',
  'komodo':            'RED Komodo',
};

// ─────────────────────────────────────────────
// DATE EXTRACTION
// ─────────────────────────────────────────────

function extractSimpleDate(text) {
  var months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  var year   = new Date().getFullYear();
  var match  = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (match) {
    var m = months[match[2].toLowerCase().substring(0, 3)];
    return year + '-' + String(m).padStart(2,'0') + '-' + String(match[1]).padStart(2,'0');
  }
  match = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
  if (match) {
    var m2 = months[match[1].toLowerCase().substring(0, 3)];
    return year + '-' + String(m2).padStart(2,'0') + '-' + String(match[2]).padStart(2,'0');
  }
  match = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    var y = match[3] ? (match[3].length === 2 ? '20' + match[3] : match[3]) : year;
    return y + '-' + String(match[2]).padStart(2,'0') + '-' + String(match[1]).padStart(2,'0');
  }
  return null;
}

// ─────────────────────────────────────────────
// BOOQABLE AVAILABILITY
// ─────────────────────────────────────────────

function detectsAvailabilityQuery(text) {
  var keywords = ['available', 'availability', 'ada tak', 'ada ke', 'boleh dapat',
    'still free', 'book', 'reserve', 'tempah', 'is there', 'do you have', 'in stock', 'free on'];
  return keywords.some(function(k) { return text.toLowerCase().includes(k); });
}

async function _fetchAvailability(text, fromDate) {
  var booqable = getBooqableClient();
  if (!booqable) return '';
  var lower       = text.toLowerCase();
  var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
  if (!gearMention) return '';
  var searchTerm  = GEAR_SEARCH_MAP[gearMention] || gearMention;
  console.log('[Claude] Booqable availability search:', searchTerm);
  var searchRes = await booqable.get('/product_groups', { params: { q: searchTerm, per: 3 } });
  var products  = (searchRes.data && (searchRes.data.product_groups || searchRes.data.products)) || [];
  if (products.length === 0) return '';
  var lines = [];
  for (var i = 0; i < products.length; i++) {
    var product   = products[i];
    var productId = product.products && product.products[0] && product.products[0].id;
    if (!productId) {
      var pgRes = await booqable.get('/product_groups/' + product.id);
      var pg    = pgRes.data && pgRes.data.product_group;
      productId = pg && pg.products && pg.products[0] && pg.products[0].id;
    }
    if (!productId) { lines.push(product.name + ': availability unknown'); continue; }
    var availRes  = await booqable.get('/products/' + productId + '/availability', {
      params: { from: fromDate, till: fromDate, interval: 'day' },
    });
    var availData = availRes.data || {};
    var dateKey   = Object.keys(availData)[0];
    var entry     = dateKey && availData[dateKey];
    var avail     = entry ? (entry.available || 0) : 0;
    var total     = entry ? (entry.total || 0) : 0;
    lines.push(product.name + ': ' + (avail > 0
      ? 'AVAILABLE (' + avail + ' of ' + total + ' unit(s) free)'
      : 'NOT AVAILABLE — fully booked on this date'));
  }
  if (lines.length === 0) return '';
  return '[BOOQABLE LIVE AVAILABILITY for ' + fromDate + ': ' + lines.join(' | ')
    + '. Use this data to answer accurately. Do not guess.]';
}

async function getAvailabilityContext(text, fromDate) {
  return Promise.race([
    _fetchAvailability(text, fromDate).catch(function(e) {
      console.error('[Claude] availability error:', e.message); return '';
    }),
    new Promise(function(resolve) {
      setTimeout(function() { console.warn('[Claude] Availability timed out'); resolve(''); }, 10000);
    }),
  ]);
}

// ─────────────────────────────────────────────
// BOOQABLE PRICING
// ─────────────────────────────────────────────

function detectsPricingQuery(text) {
  var keywords = ['how much', 'berapa', 'price', 'harga', 'rate', 'kadar',
    'cost', 'quote', 'quotation', 'sewa berapa', 'berapa sewa'];
  return keywords.some(function(k) { return text.toLowerCase().includes(k); });
}

async function _fetchPricing(productName) {
  var booqable  = getBooqableClient();
  if (!booqable) return null;
  var searchTerm = GEAR_SEARCH_MAP[productName] || productName;
  var searchRes  = await booqable.get('/product_groups', { params: { q: searchTerm, per: 5 } });
  var products   = (searchRes.data && (searchRes.data.product_groups || searchRes.data.products)) || [];
  if (products.length === 0) return null;
  var lines = products.map(function(p) {
    var price = p.base_price_in_cents
      ? 'RM' + (p.base_price_in_cents / 100).toFixed(2) + '/day'
      : 'price on request';
    return p.name + ': ' + price;
  });
  return '[BOOQABLE INDIVIDUAL PRICING: ' + lines.join(' | ')
    + '. Apply multi-day discount, 10% volume discount if total reaches RM5000, and 6% SST.]';
}

async function getProductPricing(productName) {
  return Promise.race([
    _fetchPricing(productName).catch(function(e) {
      console.error('[Claude] pricing error:', e.message); return null;
    }),
    new Promise(function(resolve) {
      setTimeout(function() { console.warn('[Claude] Pricing timed out'); resolve(null); }, 10000);
    }),
  ]);
}

// ─────────────────────────────────────────────
// WEB SEARCH — SAMPLE FOOTAGE
// ─────────────────────────────────────────────

function detectsFootageQuery(text) {
  var keywords = ['sample', 'footage', 'example', 'demo', 'reel', 'showreel',
    'how does it look', 'boleh tengok', 'nak tengok', 'show me', 'can i see',
    'instagram', 'youtube', 'vimeo', 'reference', 'test footage',
    'color science', 'dynamic range', 'low light', 'skin tone', 'contoh'];
  return keywords.some(function(k) { return text.toLowerCase().includes(k); });
}

async function searchSampleFootage(customerMessage) {
  try {
    var lower       = customerMessage.toLowerCase();
    var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    var gearName    = gearMention ? (GEAR_SEARCH_MAP[gearMention] || gearMention) : '';
    var searchQuery = gearName
      ? gearName + ' sample footage cinema reel'
      : '2117 rentals Malaysia cinema equipment sample footage';

    console.log('[Claude] Footage search:', searchQuery);

    var response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 600,
      tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
      messages:   [{
        role:    'user',
        content: 'Find 3 good sample footage or showreel links for: ' + searchQuery
          + '. Focus on Vimeo, YouTube, or manufacturer sites. Return only a short list of links with one-line descriptions. No preamble.',
      }],
    });

    var resultText = '';
    if (response.content) {
      response.content.forEach(function(block) {
        if (block.type === 'text' && block.text) resultText += block.text;
      });
    }

    if (!resultText || resultText.trim().length < 10) return null;

    return '[FOOTAGE SEARCH RESULTS: ' + resultText.trim()
      + ' Share these links naturally with the customer.]';

  } catch (err) {
    console.error('[Claude] searchSampleFootage error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// MAIN KINO FUNCTION
// ─────────────────────────────────────────────

async function askKino(conversationHistory, newUserMessage, imageUrl) {

  var dateString     = getMalaysiaDateString();
  var systemWithDate = SYSTEM_PROMPT
    + '\n\nCURRENT DATE: ' + dateString
    + ' (Malaysia time). Use this for all date, scheduling and availability questions.';

  // Run all lookups in parallel
  var availabilityContext = '';
  var pricingContext      = '';
  var footageContext      = '';
  var lookups             = [];

  if (detectsAvailabilityQuery(newUserMessage)) {
    var date = extractSimpleDate(newUserMessage);
    if (date) {
      console.log('[Claude] Checking availability for:', date);
      lookups.push(getAvailabilityContext(newUserMessage, date)
        .then(function(r) { if (r) availabilityContext = r; }));
    }
  }

  if (detectsPricingQuery(newUserMessage)) {
    var lower     = newUserMessage.toLowerCase();
    var gearAsked = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    if (gearAsked) {
      console.log('[Claude] Fetching pricing for:', gearAsked);
      lookups.push(getProductPricing(gearAsked)
        .then(function(r) { if (r) pricingContext = r; }));
    }
  }

  if (detectsFootageQuery(newUserMessage)) {
    console.log('[Claude] Searching footage...');
    lookups.push(
      Promise.race([
        searchSampleFootage(newUserMessage).then(function(r) { if (r) footageContext = r; }),
        new Promise(function(resolve) { setTimeout(resolve, 8000); }),
      ])
    );
  }

  if (lookups.length > 0) await Promise.all(lookups);
  if (availabilityContext) console.log('[Claude] Availability context added');
  if (pricingContext)      console.log('[Claude] Pricing context added');
  if (footageContext)      console.log('[Claude] Footage context added');

  var extraContext = availabilityContext + (availabilityContext ? '\n' : '')
    + pricingContext + (pricingContext ? '\n' : '')
    + footageContext;

  var userContent;
  if (imageUrl) {
    var imageData = await fetchImageAsBase64(imageUrl);
    if (imageData) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: imageData.contentType, data: imageData.base64 } },
        { type: 'text', text: (newUserMessage || 'Customer sent this image. Respond in context of cinema equipment rental.') + (extraContext ? '\n' + extraContext : '') },
      ];
    } else {
      userContent = newUserMessage + ' [Image could not be loaded]' + (extraContext ? '\n' + extraContext : '');
    }
  } else {
    userContent = newUserMessage + (extraContext ? '\n' + extraContext : '');
  }

  var messages = conversationHistory.concat([{ role: 'user', content: userContent }]);

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
    return { reply: reply, handoffTriggered: detectsHandoffTrigger(reply) };
  } catch (err) {
    console.error('[Claude] askKino error:', err.message);
    return { reply: "Sorry, I'm having a moment — please try again shortly, or message us directly.", handoffTriggered: false };
  }
}

module.exports = { askKino };
