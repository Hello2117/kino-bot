// utils/quoteBuilder.js
// Queries Booqable API directly for each item in a customer equipment list.
// Returns structured results with exact product name and price.
// GATE: only runs when message looks like a gear list (3+ lines or known gear keywords).

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

function cleanTerm(term) {
  return term
    .replace(/^[·•\-\*]\s*/g, '')     // strip bullet chars
    .replace(/x\s*\d+|\d+\s*x/gi, '') // x2, 2x
    .replace(/-\s*\d+\s*units?/gi, '') // - 2 units
    .replace(/\d+\s*units?/gi, '')      // 2 units
    .replace(/\s*\(\d+mm\)/g, '')      // (100mm)
    .replace(/[+\/,;:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchStrategies(term) {
  var t          = term.toLowerCase().trim();
  var strategies = [term];
  strategies.push(term.replace(/f\s*\/\s*[\d.]+/gi, '').trim());
  strategies.push(term.replace(/\s*(mk|mark)\s*i{1,3}/gi, '').trim());
  strategies.push(term.replace(/(\d+)\s*mm/gi, '$1').trim());
  var modelMatch = t.match(/([a-z]+\s*[\d]+[a-z]*\s*(?:iii|ii|i)?)/);
  if (modelMatch) strategies.push(modelMatch[1]);
  var numMatch = t.match(/(\d[\d\-]+)/);
  if (numMatch) strategies.push(numMatch[1]);
  return strategies.filter(function(s, i, arr) {
    return s && s.length > 1 && arr.indexOf(s) === i;
  });
}

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
  score -= product.name.length;
  return score;
}

async function searchOne(booqable, rawTerm) {
  var strategies = searchStrategies(cleanTerm(rawTerm));
  for (var si = 0; si < strategies.length; si++) {
    var term = strategies[si];
    if (!term || term.length < 2) continue;
    try {
      var res  = await booqable.get('/product_groups', { params: { q: term, per: 10 } });
      var list = (res.data && (res.data.product_groups || res.data.products)) || [];
      if (list.length === 0) continue;
      var scored = list.map(function(p) {
        return { product: p, score: scoreResult(p, term) };
      }).sort(function(a, b) { return b.score - a.score; });
      var best = scored[0].product;
      console.log('[Quote] "' + rawTerm + '" → ' + best.name + ' (price: ' + best.base_price_in_cents + ')');
      return best;
    } catch(e) {
      console.warn('[Quote] Search error for "' + term + '":', e.message);
    }
  }
  console.log('[Quote] "' + rawTerm + '" → NOT FOUND');
  return null;
}

function parseQty(line) {
  var m = line.match(/x\s*(\d+)|(\d+)\s*x|-\s*(\d+)\s*unit|(\d+)\s*unit/i);
  return m ? parseInt(m[1] || m[2] || m[3] || m[4]) : 1;
}

// GEAR GATE — only run quoteBuilder if message looks like an equipment list
var GEAR_PATTERNS = [
  /aputure|sony|arri|nanlite|sennheiser|smallhd|tilta|teradek|hollyland|movmax|sachtler|oconnor/i,
  /alexa|venice|raptor|komodo|burano|fx3|fx6|fx9|a7s/i,
  /600[cdx]|300[dx]|1200[dx]|80c|p60c|pt4c|pt2c|pt4c/i,
  /cutter|floppy|lantern|lightdome|diffus|pavotube|pavotubo/i,
  /tripod|c.stand|c stand|lens|prime|zoom|monitor|audio|lav/i,
];

function looksLikeGearList(message) {
  var lines = message.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length >= 3) return true;
  return GEAR_PATTERNS.some(function(r) { return r.test(message); });
}

async function buildQuoteContext(message) {
  var booqable = getBooqable();
  if (!booqable) return null;

  // GATE — skip greetings, questions, short messages
  if (!looksLikeGearList(message)) {
    console.log('[Quote] Skipping — not a gear list');
    return null;
  }

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

  var gearLines = rawLines.filter(function(line) {
    var l = line.toLowerCase().trim();
    return l.length > 2
      && !/^(hi|hello|hey|dear|good|thanks|thank|please|can you|may i|could|would|i want|i need|how|what|when|where|is|are|do|does|forwarded|accessories|lighting|cameras|lenses|audio|support|we're|we are|looking for)/i.test(l)
      && !/\?$/.test(l);
  });

  if (gearLines.length === 0) return null;

  var lineCounts = {};
  gearLines.forEach(function(line) {
    var key = cleanTerm(line).toLowerCase();
    lineCounts[key] = (lineCounts[key] || 0) + 1;
  });

  var uniqueLines = Object.keys(lineCounts);
  var batch       = uniqueLines.slice(0, 6); // max 6 to avoid timeout

  var searches = batch.map(function(line) {
    var qty = parseQty(line) * lineCounts[line];
    return searchOne(booqable, line).then(function(product) {
      return { line: line, qty: qty, product: product };
    });
  });

  var results = await Promise.all(searches);

  var found    = [];
  var notFound = [];

  results.forEach(function(r) {
    if (r.product) {
      var p     = r.product;
      var price = p.base_price_in_cents > 0
        ? 'RM' + (p.base_price_in_cents / 100).toFixed(0) + '/day'
        : 'pricing on request';
      var stock    = p.stock_count || 0;
      var stockMsg = '';
      // Only flag shortage — never show available count to Claude
      if (stock > 0 && r.qty > stock) {
        stockMsg = ' [STOCK WARNING: customer needs ' + r.qty + ', only ' + stock + ' available]';
      }
      found.push(p.name + ' — ' + price + ' qty:' + r.qty + stockMsg);
    } else {
      notFound.push(r.line);
    }
  });

  if (found.length === 0 && notFound.length === 0) return null;

  var context = '[BOOQABLE VERIFIED PRICES — use ONLY these, never guess:\n';
  if (found.length > 0)    context += found.join('\n') + '\n';
  if (notFound.length > 0) context += 'NOT FOUND (do not quote, offer alternatives): ' + notFound.join(', ') + '\n';
  context += ']';

  console.log('[Quote] ' + found.length + ' found, ' + notFound.length + ' not found');
  return context;
}

module.exports = { buildQuoteContext };
