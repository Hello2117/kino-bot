// utils/quoteBuilder.js
// Queries Booqable API directly for each item in a customer equipment list.
// Returns structured results with exact product name, price and stock.

const axios = require('axios');

function getBooqable() {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return null;
  return axios.create({
    baseURL: process.env.BOOQABLE_BASE_URL,
    timeout: 8000,
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    headers: { 'Content-Type': 'application/json' },
  });
}

// Clean a search term — strip qty, punctuation, normalise
function cleanTerm(term) {
  return term
    .replace(/x\s*\d+|\d+\s*x/gi, '')  // x2, 2x
    .replace(/\s*\(\d+mm\)/g, '')        // (100mm)
    .replace(/[+\/,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate multiple search strategies from a customer term
// Try progressively simpler terms until we get a match
function searchStrategies(term) {
  var t = term.toLowerCase().trim();
  var strategies = [term]; // original first

  // Remove f-stop: "f/2.8" → try without
  strategies.push(term.replace(/f\s*\/\s*[\d.]+/gi, '').trim());

  // Remove "mk ii", "mark ii", "gen 2" variants
  strategies.push(term.replace(/\s*(mk|mark)\s*i{1,3}/gi, '').trim());

  // Remove "mm" from focal lengths: 70-200mm → 70-200
  strategies.push(term.replace(/(\d+)\s*mm/gi, '$1').trim());

  // For camera models — try just the model number
  var modelMatch = t.match(/([a-z]+\s*[\d]+[a-z]*\s*(?:iii|ii|i)?)/);
  if (modelMatch) strategies.push(modelMatch[1]);

  // Brand + key number only
  var numMatch = t.match(/(\d[\d\-]+)/);
  if (numMatch) strategies.push(numMatch[1]);

  // Remove duplicates and empties
  return strategies.filter(function(s, i, arr) {
    return s && s.length > 1 && arr.indexOf(s) === i;
  });
}

// Score Booqable results — prefer rentable items over accessories
var ACCESSORY_WORDS = ['cable', 'cage', 'plate', 'adapter', 'cap', 'strap',
  'battery', 'charger', 'case', 'bag', 'rod', 'clamp', 'smallrig',
  'housing', 'dovetail', 'lemo', 'xlr', 'rosette', 'ronford', 'hi-hat',
  'low-leg', 'quick adapter', 'fluid head', 'tripod head', 'tripod plate'];

function scoreResult(product, queryLower) {
  var n     = product.name.toLowerCase();
  var score = 0;

  if (product.base_price_in_cents > 0) score += 500;
  if (!ACCESSORY_WORDS.some(function(w) { return n.includes(w); })) score += 300;
  if (product.stock_count > 0) score += 100 + product.stock_count * 10;
  if (n.startsWith(queryLower.toLowerCase().split(' ')[0])) score += 200;
  score -= product.name.length; // shorter names preferred

  return score;
}

// Search Booqable for one item — tries multiple strategies
async function searchOne(booqable, rawTerm) {
  var strategies = searchStrategies(cleanTerm(rawTerm));

  for (var si = 0; si < strategies.length; si++) {
    var term = strategies[si];
    if (!term || term.length < 2) continue;

    try {
      var res  = await booqable.get('/product_groups', { params: { q: term, per: 10 } });
      var list = (res.data && (res.data.product_groups || res.data.products)) || [];

      if (list.length === 0) continue;

      // Score and sort
      var scored = list.map(function(p) {
        return { product: p, score: scoreResult(p, term) };
      }).sort(function(a, b) { return b.score - a.score; });

      var best = scored[0].product;
      console.log('[Quote] "' + rawTerm + '" → strategy "' + term + '" → ' + best.name + ' (stock: ' + best.stock_count + ', price: ' + best.base_price_in_cents + ')');
      return best;

    } catch(e) {
      console.warn('[Quote] Search error for "' + term + '":', e.message);
    }
  }

  console.log('[Quote] "' + rawTerm + '" → NOT FOUND after ' + strategies.length + ' strategies');
  return null;
}

// Parse quantity from a line
function parseQty(line) {
  var m = line.match(/x\s*(\d+)|(\d+)\s*x/i);
  if (m) return parseInt(m[1] || m[2]);
  // Count repeated identical lines handled by caller
  return 1;
}

// Main function — takes full customer message, returns structured quote data
async function buildQuoteContext(message) {
  var booqable = getBooqable();
  if (!booqable) return null;

  // Split on newlines and + signs
  var rawLines = [];
  message.split('\n').forEach(function(line) {
    line = line.trim();
    if (!line) return;
    if (line.includes('+')) {
      line.split('+').forEach(function(part) {
        var p = part.trim();
        if (p) rawLines.push(p);
      });
    } else {
      rawLines.push(line);
    }
  });

  // Filter out non-gear lines (greetings, questions)
  var gearLines = rawLines.filter(function(line) {
    var l = line.toLowerCase();
    return l.length > 2
      && !/^(hi|hello|hey|dear|good|thanks|thank|please|can you|may i|could|would|i want|i need|how|what|when|where|is|are|do|does|forwarded)/i.test(l.trim())
      && !/\?$/.test(l.trim());
  });

  if (gearLines.length === 0) return null;

  // Deduplicate and count repeated lines
  var lineCounts = {};
  gearLines.forEach(function(line) {
    var key = cleanTerm(line).toLowerCase();
    lineCounts[key] = (lineCounts[key] || 0) + 1;
  });

  var uniqueLines = Object.keys(lineCounts);

  // Search Booqable for each unique item (parallel, max 8)
  var results = [];
  var batch   = uniqueLines.slice(0, 8);

  var searches = batch.map(function(line) {
    var qty = parseQty(line) * lineCounts[line];
    return searchOne(booqable, line).then(function(product) {
      return { line: line, qty: qty, product: product };
    });
  });

  results = await Promise.all(searches);

  // Build context string
  var found    = [];
  var notFound = [];

  results.forEach(function(r) {
    if (r.product) {
      var p      = r.product;
      var price  = p.base_price_in_cents > 0
        ? 'RM' + (p.base_price_in_cents / 100).toFixed(0) + '/day'
        : 'pricing on request';
      var stock  = p.stock_count || 0;
      var stockMsg = '';

      if (stock > 0 && r.qty > stock) {
        stockMsg = ' [STOCK: only ' + stock + ' available, customer requested ' + r.qty + ']';
      } else if (stock > 0) {
        stockMsg = ' [STOCK: ' + stock + ' available]';
      }

      found.push(p.name + ' — ' + price + ' | qty requested: ' + r.qty + stockMsg);
    } else {
      notFound.push(r.line);
    }
  });

  var context = '[BOOQABLE VERIFIED QUOTE DATA — use ONLY these prices and stock counts:\n';
  if (found.length > 0)    context += found.join('\n') + '\n';
  if (notFound.length > 0) context += 'NOT FOUND IN BOOQABLE (do not quote, offer alternatives): ' + notFound.join(', ') + '\n';
  context += 'These results are from live Booqable API. Never override with guessed prices.]';

  console.log('[Quote] Built context: ' + found.length + ' found, ' + notFound.length + ' not found');
  return context;
}

module.exports = { buildQuoteContext };
