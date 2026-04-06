// handlers/claudeHandler.js
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const catalog   = require('../utils/booqableCatalog');

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
    var lower = text.toLowerCase();

    // Extract meaningful words (3+ chars, not common words)
    var stopWords = ['have', 'that', 'this', 'with', 'from', 'your', 'sure',
      'just', 'need', 'want', 'looking', 'does', 'what', 'which', 'can',
      'you', 'the', 'and', 'for', 'are', 'not', 'but', 'its', 'ada',
      'nak', 'aku', 'saya', 'kita', 'yang'];
    var words = lower.split(/\s+/).filter(function(w) {
      return w.length >= 3 && !stopWords.includes(w);
    });

    // Search catalog for each word
    var found = [];
    var seen  = {};
    words.forEach(function(word) {
      var results = catalog.searchCatalog(word);
      results.forEach(function(p) {
        if (!seen[p.id]) {
          seen[p.id] = true;
          found.push(p);
        }
      });
    });

    if (found.length === 0) return null;

    // Filter to only products with price > 0 (rentable items, not accessories/cables)
    var rentable = found.filter(function(p) { return p.price > 0; });
    var toShow   = rentable.length > 0 ? rentable : found;
    toShow       = toShow.slice(0, 5);

    // Parse requested quantities from message
    function parseRequestedQty(productName, messageText) {
      var nameLower = productName.toLowerCase();
      var msgLower  = messageText.toLowerCase();
      // Look for "product x3" or "3x product" patterns near the product name
      var patterns  = [
        new RegExp(nameLower.split(' ')[0] + '[^\\n]*x\\s*(\\d+)', 'i'),
        new RegExp('(\\d+)\\s*x[^\\n]*' + nameLower.split(' ')[0], 'i'),
        new RegExp(nameLower.split(' ')[0] + '[^\\n]*(\\d+)\\s*unit', 'i'),
      ];
      for (var pi = 0; pi < patterns.length; pi++) {
        var m = msgLower.match(patterns[pi]);
        if (m) return parseInt(m[1]);
      }
      // Count repeated lines with same product
      var lines   = msgLower.split('\n');
      var keyword = nameLower.split(' ')[0];
      var count   = lines.filter(function(l) { return l.includes(keyword); }).length;
      return count > 1 ? count : 1;
    }

    var lines = toShow.map(function(p) {
      var url      = catalog.getProductUrl(p);
      var price    = p.priceFormatted ? ' — ' + p.priceFormatted : '';
      var stock    = p.stockCount || 0;
      var reqQty   = parseRequestedQty(p.name, text);
      var stockMsg = '';
      if (stock > 0 && reqQty > stock) {
        stockMsg = ' [STOCK WARNING: customer requested ' + reqQty
          + ' units but only ' + stock + ' available — flag this to customer]';
      } else if (stock > 0) {
        stockMsg = ' [stock: ' + stock + ' unit(s)]';
      }
      return p.name + price + stockMsg + ' | ' + url;
    });

    console.log('[Claude] Catalog match found:', toShow.map(function(p) { return p.name; }).join(', '));

    return '[BOOQABLE CATALOG MATCH: These products exist in 2117 inventory: '
      + lines.join(' || ')
      + '. Always state stock counts accurately. If requested quantity exceeds stock, '
      + 'tell the customer clearly how many units are available. '
      + 'Never quote gear that is not found in this catalog match. '
      + 'Do not say it is not in our lineup if it appears here.]';

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

  // Inventory lookup — search catalog for any product mentioned
  var inventoryContext = '';
  if (detectsInventoryQuery(newUserMessage)) {
    lookups.push(
      getCatalogContext(newUserMessage).then(function(r) {
        if (r) { inventoryContext = r; console.log('[Claude] Inventory context added'); }
      }).catch(function() {})
    );
  }

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
  if (footageContext)      console.log('[Claude] Footage context added');

  var extraContext = availabilityContext + (availabilityContext ? '\n' : '')
    + pricingContext + (pricingContext ? '\n' : '')
    + inventoryContext + (inventoryContext ? '\n' : '')
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
