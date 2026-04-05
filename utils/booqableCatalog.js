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

// Search catalog by name — fuzzy match
function searchCatalog(query) {
  if (!query || catalog.length === 0) return [];
  var lower = query.toLowerCase().trim();
  var words = lower.split(/\s+/);

  return catalog.filter(function(product) {
    // Match if all query words appear in product name
    return words.every(function(word) {
      return product.nameLower.includes(word);
    });
  }).slice(0, 5);
}

// Find closest match — returns single best match
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
