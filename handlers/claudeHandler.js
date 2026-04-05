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
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    timeout: 12000, // 6 second timeout — never block Kino's reply
    headers: {
      
      'Content-Type':  'application/json',
    },
  });
}

// ─────────────────────────────────────────────
// GEAR KEYWORDS
// ─────────────────────────────────────────────

// Exact Booqable product name fragments — matched against customer messages
// Ordered from most specific to least specific to avoid false matches
var GEAR_KEYWORDS = [
  // Cameras — exact Booqable names
  'arri alexa 35', 'alexa 35',
  'arri alexa mini lf', 'alexa mini lf',
  'arri alexa mini', 'alexa mini',
  'sony venice 2 8k', 'venice 2',
  'sony venice 6k', 'venice 6k', 'venice 1', 'venice 6',
  'venice rialto', 'rialto',
  'red v-raptor', 'v-raptor', 'raptor',
  'sony burano', 'burano',
  'sony fx3', 'fx3',
  'sony fx6', 'fx6',
  'red komodo', 'komodo',
  // Lenses
  'signature prime', 'arri signature',
  'atlas orion', 'atlas mercury',
  'zeiss super speed', 'super speed',
  'contax zeiss', 'cooke sp3',
  'sigma cine', 'sigma ff',
  'dzofilm arles', 'arles',
  'dzofilm vespid', 'vespid',
  'dzofilm pictor', 'pictor',
  'dzofilm catta', 'catta',
  'blazar remus', 'remus',
  'atlas anamorphic',
  'laowa', 'aivascope', 'dulens',
  'leica-r', 'olympus zuiko', 'canon nfd', 'zero optik',
  'lomo super speed',
  // Support & accessories
  'hollyland', 'teradek', 'vaxis storm',
  'sachtler', 'tilta', 'nucleus-m',
  'smallhd', 'atomos', 'swit',
  'fxlion', 'richard gale', 'clavius',
];

// Map customer terms to exact Booqable search queries
var GEAR_SEARCH_MAP = {
  'alexa 35':      'Arri Alexa 35',
  'arri alexa 35': 'Arri Alexa 35',
  'alexa mini lf': 'Arri Alexa Mini LF',
  'arri alexa mini lf': 'Arri Alexa Mini LF',
  'alexa mini':    'ARRI ALEXA Mini',
  'venice 2':      'Sony Venice 2 8K',
  'venice 6k':     'Sony Venice 6K',
  'venice 6':      'Sony Venice 6K',
  'venice 1':      'Sony Venice 6K',
  'rialto':        'Sony Venice 2 8K Cinema Camera with Rialto',
  'venice rialto': 'Sony Venice 2 8K Cinema Camera with Rialto',
  'raptor':        'RED V-Raptor',
  'v-raptor':      'RED V-Raptor',
  'burano':        'Sony Burano',
  'fx3':           'Sony FX3',
  'fx6':           'Sony FX6',
  'komodo':        'RED Komodo',
};

// ─────────────────────────────────────────────
// DATE EXTRACTION
// ─────────────────────────────────────────────

function extractSimpleDate(text) {
  var months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  var year   = new Date().getFullYear();

  var match = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
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
// BOOQABLE AVAILABILITY — with 5s timeout wrapper
// ─────────────────────────────────────────────

function detectsAvailabilityQuery(text) {
  var keywords = [
    'available', 'availability', 'ada tak', 'ada ke',
    'boleh dapat', 'still free', 'book', 'reserve', 'tempah',
    'is there', 'do you have', 'in stock', 'free on',
  ];
  return keywords.some(function(k) { return text.toLowerCase().includes(k); });
}

async function _fetchAvailability(text, fromDate) {
  var booqable = getBooqableClient();
  if (!booqable) return '';

  var lower      = text.toLowerCase();
  var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
  if (!gearMention) return '';

  // Use exact search term from map if available
  var searchTerm = GEAR_SEARCH_MAP[gearMention] || gearMention;
  console.log('[Claude] Booqable search term:', searchTerm);

  var searchRes = await booqable.get('/product_groups', {
    params: { q: searchTerm, per: 5 },
  });

  var products = (searchRes.data && (searchRes.data.product_groups || searchRes.data.products)) || [];
  if (products.length === 0) {
    console.log('[Claude] No Booqable products found for:', searchTerm);
    return '';
  }

  var availLines = [];
  for (var i = 0; i < products.length; i++) {
    var product = products[i];
    try {
      // Get products array from product group (contains individual product IDs)
      var productId = product.products && product.products[0] && product.products[0].id;
      if (!productId) {
        // Fetch full product group to get nested products
        var pgRes = await booqable.get('/product_groups/' + product.id);
        var pg    = pgRes.data && pgRes.data.product_group;
        productId = pg && pg.products && pg.products[0] && pg.products[0].id;
      }
      if (!productId) {
        availLines.push(product.name + ': availability unknown');
        continue;
      }
      // Use correct Booqable v1 availability endpoint
      var availRes = await booqable.get('/products/' + productId + '/availability', {
        params: { from: fromDate, till: fromDate, interval: 'day' },
      });
      // Response is keyed by date string — find the entry for our date
      var availData = availRes.data;
      var dateKey   = Object.keys(availData)[0]; // get first (and likely only) date entry
      var entry     = availData[dateKey];
      var avail     = entry ? entry.available : 0;
      var total     = entry ? entry.total     : 0;
      availLines.push(
        product.name + ': ' +
        (avail > 0
          ? 'AVAILABLE (' + avail + ' of ' + total + ' unit(s) free)'
          : 'NOT AVAILABLE — fully booked on this date')
      );
    } catch(e) {
      console.warn('[Claude] availability check error for', product.name, ':', e.message);
      availLines.push(product.name + ': availability unknown');
    }
  }

  if (availLines.length === 0) return '';

  return '\n[BOOQABLE LIVE AVAILABILITY for ' + fromDate + ': '
    + availLines.join(' | ')
    + '. Use this data to answer the customer accurately. Do not guess.]';
}

// 5 second timeout wrapper — Booqable slow response never blocks Kino reply
async function getAvailabilityContext(text, fromDate) {
  try {
    var result = await Promise.race([
      _fetchAvailability(text, fromDate),
      new Promise(function(resolve) {
        setTimeout(function() {
          console.warn('[Claude] Booqable availability timed out — continuing without it');
          resolve('');
        }, 10000);
      }),
    ]);
    return result || '';
  } catch(e) {
    console.error('[Claude] getAvailabilityContext error:', e.message);
    return '';
  }
}

// ─────────────────────────────────────────────
// BOOQABLE INDIVIDUAL PRICING — with 5s timeout
// ─────────────────────────────────────────────

function detectsPricingQuery(text) {
  var keywords = [
    'how much', 'berapa', 'price', 'harga', 'rate', 'kadar',
    'cost', 'quote', 'quotation', 'sewa berapa', 'berapa sewa',
  ];
  return keywords.some(function(k) { return text.toLowerCase().includes(k); });
}

async function _fetchPricing(productName) {
  var booqable = getBooqableClient();
  if (!booqable) return null;

  var searchTerm = GEAR_SEARCH_MAP[productName] || productName;
  var searchRes = await booqable.get('/product_groups', {
    params: { q: searchTerm, per: 5 },
  });

  var products = (searchRes.data && (searchRes.data.product_groups || searchRes.data.products)) || [];
  if (products.length === 0) return null;

  var lines = [];
  products.forEach(function(p) {
    var pricePerDay = p.base_price_in_cents
      ? 'RM' + (p.base_price_in_cents / 100).toFixed(2) + '/day'
      : 'price on request';
    lines.push(p.name + ': ' + pricePerDay);
  });

  return '\n[BOOQABLE INDIVIDUAL PRICING: ' + lines.join(' | ')
    + '. Use these exact prices when building a custom quote. '
    + 'Apply multi-day discount, 10% volume discount if total reaches RM5,000, and 6% SST.]';
}

async function getProductPricing(productName) {
  try {
    var result = await Promise.race([
      _fetchPricing(productName),
      new Promise(function(resolve) {
        setTimeout(function() {
          console.warn('[Claude] Booqable pricing timed out — continuing without it');
          resolve(null);
        }, 10000);
      }),
    ]);
    return result || null;
  } catch(e) {
    console.error('[Claude] getProductPricing error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// WEB SEARCH FOR SAMPLE FOOTAGE
// Uses Anthropic web search tool to find footage links
// ─────────────────────────────────────────────

function detectsFootageQuery(text) {
  var keywords = [
    'sample', 'footage', 'example', 'demo', 'reel', 'showreel',
    'how does it look', 'what does it look like', 'see the',
    'video of', 'photo of', 'image of', 'contoh', 'sample video',
    'boleh tengok', 'nak tengok', 'show me', 'can i see',
    'instagram', 'youtube', 'vimeo', 'reference', 'test footage',
    'color science', 'dynamic range', 'low light', 'skin tone',
  ];
  var lower = text.toLowerCase();
  return keywords.some(function(k) { return lower.includes(k); });
}

async function searchSampleFootage(customerMessage) {
  try {
    // Find which gear they are asking about
    var lower      = customerMessage.toLowerCase();
    var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    var searchTerm  = gearMention
      ? (GEAR_SEARCH_MAP[gearMention] || gearMention) + ' sample footage cinema'
      : '2117 rentals Malaysia cinema equipment sample footage';

    console.log('[Claude] Searching footage for:', searchTerm);

    var response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role:    'user',
        content: 'Find 3 sample footage or showreel links for: ' + searchTerm
          + '. Focus on Vimeo, YouTube, or manufacturer sites. '
          + 'Return only a short list of links with one-line descriptions. '
          + 'No commentary, just the links and descriptions.',
      }],
    });

    // Extract text from response
    var resultText = '';
    if (response.content) {
      response.content.forEach(function(block) {
        if (block.type === 'text' && block.text) {
          resultText += block.text;
        }
      });
    }

    if (!resultText || resultText.trim().length < 10) return null;

    return '
[WEB SEARCH FOOTAGE RESULTS for  + searchTerm + :
'
      + resultText.trim()
      + '
Share these links with the customer naturally, mentioning what each link shows.]';

  } catch (err) {
    console.error('[Claude] searchSampleFootage error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// MAIN KINO FUNCTION
// ─────────────────────────────────────────────

async function askKino(conversationHistory, newUserMessage, imageUrl) {

  // 1 — Inject current Malaysia date
  var dateString     = getMalaysiaDateString();
  var systemWithDate = SYSTEM_PROMPT
    + '\n\nCURRENT DATE: ' + dateString
    + ' (Malaysia time). Always use this when answering questions about dates, '
    + 'scheduling, availability, and day-of-week calculations.';

  // 2 — Run Booqable checks in parallel with a shared 5s timeout
  var availabilityContext = '';
  var pricingContext      = '';

  var booqablePromises = [];

  if (detectsAvailabilityQuery(newUserMessage)) {
    var date = extractSimpleDate(newUserMessage);
    if (date) {
      console.log('[Claude] Checking Booqable availability for date:', date);
      booqablePromises.push(
        getAvailabilityContext(newUserMessage, date).then(function(r) { availabilityContext = r || ''; })
      );
    }
  }

  if (detectsPricingQuery(newUserMessage)) {
    var lower     = newUserMessage.toLowerCase();
    var gearAsked = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    if (gearAsked) {
      console.log('[Claude] Fetching Booqable pricing for:', gearAsked);
      booqablePromises.push(
        getProductPricing(gearAsked).then(function(r) { pricingContext = r || ''; })
      );
    }
  }

  // Wait for all Booqable checks (each already has 5s timeout)
  if (booqablePromises.length > 0) {
    await Promise.all(booqablePromises);
    if (availabilityContext) console.log('[Claude] Availability context added');
    if (pricingContext)      console.log('[Claude] Pricing context added');
  }

  // 3 — Build user content
  var extraContext = availabilityContext + pricingContext + footageContext;
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
          text: (newUserMessage || 'The customer sent this image. Describe what you see and respond helpfully in the context of cinema equipment rental.') + extraContext,
        },
      ];
    } else {
      userContent = newUserMessage + ' [Customer sent an image but it could not be loaded]' + extraContext;
    }
  } else {
    userContent = newUserMessage + extraContext;
  }

  // 4 — Build messages
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
