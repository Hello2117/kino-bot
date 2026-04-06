// utils/booqableCatalog.js
// Fetches and caches the full Booqable product catalog at startup.
// Kino uses this for accurate gear lookups instead of hardcoded keywords.

const axios = require('axios');

var catalog       = [];   // Full product list
var catalogLoaded = false;
var loadedAt      = null;
var CACHE_TTL_MS  = 60 * 60 * 1000; // Refresh every 1 hour

function getBooqableClient() {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return null;
  return axios.create({
    baseURL: process.env.BOOQABLE_BASE_URL,
    timeout: 15000,
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    headers: { 'Content-Type': 'application/json' },
  });
}

// Fetch all product groups from Booqable (paginated)
async function fetchFullCatalog() {
  var booqable = getBooqableClient();
  if (!booqable) {
    console.log('[Catalog] Booqable not configured — skipping catalog load');
    return [];
  }

  var allProducts = [];
  var page        = 1;
  var perPage     = 100;
  var totalPages  = 1;

  console.log('[Catalog] Fetching full Booqable catalog...');

  while (page <= totalPages) {
    try {
      var res = await booqable.get('/product_groups', {
        params: { page: page, per: perPage },
      });
      var data     = res.data;
      var products = (data && (data.product_groups || data.products)) || [];
      var meta     = data && data.meta;
      var total    = meta && meta.total_count || 0;
      totalPages   = Math.ceil(total / perPage);

      products.forEach(function(p) {
        // Only include products with a name and not archived
        if (p.name && !p.archived) {
          allProducts.push({
            id:          p.id,
            name:        p.name,
            nameLower:   p.name.toLowerCase(),
            slug:        p.slug || '',
            price:       p.base_price_in_cents || 0,
            priceFormatted: p.base_price_in_cents
              ? 'RM' + (p.base_price_in_cents / 100).toFixed(0) + '/day'
              : null,
            stockCount:  p.stock_count || 0,
            trackable:   p.trackable || false,
            products:    p.products || [],
          });
        }
      });

      console.log('[Catalog] Fetched page ' + page + '/' + totalPages + ' (' + products.length + ' products)');
      page++;

    } catch(err) {
      console.error('[Catalog] Fetch error on page ' + page + ':', err.message);
      break;
    }
  }

  console.log('[Catalog] Total loaded: ' + allProducts.length + ' products');
  return allProducts;
}

// Load catalog — called at startup
async function loadCatalog() {
  try {
    catalog       = await fetchFullCatalog();
    catalogLoaded = true;
    loadedAt      = Date.now();
  } catch(err) {
    console.error('[Catalog] Failed to load:', err.message);
  }
}

// Refresh if cache expired
async function ensureCatalogFresh() {
  if (!catalogLoaded || !loadedAt || (Date.now() - loadedAt > CACHE_TTL_MS)) {
    await loadCatalog();
  }
}

// Accessory keywords — products with these are deprioritised
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

// Score a product against a query — higher is better
function scoreProduct(product, queryWords) {
  var n     = product.nameLower;
  var score = 0;

  // All words match — base requirement
  var allMatch = queryWords.every(function(w) { return n.includes(w); });
  if (!allMatch) return -1;

  // Exact full name match
  if (n === queryWords.join(' ')) score += 1000;

  // Has a rental price — it's a main rentable item
  if (product.price > 0) score += 500;

  // Not an accessory
  if (!isAccessory(product)) score += 300;

  // Has stock — actually available
  if (product.stockCount > 0) score += 100;

  // Word match density — more query words matched = better
  var matchedWords = queryWords.filter(function(w) { return n.includes(w); }).length;
  score += matchedWords * 50;

  // Shorter name = more likely the main product (not an accessory variant)
  score -= product.name.length * 2;

  // Query appears at start of name — strong signal
  if (n.startsWith(queryWords[0])) score += 200;

  return score;
}

// Search catalog with smart ranking — returns best matches first
function searchCatalog(query) {
  if (!query || catalog.length === 0) return [];
  var lower = query.toLowerCase().trim();
  var words = lower.split(/\s+/).filter(function(w) { return w.length > 0; });
  if (words.length === 0) return [];

  var scored = [];
  catalog.forEach(function(product) {
    var s = scoreProduct(product, words);
    if (s >= 0) scored.push({ product: product, score: s });
  });

  // Sort by score descending
  scored.sort(function(a, b) { return b.score - a.score; });

  return scored.slice(0, 5).map(function(item) { return item.product; });
}

// Find best single match
function findProduct(query) {
  var results = searchCatalog(query);
  return results.length > 0 ? results[0] : null;
}

// Get product page URL
function getProductUrl(product) {
  if (!product) return null;
  var slug = product.slug || product.name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'https://www.2117.rentals/products/' + slug;
}

// Get full catalog summary for system prompt injection
function getCatalogSummary() {
  if (catalog.length === 0) return '';
  return catalog.map(function(p) {
    return p.name + (p.priceFormatted ? ' (' + p.priceFormatted + ')' : '');
  }).join(', ');
}

function getCatalogCount() { return catalog.length; }
function isCatalogLoaded() { return catalogLoaded; }

module.exports = {
  loadCatalog,
  ensureCatalogFresh,
  searchCatalog,
  findProduct,
  getProductUrl,
  getCatalogSummary,
  getCatalogCount,
  isCatalogLoaded,
};
