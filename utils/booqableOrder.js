// utils/booqableOrder.js
// Creates a Booqable order with line items from KINO's quote.
// Returns order number for embedding in the PDF.

const axios = require('axios');
const catalog = require('./booqableCatalog');

function getBooqable() {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return null;
  return axios.create({
    baseURL: process.env.BOOQABLE_BASE_URL,
    timeout: 15000,
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    headers: { 'Content-Type': 'application/json' },
  });
}

// Parse date string into ISO format for Booqable
// Accepts: "11 April 2026", "11/04/2026", "2026-04-11"
function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr).toISOString();
    // DD/MM/YYYY
    var dmyMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      return new Date(dmyMatch[3] + '-' + dmyMatch[2].padStart(2,'0') + '-' + dmyMatch[1].padStart(2,'0')).toISOString();
    }
    // "11 April 2026" or "April 11 2026"
    return new Date(dateStr).toISOString();
  } catch(e) {
    return null;
  }
}

// Parse equipment items from KINO's reply text
// Extracts lines that look like: "Product Name — RM200/day"
function parseQuoteItems(replyText) {
  var items = [];
  var lines = replyText.split('\n');

  lines.forEach(function(line) {
    var trimmed = line.trim().replace(/\*/g, '');
    if (!trimmed) return;

    // Must contain RM and a separator to be an item line
    if (!/RM\s*[\d,]+/.test(trimmed)) return;
    if (!/—|–|-/.test(trimmed)) return;

    // Skip headers and totals
    if (/^(TOTAL|SUBTOTAL|SST|PAYMENT|CAMERAS|LENSES|LIGHTING|AUDIO|TRIPODS|ACCESSORIES|SUPPORT)/i.test(trimmed)) return;
    if (/^(Job:|Customer:|Shoot|Collection:|Return:|Our team|TWENTYONE|2117\.)/i.test(trimmed)) return;

    // Extract quantity
    var qty = 1;
    var qtyMatch = trimmed.match(/^(\d+)\s*x\s+/i) || trimmed.match(/^(\d+)x\s+/i);
    if (qtyMatch) qty = parseInt(qtyMatch[1]);

    // Extract product name (before — or -)
    var parts  = trimmed.split(/\s*[—–]\s*/);
    var name   = parts[0] ? parts[0].replace(/^\d+x?\s+/i, '').trim() : null;
    if (!name || name.length < 2) return;

    // Extract price
    var priceMatch = trimmed.match(/RM\s*([\d,]+)/);
    var price = priceMatch ? parseInt(priceMatch[1].replace(',', '')) : null;

    items.push({ name: name, qty: qty, price: price });
  });

  return items;
}

// Find Booqable product_group_id by name
async function findProductId(name) {
  try {
    await catalog.ensureCatalogFresh();
    var results = catalog.searchCatalog(name);
    if (results.length > 0) return results[0].id;
    return null;
  } catch(e) {
    return null;
  }
}

// Create order in Booqable, add line items, return order number
async function createBooqableOrder(form, replyText) {
  var booqable = getBooqable();
  if (!booqable) throw new Error('Booqable not configured');

  // 1 — Parse dates
  var startsAt = parseDate(form.prepPickupDate || form.shootingDate);
  var stopsAt  = parseDate(form.returnDate || form.shootingDate);

  // Default: pickup day before shoot, return day after
  if (!startsAt && form.shootingDate) {
    var shootDate = new Date(parseDate(form.shootingDate));
    var pickup    = new Date(shootDate); pickup.setDate(pickup.getDate() - 1);
    var returnD   = new Date(shootDate); returnD.setDate(returnD.getDate() + 1);
    startsAt = pickup.toISOString();
    stopsAt  = returnD.toISOString();
  }

  // Fallback dates if none provided
  if (!startsAt) {
    var now = new Date();
    startsAt = now.toISOString();
    var end = new Date(now); end.setDate(end.getDate() + 2);
    stopsAt = end.toISOString();
  }

  // 2 — Get location ID (use first available)
  var locationId = process.env.BOOQABLE_LOCATION_ID || '1b77b015-855c-4321-9b1d-2a8bd25b9fe5';

  // 3 — Create the order
  var orderPayload = {
    order: {
      starts_at:         startsAt,
      stops_at:          stopsAt,
      customer_id:       form.booqableCustomerId || null,
      tag_list:          ['kino', 'whatsapp'],
      start_location_id: locationId,
      stop_location_id:  locationId,
    }
  };

  console.log('[BooqableOrder] Creating order for', form.jobName || 'Unknown Job');
  var orderRes = await booqable.post('/orders', orderPayload);
  var order    = orderRes.data && orderRes.data.order;
  if (!order) throw new Error('Order creation failed — no order in response');

  console.log('[BooqableOrder] Order created: #' + order.number + ' (' + order.id + ')');

  // 4 — Parse items from reply
  var items = parseQuoteItems(replyText);
  console.log('[BooqableOrder] Parsed ' + items.length + ' line items from reply');

  // 5 — Add line items
  var addedCount = 0;
  for (var i = 0; i < items.length; i++) {
    var item      = items[i];
    var productId = await findProductId(item.name);

    if (!productId) {
      console.log('[BooqableOrder] Could not find product ID for: ' + item.name + ' — skipping');
      continue;
    }

    try {
      var linePayload = {
        line: {
          owner_id:          order.id,
          owner_type:        'orders',
          product_group_id:  productId,
          quantity:          item.qty || 1,
        }
      };
      await booqable.post('/lines', linePayload);
      addedCount++;
      console.log('[BooqableOrder] Added line: ' + item.name + ' x' + item.qty);
    } catch(lineErr) {
      console.warn('[BooqableOrder] Line add failed for ' + item.name + ':', lineErr.message);
    }
  }

  console.log('[BooqableOrder] Done — ' + addedCount + '/' + items.length + ' items added');

  return {
    orderId:     order.id,
    orderNumber: order.number,
    startsAt:    startsAt,
    stopsAt:     stopsAt,
    itemsAdded:  addedCount,
    totalItems:  items.length,
  };
}

module.exports = { createBooqableOrder, parseQuoteItems };
