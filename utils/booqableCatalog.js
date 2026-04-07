// utils/booqableCatalog.js
// Fetches and caches the full Booqable product catalog.
// Cache TTL: 15 minutes — balances freshness vs API calls.
// New products added to Booqable appear within 15 min automatically,
// or immediately via POST /admin/reload-catalog.

const axios = require('axios');

var catalog       = [];
var catalogLoaded = false;
var loadedAt      = null;
var CACHE_TTL_MS  = 15 * 60 * 1000; // 15 minutes (was 1 hour)

function getBooqableClient() {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return null;
  return axios.create({
    baseURL: process.env.BOOQABLE_BASE_URL,
    timeout: 15000,
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchFullCatalog() {
  var booqable = getBooqableClient();
  if (!booqable) {
    console.log('[Catalog] Booqable not configured — skipping');
    return [];
  }

  var allProducts = [];
  var page        = 1;
  var perPage     = 100;
  var totalPages  = 1;

  console.log('[Catalog] Fetching full catalog...');

  while (page <= totalPages) {
    try {
      var res      = await booqable.get('/product_groups', { params: { page: page, per: perPage } });
      var data     = res.data;
      var products = (data && (data.product_groups || data.products)) || [];
      var meta     = data && data.meta;
      var total    = (meta && meta.total_count) || 0;
      totalPages   = Math.ceil(total / perPage) || 1;

      products.forEach(function(p) {
        if (p.name && !p.archived) {
          allProducts.push({
            id:             p.id,
            name:           p.name,
            nameLower:      p.name.toLowerCase(),
            nameNorm:       normalise(p.name.toLowerCase()),
            slug:           p.slug || '',
            price:          p.base_price_in_cents || 0,
            priceFormatted: p.base_price_in_cents
              ? 'RM' + (p.base_price_in_cents / 100).toFixed(0) + '/day'
              : null,
            stockCount:  p.stock_count || 0,
            trackable:   p.trackable || false,
            products:    p.products || [],
          });
        }
      });

      console.log('[Catalog] Page ' + page + '/' + totalPages + ' (' + products.length + ' products)');
      page++;
    } catch(err) {
      console.error('[Catalog] Fetch error page ' + page + ':', err.message);
      break;
    }
  }

  console.log('[Catalog] Loaded ' + allProducts.length + ' products');
  return allProducts;
}

async function loadCatalog() {
  try {
    catalog       = await fetchFullCatalog();
    catalogLoaded = true;
    loadedAt      = Date.now();
  } catch(err) {
    console.error('[Catalog] Load failed:', err.message);
  }
}

async function ensureCatalogFresh() {
  if (!catalogLoaded || !loadedAt || (Date.now() - loadedAt > CACHE_TTL_MS)) {
    console.log('[Catalog] Cache stale — refreshing...');
    await loadCatalog();
  }
}

// Force immediate reload — called by /admin/reload-catalog
async function reloadCatalog() {
  console.log('[Catalog] Force reload requested');
  await loadCatalog();
  return catalog.length;
}

var ACCESSORY_KEYWORDS = [
  'cable', 'cage', 'plate', 'adapter', 'cap', 'strap', 'battery',
  'charger', 'case', 'bag', 'hood', 'mount', 'holder', 'bracket',
  'smallrig', 'wooden camera', 'housing', 'dovetail', 'rod', 'clamp',
  'power splitter', 'd-tap', 'lemo', 'fischer', 'xdca', 'codex',
  'cartoni', 'trigger', 'pin to', 'xlr', 'rosette', 'mitchell',
  'tripod head', 'tripod plate', 'hi-hat', 'hi hat', 'low-leg', 'low leg',
  'quick adapter', 'ronford', 'fluid head', 'head only',
];

function isAccessory(product) {
  var n = product.nameLower;
  return ACCESSORY_KEYWORDS.some(function(k) { return n.includes(k); });
}

function normalise(str) {
  return str.toLowerCase()
    .replace(/(\d+)mm/g, '$1')       // 70-200mm → 70-200
    .replace(/(\d+)cm/g, '$1')       // 120cm → 120
    .replace(/f(\/)?([\d.]+)/g, 'f$2') // f/2.8 or f2.8 → f2.8
    .replace(/\//g, '')
    .replace(/[\-–—]/g, ' ')         // normalise dashes to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreProduct(product, queryWords) {
  var n     = normalise(product.nameLower);
  var score = 0;

  // Check how many query words match
  var matchCount = queryWords.filter(function(w) { return w && n.includes(normalise(w)); }).length;
  if (matchCount === 0) return -1;

  // Full match bonus
  if (matchCount === queryWords.length) score += 400;

  // Partial match score proportional to coverage
  score += (matchCount / queryWords.length) * 200;

  // Has rental price
  if (product.price > 0) score += 500;

  // Not an accessory
  if (!isAccessory(product)) score += 300;

  // Has stock
  if (product.stockCount > 0) score += 100 + product.stockCount * 5;

  // Name starts with first query word
  if (n.startsWith(normalise(queryWords[0]))) score += 150;

  // Shorter name = more likely main product
  score -= product.name.length * 1.5;

  return score;
}

// Search with progressive fallback:
// 1. All words must match
// 2. Most specific words only (numbers + long words)
// 3. Single most specific word
function searchCatalog(query) {
  if (!query || catalog.length === 0) return [];

  var normQuery = normalise(query.toLowerCase().trim());
  var words     = normQuery.split(/\s+/).filter(function(w) { return w.length > 0; });
  if (words.length === 0) return [];

  // Score all products
  function runSearch(searchWords) {
    var scored = [];
    catalog.forEach(function(product) {
      var s = scoreProduct(product, searchWords);
      if (s > 0) scored.push({ product: product, score: s });
    });
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, 5).map(function(item) { return item.product; });
  }

  // Pass 1: all words
  var results = runSearch(words);
  if (results.length > 0) return results;

  // Pass 2: prioritise numbers and long words (model identifiers)
  if (words.length > 1) {
    var keyWords = words.filter(function(w) {
      return /\d/.test(w) || w.length >= 4;
    });
    if (keyWords.length > 0 && keyWords.length < words.length) {
      results = runSearch(keyWords);
      if (results.length > 0) return results;
    }
  }

  // Pass 3: single most specific word (longest or contains number)
  var sorted = words.slice().sort(function(a, b) {
    var aNum = /\d/.test(a) ? 1 : 0;
    var bNum = /\d/.test(b) ? 1 : 0;
    return (bNum - aNum) || (b.length - a.length);
  });
  results = runSearch([sorted[0]]);
  return results;
}

function findProduct(query) {
  var results = searchCatalog(query);
  return results.length > 0 ? results[0] : null;
}

function getProductUrl(product) {
  if (!product) return null;
  var slug = product.slug || product.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'https://www.2117.rentals/products/' + slug;
}

function getCatalogSummary() {
  if (catalog.length === 0) return '';
  return catalog.map(function(p) {
    return p.name + (p.priceFormatted ? ' (' + p.priceFormatted + ')' : '');
  }).join(', ');
}

function getCatalogCount() { return catalog.length; }
function isCatalogLoaded() { return catalogLoaded; }
function getCatalogAge()   { return loadedAt ? Math.floor((Date.now() - loadedAt) / 1000) + 's ago' : 'never'; }

module.exports = {
  loadCatalog,
  ensureCatalogFresh,
  reloadCatalog,
  searchCatalog,
  findProduct,
  getProductUrl,
  getCatalogSummary,
  getCatalogCount,
  isCatalogLoaded,
  getCatalogAge,
};
