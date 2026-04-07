// handlers/claudeHandler.js
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const catalog      = require('../utils/booqableCatalog');
// quoteBuilder removed — getCatalogContext uses cached catalog (faster, no timeout)

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

var SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../prompts/kino_system.txt'),
  'utf8'
);

// ─────────────────────────────────────────────
// HANDOFF DETECTION
// ─────────────────────────────────────────────

function detectsHandoffTrigger(text) {
  // Handoff disabled — Kino always stays active regardless of content
  // Jeff is notified separately for documents, but Kino never locks the session
  return false;
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
  // ARRI
  'arri alexa 35', 'alexa 35',
  'arri alexa mini lf', 'alexa mini lf',
  'arri alexa mini', 'alexa mini',
  // Sony Cinema
  'sony venice 2 8k', 'venice 2',
  'sony venice 6k', 'venice 6k', 'venice 6', 'venice 1',
  'venice rialto', 'rialto',
  'sony burano', 'burano',
  // Sony FX / Alpha
  'sony fx3', 'fx3',
  'sony fx6', 'fx6',
  'sony fx9', 'fx9',
  'sony a7s3', 'a7s3', 'a7siii', 'a7s iii',
  'sony a7s', 'a7s',
  // RED
  'red v-raptor', 'v-raptor', 'raptor',
  'red komodo', 'komodo',
  // Lenses
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
  'sony fe 24-70', '24-70mm', 'sony 24-70',
  'sony fe 70-200', '70-200mm', 'sony 70-200',
  'sony fe 16-35', '16-35mm',
  // Wireless
  'hollyland', 'teradek', 'vaxis storm',
  // Support
  'sachtler', 'tilta', 'nucleus-m',
  'dana dolly', 'movmax', 'slider',
  'tripod', 'hi hat', 'low boy',
  // Monitors
  'smallhd', 'atomos',
  // Power
  'swit', 'fxlion', 'vmount', 'v-mount',
  // Lighting
  'aputure', 'aperture', 'apurture',
  'nanlite', 'nanlux', 'godox',
  'arri skypanel', 'skypanel',
  'litepanels', 'kino flo', 'kinoflo',
  'c stand', 'c-stand', 'light stand',
  'softbox', 'fresnel', 'bounce',
  // Audio
  'sennheiser', 'sennheiser ew100', 'sennheiser ew112',
  'rode', 'dpa', 'lectrosonics',
  'sound devices', 'mixpre',
  // Lighting accessories
  '300d', 'aputure 300d',
  '300x', 'aputure 300x',
  '50d', 'aputure 50d',
  'flag', 'cutter', 'floppy',
  '2x3 cutter', '4x4 floppy',
  'diffuser', 'diffusion',
  '2x3 diffusion', '4x4 diffusion',
  '2x3 frame', '4x4 frame',
  'lightdome', 'light dome', 'lightdome ii', 'lightdome mini',
  'nanlite dome',
  'lantern', 'lantern 60', 'lantern 90',
  'rock roller', 'rock n roller', 'camera cart',
];

var GEAR_SEARCH_MAP = {
  // ARRI
  'alexa 35':            'Arri Alexa 35',
  'arri alexa 35':       'Arri Alexa 35',
  'alexa mini lf':       'Arri Alexa Mini LF',
  'arri alexa mini lf':  'Arri Alexa Mini LF',
  'alexa mini':          'ARRI ALEXA Mini',
  // Sony Cinema
  'venice 2':            'Sony Venice 2 8K',
  'sony venice 2 8k':    'Sony Venice 2 8K',
  'venice 6k':           'Sony Venice 6K',
  'venice 6':            'Sony Venice 6K',
  'venice 1':            'Sony Venice 6K',
  'rialto':              'Sony Venice 2 8K Cinema Camera with Rialto',
  'venice rialto':       'Sony Venice 2 8K Cinema Camera with Rialto',
  'burano':              'Sony Burano',
  // Sony FX / Alpha
  'fx3':                 'Sony FX3',
  'fx6':                 'Sony FX6',
  'fx9':                 'Sony FX9',
  'a7s3':                'Sony A7S3',
  'a7siii':              'Sony A7S3',
  'a7s iii':             'Sony A7S3',
  'sony a7s3':           'Sony A7S3',
  'sony a7s':            'Sony A7S',
  // RED
  'raptor':              'RED V-Raptor',
  'v-raptor':            'RED V-Raptor',
  'komodo':              'RED Komodo',
  // Lenses
  '24-70mm':             'Sony FE 24-70mm',
  'sony 24-70':          'Sony FE 24-70mm',
  'sony fe 24-70':       'Sony FE 24-70mm',
  '70-200mm':            'Sony FE 70-200mm',
  'sony 70-200':         'Sony FE 70-200mm',
  'sony fe 70-200':      'Sony FE 70-200mm',
  '16-35mm':             'Sony FE 16-35mm',
  // Tripods — map generic 'tripod' to search, let catalog find options
  'tripod':              'Tripod',
  'hi hat':              'Hi Hat',
  'low boy':             'Low Boy',
  'sachtler':            'Sachtler Video 25 Plus Tripod Set',
  'oconnor':             'OConnor Ultimate 2560 Tripod Set',
  'teris':               'Teris V12T',
  'manfrotto':           'Manfrotto',
  // Lighting — exact Booqable names
  'aputure':             'Aputure',
  'aperture':            'Aputure',
  'apurture':            'Aputure',
  'aputure 600':         'Aputure 600C',
  'aputure 600c':        'Aputure 600C',
  '600c':                'Aputure 600C',
  'storm 80c':           'Aputure Amaran',
  'p60c':                'Aputure Amaran P60c',
  'pt4c':                'Aputure Amaran PT4c',
  'pt2c':                'Aputure Amaran PT2c',
  // Aputure LS family — exact Booqable names confirmed via curl
  '1200d':              'Aputure LS 1200D Pro',
  'aputure 1200d':      'Aputure LS 1200D Pro',
  '1200x':              'Aputure STORM 1200x',
  'aputure 1200x':      'Aputure STORM 1200x',
  'nanlite':             'Nanlite',
  'nanlux':              'Nanlux',
  'godox':               'Godox',
  'c stand':             'C Stand',
  'c-stand':             'C Stand',
  // Audio
  'sennheiser':          'Sennheiser',
  'sennheiser ew100':    'Sennheiser EW100',
  'zoom f8':             'Zoom F8n',
  'zoom f8n':            'Zoom F8n',
  // Aputure lights — exact Booqable names confirmed
  '300d':              'Aputure LS 300D Mark II',
  'aputure 300d':      'Aputure LS 300D Mark II',
  '300x':              'Aputure LS 300X Bi-Color',
  'aputure 300x':      'Aputure LS 300X Bi-Color',
  '50d':               'Aputure STORM 80c',        // 50D not in inventory — redirects to alternative
  'aputure 50d':       'Aputure STORM 80c',
  // Flags — exact Booqable names, ambiguous logic returns both
  'flag':              '2x3 Cutter Flag',
  'cutter':            '2x3 Cutter Flag',
  '2x3 cutter':        '2x3 Cutter Flag',
  'floppy':            '4x4 Floppy Flag',
  '4x4 floppy':        '4x4 Floppy Flag',
  // Diffusion frames — exact Booqable names, ambiguous logic returns both
  'diffuser':          'Diffusion Frame',
  'diffusion':         'Diffusion Frame',
  '2x3 diffusion':     '2x3 Diffusion Frame',
  '4x4 diffusion':     '4x4 Diffusion Frame',
  '2x3 frame':         '2x3 Diffusion Frame',
  '4x4 frame':         '4x4 Diffusion Frame',
  // Lightdomes — exact Booqable names, ambiguous logic returns all variants
  'lightdome':         'Aputure Lightdome',
  'light dome':        'Aputure Lightdome',
  'lightdome ii':      'Aputure Lightdome II',
  'lightdome mini':    'Aputure Lightdome Mini',
  'nanlite dome':      'Nanlite Dome 120cm',
  // Lanterns — exact Booqable names, ambiguous logic returns both
  'lantern':           'Aputure Lantern',
  'lantern 60':        'Aputure Lantern 60cm',
  'lantern 90':        'Aputure Lantern 90cm',
  // Cart — exact Booqable name
  'rock roller':       'Rock N Roller Cart',
  'rock n roller':     'Rock N Roller Cart',
  'camera cart':       'Rock N Roller Cart',
};

// ─────────────────────────────────────────────
// PINNED PRODUCTS — exact Booqable data, no fuzzy search
// Add product IDs from Booqable curl results
// Format: 'search term': { name, stockCount, price, id }
// ─────────────────────────────────────────────

var PINNED_PRODUCTS = {
  // Cameras
  'sony alpha a7s iii': { name: 'Sony Alpha a7S III', stockCount: 3, price: 'RM500/day', id: null },
  'sony a7s3':          { name: 'Sony Alpha a7S III', stockCount: 3, price: 'RM500/day', id: null },
  'a7s3':               { name: 'Sony Alpha a7S III', stockCount: 3, price: 'RM500/day', id: null },
  'a7s iii':            { name: 'Sony Alpha a7S III', stockCount: 3, price: 'RM500/day', id: null },
  // Lenses
  '70-200':             { name: 'Sony FE 70-200 F2.8 G Master (Mark ii)', stockCount: 3, price: 'RM200/day', id: null },
  '24-70':              { name: 'Sony FE 24-70mm f/2.8 GM', stockCount: 2, price: 'RM150/day', id: null },
  // Lighting
  'storm 80c':          { name: 'Aputure STORM 80c BLAIR-CG LED Monolight', stockCount: 3, price: 'RM200/day', id: null },
  '80c':                { name: 'Aputure STORM 80c BLAIR-CG LED Monolight', stockCount: 3, price: 'RM200/day', id: null },
  'aputure 600c':       { name: 'Aputure LS 600C Pro', stockCount: 1, price: 'RM450/day', id: null },
  '600c':               { name: 'Aputure LS 600C Pro', stockCount: 1, price: 'RM450/day', id: null },
  'p60c':               { name: 'Aputure Amaran P60c RGBWW LED Panel', stockCount: 2, price: 'RM100/day', id: null },
  'pt4c':               { name: 'Aputure Amaran PT4c RGBWW (4ft)', stockCount: 2, price: 'RM100/day', id: null },
  'pt2c':               { name: 'Aputure Amaran PT2c RGBWW (2ft)', stockCount: 2, price: 'RM80/day', id: null },
  // C-Stands
  'c stand':            { name: 'Kupo Master C-Stand 40" Riser Sliding Leg', stockCount: 49, price: 'RM50/day', id: null },
  'c-stand':            { name: 'Kupo Master C-Stand 40" Riser Sliding Leg', stockCount: 49, price: 'RM50/day', id: null },
  // Tripods
  'teris v12':          { name: 'Teris V12T Plus-Q Tripod (100mm)', stockCount: null, price: null, id: null },
  'teris v15':          { name: 'Teris V15T-PLUS-Q Tripod (100mm)', stockCount: null, price: null, id: null },
  'sachtler':           { name: 'Sachtler Video 25 Plus Tripod Set', stockCount: null, price: null, id: null },
  'oconnor 2560':       { name: 'OConnor Ultimate 2560 Tripod Set', stockCount: null, price: null, id: null },
  // Audio
  'sennheiser':         { name: 'Sennheiser EW 112P G4 Portable Wireless Lavalier', stockCount: 2, price: 'RM150/day', id: null },
  'ew100':              { name: 'Sennheiser EW 112P G4 Portable Wireless Lavalier', stockCount: 2, price: 'RM150/day', id: null },
};

// Look up pinned product by customer term
function findPinnedProduct(term) {
  var lower = term.toLowerCase().trim();
  // Direct match
  if (PINNED_PRODUCTS[lower]) return PINNED_PRODUCTS[lower];
  // Partial match
  var keys = Object.keys(PINNED_PRODUCTS);
  for (var i = 0; i < keys.length; i++) {
    if (lower.includes(keys[i]) || keys[i].includes(lower)) {
      return PINNED_PRODUCTS[keys[i]];
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// PRODUCT ALTERNATIVES MAP
// When Booqable returns nothing for a customer's request,
// inject this as a known alternative so Claude never hallucinates
// ─────────────────────────────────────────────

var PRODUCT_ALTERNATIVES = {
  '300d':         'The Aputure 300D Mark II is not currently in our catalog. We have the Aputure Nova P300c (RGBWW soft panel, similar output) and the Aputure 300X (bi-color) as alternatives.',
  'aputure 300d': 'The Aputure 300D Mark II is not currently in our catalog. We have the Aputure Nova P300c (RGBWW soft panel, similar output) and the Aputure 300X (bi-color) as alternatives.',
  '50d':          'We do not carry the Aputure 50D — the Aputure STORM 80c is our direct alternative, same compact form factor with RGBWW colour.',
  'aputure 50d':  'We do not carry the Aputure 50D — the Aputure STORM 80c is our direct alternative, same compact form factor with RGBWW colour.',
  'flag':         'For flags, we have the 2x3 Cutter Flag and the 4x4 Floppy Flag. Which size do you need — or would you like a set of both?',
  'cutter':       'For flags, we have the 2x3 Cutter Flag and the 4x4 Floppy Flag. Which size do you need — or would you like a set of both?',
  'floppy':       'For flags, we have the 2x3 Cutter Flag and the 4x4 Floppy Flag. Which size do you need?',
  'diffuser':     'For diffusion, we have 2x3 and 4x4 Diffusion Frames with LEE gels — available in 250 (light), 251 (medium), or 216 (heavy/white). Which size and strength do you need?',
  'diffusion':    'For diffusion, we have 2x3 and 4x4 Diffusion Frames with LEE gels — available in 250 (light), 251 (medium), or 216 (heavy/white). Which size and strength do you need?',
  'lightdome':    'For lightdomes, we have the Aputure Lightdome II (standard), Aputure Lightdome Mini (compact, suits STORM 80c), and Nanlite Dome 120cm. Which light head is it for?',
  'light dome':   'For lightdomes, we have the Aputure Lightdome II (standard), Aputure Lightdome Mini (compact, suits STORM 80c), and Nanlite Dome 120cm. Which light head is it for?',
  'lantern':      'For lanterns, we have the Aputure Lantern 60cm and Aputure Lantern 90cm — both give 360° soft light. Which size do you prefer?',
  'rock roller':  'We have the Rock N Roller Multi-Cart available.',
  'rock n roller':'We have the Rock N Roller Multi-Cart available.',
  'camera cart':  'We have the Rock N Roller Multi-Cart available.',
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

  // Use live catalog search — finds ANY product in inventory, not just hardcoded keywords
  await catalog.ensureCatalogFresh();
  var lower    = text.toLowerCase();

  // First try catalog search with the full message
  var words    = lower.split(/\s+/).filter(function(w) { return w.length > 3; });
  var products = [];

  // Try multi-word search first
  for (var i = 0; i < words.length; i++) {
    var found = catalog.searchCatalog(words[i]);
    if (found.length > 0) { products = found; break; }
  }

  // Fall back to gear keyword map
  if (products.length === 0) {
    var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    if (gearMention) {
      var searchTerm = GEAR_SEARCH_MAP[gearMention] || gearMention;
      products = catalog.searchCatalog(searchTerm);
    }
  }

  if (products.length === 0) return '';
  console.log('[Claude] Availability check — found products:', products.map(function(p) { return p.name; }).join(', '));
  var lines = [];
  for (var i = 0; i < products.length; i++) {
    var product   = products[i];
    var productId = product.products && product.products[0] && product.products[0].id;
    if (!productId) {
      try {
        var pgRes = await booqable.get('/product_groups/' + product.id);
        var pg    = pgRes.data && pgRes.data.product_group;
        productId = pg && pg.products && pg.products[0] && pg.products[0].id;
      } catch(e) { /* skip */ }
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
  // Use catalog for instant lookup — no API call needed
  await catalog.ensureCatalogFresh();
  var searchTerm = GEAR_SEARCH_MAP[productName] || productName;
  var products   = catalog.searchCatalog(searchTerm);
  if (products.length === 0) {
    // Try the raw product name too
    products = catalog.searchCatalog(productName);
  }
  if (products.length === 0) return null;
  var lines = products.slice(0, 5).map(function(p) {
    return p.name + ': ' + (p.priceFormatted || 'price on request');
  });
  return '[BOOQABLE INDIVIDUAL PRICING: ' + lines.join(' | ')
    + '. Apply multi-day discount, 10% volume discount if total reaches RM5000, and 6% SST.]';
}

async function getProductPricing(productName) {
  var timer;
  return Promise.race([
    _fetchPricing(productName).catch(function(e) {
      console.error('[Claude] pricing error:', e.message); return null;
    }).finally(function() { clearTimeout(timer); }),
    new Promise(function(resolve) {
      timer = setTimeout(function() { console.warn('[Claude] Pricing timed out'); resolve(null); }, 10000);
    }),
  ]);
}

// ─────────────────────────────────────────────
// CATALOG INVENTORY LOOKUP
// Fires when customer mentions any product — confirms it exists in inventory
// ─────────────────────────────────────────────

function detectsInventoryQuery(text) {
  var keywords = [
    'do you have', 'you have', 'ada', 'got', 'u have',
    'available', 'in stock', 'can i get', 'boleh dapat',
    'do you carry', 'does 2117 have', 'i need', 'looking for',
    'i want', 'im looking', 'im looking', 'cari', 'nak',
  ];
  var lower = text.toLowerCase();
  return keywords.some(function(k) { return lower.includes(k); });
}

async function getCatalogContext(text) {
  try {
    await catalog.ensureCatalogFresh();

    // Parse each line of the message separately — handles equipment lists
    // Also split on '+' within lines (e.g. "Sony A7S3 + 24-70mm" = 2 products)
    var rawLines = text.split(/\n/);
    var msgLines = [];
    rawLines.forEach(function(line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      // If line contains '+', split into sub-items
      if (trimmed.includes('+')) {
        var parts = trimmed.split('+').map(function(p) { return p.trim(); }).filter(Boolean);
        parts.forEach(function(p) { msgLines.push(p); });
      } else {
        msgLines.push(trimmed);
      }
    });
    var found     = {};  // keyed by product id to avoid duplicates
    var notFound  = [];  // items customer mentioned that we couldn't find

    // Helper: extract quantity from a line e.g. "x3", "3x", "x 3 set"
function parseQty(line) {
  // Handles: x3, 3x, "- 2 units", "2 unit", "x 2"
  // Match qty patterns: x2, 2x, "- 2 units", "2 units" — max 3 digits to avoid matching model numbers like 1200X
  var m = line.match(/\bx\s*(\d{1,3})\b|\b(\d{1,3})\s*x\b|-\s*(\d{1,3})\s*unit|(\d{1,3})\s*unit/i);
  return m ? parseInt(m[1] || m[2] || m[3] || m[4]) : 1;
}

function cleanLine(line) {
  return line
    .replace(/^[·•\-\*]\s*/g, '')            // strip bullet chars at start
    .replace(/\bx\s*\d{1,3}\b|\b\d{1,3}\s*x\b/gi, '') // remove x2, 3x — NOT model suffixes like 1200X
    .replace(/-\s*\d+\s*units?/gi, '')        // remove "- 2 units"
    .replace(/\d+\s*units?/gi, '')            // remove "2 units"
    .replace(/[+\/,;:-]/g, ' ')              // remove punctuation
    .replace(/\s+/g, ' ')                    // collapse spaces
    .trim();
}
    // Search each line individually
    for (var i = 0; i < msgLines.length; i++) {
      var line    = msgLines[i];
      var cleaned = cleanLine(line);
      var qty     = parseQty(line);

      // Also count repeated identical lines (e.g. 3 lines of "Sony A7S3" = 3 units)
      if (qty === 1) {
        var dupCount = msgLines.filter(function(l) {
          return cleanLine(l).toLowerCase() === cleaned.toLowerCase();
        }).length;
        if (dupCount > 1) qty = dupCount;
      }

      // Try GEAR_SEARCH_MAP first, then direct catalog search
      var lower      = cleaned.toLowerCase();
      var mappedTerm = null;
      Object.keys(GEAR_SEARCH_MAP).forEach(function(key) {
        if (lower.includes(key)) mappedTerm = GEAR_SEARCH_MAP[key];
      });

      // Smart catalog search — ranked by price, stock, name match
      var results = mappedTerm
        ? catalog.searchCatalog(mappedTerm)
        : catalog.searchCatalog(cleaned);

      var accessoryKeywords = ['cable', 'cage', 'plate', 'adapter', 'cap', 'strap',
        'battery', 'charger', 'case', 'bag', 'hood', 'mount', 'holder', 'bracket',
        'smallrig', 'wooden camera', 'tilta cage', 'housing'];
      var mainGear = results.filter(function(p) {
        var n = p.name.toLowerCase();
        return !accessoryKeywords.some(function(a) { return n.includes(a); });
      });
      if (mainGear.length > 0) results = mainGear;

      // Fallback: try individual words
      if (results.length === 0) {
        var words = cleaned.split(/\s+/).filter(function(w) { return w.length > 3; });
        for (var wi = 0; wi < words.length; wi++) {
          results = catalog.searchCatalog(words[wi]);
          if (results.length > 0) break;
        }
      }

      console.log('[Catalog] Results for "' + (mappedTerm || cleaned) + '":', results.length > 0 ? results.slice(0,2).map(function(r){return r.name+'('+r.price+')'}).join(', ') : 'NONE');

   // Ambiguous terms — show top 3 so Claude presents options to customer
      var AMBIGUOUS_TERMS = ['flag', 'cutter', 'floppy', 'diffuser', 'diffusion',
        'frame', 'lightdome', 'light dome', 'lantern'];
      var isAmbiguous = AMBIGUOUS_TERMS.some(function(a) {
        return lower.includes(a) || (mappedTerm && mappedTerm.toLowerCase().includes(a));
      });
      var topResults = isAmbiguous ? results.slice(0, 3) : results.slice(0, 1);

if (topResults.length > 0) {
        topResults.forEach(function(p) {
          if (!found[p.id]) {
            found[p.id] = { product: p, qty: qty };
          } else {
            found[p.id].qty = Math.max(found[p.id].qty, qty);
          }
        });
      } else {
        var looksLikeGear = cleaned.length > 3
          && !/^(hi|hello|hey|may i|please|can you|could|would)/i.test(cleaned)
          && !/^(what|how|when|where|is|are|do|does)/i.test(cleaned);
        if (looksLikeGear && cleaned.length < 60) {
          notFound.push(cleaned);
        }
      }
    }

    // Also do a whole-message scan for gear keywords not caught line-by-line
    var lowerFull = text.toLowerCase();
    GEAR_KEYWORDS.forEach(function(key) {
      if (lowerFull.includes(key)) {
        var term     = GEAR_SEARCH_MAP[key] || key;
        var results  = catalog.searchCatalog(term);
        if (results.length > 0) {
          var p = results[0];
          if (!found[p.id]) found[p.id] = { product: p, qty: 1 };
        }
      }
    });

    var foundList = Object.values(found);
    if (foundList.length === 0 && notFound.length === 0) return null;

    // Build context lines with stock validation
    var lines = foundList.map(function(item) {
      var p        = item.product;
      var qty      = item.qty;
      var stock    = p.stockCount || 0;
      var price    = p.priceFormatted || 'pricing on request';
      var url      = catalog.getProductUrl(p);
      var stockMsg = '';

      // Only flag when customer requests more than we have — never show stock count otherwise
      if (stock > 0 && qty > stock) {
        stockMsg = ' [STOCK WARNING: customer needs ' + qty + ', we have ' + stock
          + ' — inform customer of available quantity and offer to check sourcing for the rest]';
      }

      return p.name + ' — ' + price + stockMsg + ' | ' + url;
    });

    // Add not-found items — with alternatives injected where known
    if (notFound.length > 0) {
      notFound.forEach(function(item) {
        var lower = item.toLowerCase();
        // Check if we have a known alternative for this item
        var altKey = Object.keys(PRODUCT_ALTERNATIVES).find(function(k) {
          return lower.includes(k) || k.includes(lower);
        });
        if (altKey) {
          lines.push('[USE THIS RESPONSE FOR "' + item + '": ' + PRODUCT_ALTERNATIVES[altKey] + ']');
        } else {
          lines.push('[NOT IN CATALOG: "' + item + '" — offer the closest alternative from our inventory or flag to team for sourcing. Do not say this item does not exist without first checking our full range.]');
        }
      });
    }

    console.log('[Claude] Catalog context — found: ' + foundList.length
      + ' products, not found: ' + notFound.length + ' items');

    return '[BOOQABLE FULL CATALOG CHECK:\n' + lines.join('\n')
      + '\nUse ONLY these prices. Never quote from memory. '
      + 'Flag stock shortfalls clearly. '
      + 'For NOT IN CATALOG items, offer the closest alternative or suggest outsource.]';

  } catch(err) {
    console.error('[Claude] getCatalogContext error:', err.message);
    return null;
  }
}


// ─────────────────────────────────────────────
// WEB SEARCH — SAMPLE FOOTAGE
// ─────────────────────────────────────────────

function detectsFootageQuery(text) {
  var keywords = ['sample', 'footage', 'example', 'demo', 'reel', 'showreel',
    'how does it look', 'boleh tengok', 'nak tengok', 'show me', 'can i see',
    'youtube', 'vimeo', 'reference', 'test footage',
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
        content: 'Search for sample footage and showreels for: ' + searchQuery
          + '. Return 3 links from Vimeo, YouTube, or manufacturer sites with one-line descriptions. Links only, no preamble.',
      }],
    });
    console.log('[Claude] Footage search response type:', response.stop_reason);

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
// FETCH PRODUCT PAGE FROM 2117.RENTALS
// Gets the product URL + any video links from the website
// ─────────────────────────────────────────────

async function fetchProductPage(customerMessage) {
  try {
    var lower       = customerMessage.toLowerCase();
    var gearMention = GEAR_KEYWORDS.find(function(k) { return lower.includes(k); });
    if (!gearMention) return null;

    var searchTerm = GEAR_SEARCH_MAP[gearMention] || gearMention;

    // Use catalog for instant lookup
    await catalog.ensureCatalogFresh();
    var products = catalog.searchCatalog(searchTerm);
    if (products.length === 0) products = catalog.searchCatalog(gearMention);
    if (products.length === 0) return null;

    var results = [];
    for (var i = 0; i < Math.min(products.length, 2); i++) {
      var product = products[i];
      var slug    = product.slug || product.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      var pageUrl = 'https://www.2117.rentals/products/' + slug;

      console.log('[Claude] Fetching product page:', pageUrl);

      try {
        var pageRes  = await axios.get(pageUrl, { timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' } });
        var html     = pageRes.data || '';

        // Extract YouTube links
        var youtubeMatches = html.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g) || [];
        var youtubeLinks   = youtubeMatches.map(function(m) {
          var id = m.match(/([a-zA-Z0-9_-]{11})$/);
          return id ? 'https://youtube.com/watch?v=' + id[1] : null;
        }).filter(Boolean);

        // Extract Vimeo links
        var vimeoMatches = html.match(/vimeo\.com\/(?:video\/)?(\d+)/g) || [];
        var vimeoLinks   = vimeoMatches.map(function(m) {
          return 'https://' + m;
        });

        // Deduplicate
        var allVideos = youtubeLinks.concat(vimeoLinks).filter(function(v, i, arr) {
          return arr.indexOf(v) === i;
        });

        results.push({
          name:    product.name,
          pageUrl: pageUrl,
          videos:  allVideos.slice(0, 3),
        });

      } catch(pageErr) {
        console.warn('[Claude] Could not fetch product page:', pageUrl, pageErr.message);
        // Still include the product URL even if fetch failed
        results.push({ name: product.name, pageUrl: pageUrl, videos: [] });
      }
    }

    if (results.length === 0) return null;

    // Build context string
    var lines = results.map(function(r) {
      var line = r.name + ': ' + r.pageUrl;
      if (r.videos.length > 0) {
        line += ' | Videos: ' + r.videos.join(', ');
      }
      return line;
    });

    return '[PRODUCT PAGES FROM 2117.RENTALS: ' + lines.join(' || ')
      + '. Share the product page URL with the customer so they can view specs, photos and video. Share video links if available.]';

  } catch (err) {
    console.error('[Claude] fetchProductPage error:', err.message);
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

  // Catalog context — always runs, uses cached catalog (no API calls, no timeout)
  var catalogContext = '';
  lookups.push(
    Promise.race([
      getCatalogContext(newUserMessage).then(function(r) {
        if (r) { catalogContext = r; console.log('[Claude] Catalog context added'); }
      }).catch(function(e) {
        console.error('[Claude] getCatalogContext error:', e.message);
      }),
      new Promise(function(resolve) {
        setTimeout(function() { console.warn('[Claude] Catalog context timed out'); resolve(); }, 8000);
      }),
    ])
  );

  if (detectsFootageQuery(newUserMessage)) {
    console.log('[Claude] Fetching product page + footage...');
    lookups.push(
      Promise.race([
        fetchProductPage(newUserMessage).then(function(r) {
          if (r) {
            footageContext = r;
            console.log('[Claude] Product page context added');
          } else {
            // Fall back to web search if no product page found
            return searchSampleFootage(newUserMessage).then(function(r2) {
              if (r2) { footageContext = r2; console.log('[Claude] Footage search context added'); }
            });
          }
        }),
        new Promise(function(resolve) {
          setTimeout(function() { console.warn('[Claude] Product page fetch timed out'); resolve(); }, 15000);
        }),
      ])
    );
  }

  if (lookups.length > 0) await Promise.all(lookups);
  if (availabilityContext) console.log('[Claude] Availability context added');
  if (pricingContext)      console.log('[Claude] Pricing context added');
  if (catalogContext)      console.log('[Claude] Catalog context added');
  if (footageContext)      console.log('[Claude] Footage context added');

  var extraContext = availabilityContext + (availabilityContext ? '\n' : '')
    + pricingContext + (pricingContext ? '\n' : '')
    + catalogContext + (catalogContext ? '\n' : '')
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
