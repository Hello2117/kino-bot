// handlers/booqableHandler.js
// All Booqable REST API interactions.
// API key lives in .env — never hardcoded here.

const axios = require('axios');

const BASE_URL = process.env.BOOQABLE_BASE_URL;
const API_KEY  = process.env.BOOQABLE_API_KEY;

// Axios instance with auth header pre-attached
const booqable = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ─────────────────────────────────────────────
// CATALOG
// ─────────────────────────────────────────────

/**
 * Fetch all active products from Booqable catalog.
 */
async function getCatalog() {
  try {
    const res = await booqable.get('/products', {
      params: { 'filter[status]': 'active', 'page[size]': 100 },
    });
    return res.data.products || [];
  } catch (err) {
    console.error('[Booqable] getCatalog error:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Search products by keyword (name).
 * @param {string} keyword
 */
async function searchProducts(keyword) {
  try {
    const res = await booqable.get('/products', {
      params: {
        'filter[status]': 'active',
        'filter[q]': keyword,
        'page[size]': 20,
      },
    });
    return res.data.products || [];
  } catch (err) {
    console.error('[Booqable] searchProducts error:', err.response?.data || err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// AVAILABILITY
// ─────────────────────────────────────────────

/**
 * Check availability of a product for given date range.
 * @param {string} productId
 * @param {string} fromDate - ISO date string e.g. "2025-01-10"
 * @param {string} tillDate - ISO date string e.g. "2025-01-13"
 */
async function checkAvailability(productId, fromDate, tillDate) {
  try {
    const res = await booqable.get(`/products/${productId}/stock_items`, {
      params: {
        'filter[from]': fromDate,
        'filter[till]': tillDate,
      },
    });
    const items = res.data.stock_items || [];
    const available = items.filter(item => item.status === 'available');
    return {
      available: available.length > 0,
      availableCount: available.length,
      totalCount: items.length,
    };
  } catch (err) {
    console.error('[Booqable] checkAvailability error:', err.response?.data || err.message);
    return { available: null, error: true };
  }
}

// ─────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────

/**
 * Find a customer by phone number.
 * @param {string} phone - WhatsApp number e.g. "+60123456789"
 */
async function findCustomerByPhone(phone) {
  try {
    const res = await booqable.get('/customers', {
      params: { 'filter[q]': phone, 'page[size]': 5 },
    });
    const customers = res.data.customers || [];
    return customers.find(c => c.phone === phone) || null;
  } catch (err) {
    console.error('[Booqable] findCustomerByPhone error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Create a new customer record.
 * @param {string} name
 * @param {string} phone - WhatsApp number
 * @param {string} [email]
 */
async function createCustomer(name, phone, email = '') {
  try {
    const payload = {
      data: {
        type: 'customers',
        attributes: { name, phone, ...(email && { email }) },
      },
    };
    const res = await booqable.post('/customers', payload);
    return res.data.customer || null;
  } catch (err) {
    console.error('[Booqable] createCustomer error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Get or create a customer by phone number.
 * Returns the customer object either way.
 */
async function getOrCreateCustomer(name, phone, email = '') {
  const existing = await findCustomerByPhone(phone);
  if (existing) return existing;
  return createCustomer(name, phone, email);
}

// ─────────────────────────────────────────────
// QUOTES (ORDERS)
// ─────────────────────────────────────────────

/**
 * Create a new quote/order in Booqable.
 * @param {string} customerId
 * @param {string} startsAt - ISO datetime e.g. "2025-01-10T09:00:00.000Z"
 * @param {string} stopsAt  - ISO datetime e.g. "2025-01-13T18:00:00.000Z"
 * @param {number} [discountPercentage] - e.g. 10 for 10%
 */
async function createQuote(customerId, startsAt, stopsAt, discountPercentage = 0) {
  try {
    const payload = {
      data: {
        type: 'orders',
        attributes: {
          starts_at: startsAt,
          stops_at: stopsAt,
          customer_id: customerId,
          ...(discountPercentage > 0 && { discount_percentage: discountPercentage }),
        },
      },
    };
    const res = await booqable.post('/orders', payload);
    return res.data.order || null;
  } catch (err) {
    console.error('[Booqable] createQuote error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Add a product line item to an existing quote.
 * @param {string} orderId
 * @param {string} productId
 * @param {number} [quantity]
 */
async function addLineItem(orderId, productId, quantity = 1) {
  try {
    const payload = {
      data: {
        type: 'lines',
        attributes: {
          owner_id: orderId,
          owner_type: 'orders',
          product_id: productId,
          quantity,
        },
      },
    };
    const res = await booqable.post('/lines', payload);
    return res.data.line || null;
  } catch (err) {
    console.error('[Booqable] addLineItem error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Build a full quote from scratch:
 * - Gets or creates the customer
 * - Creates the order
 * - Adds all line items
 * - Returns quote URL
 *
 * @param {object} params
 * @param {string} params.customerName
 * @param {string} params.customerPhone
 * @param {string} params.startsAt
 * @param {string} params.stopsAt
 * @param {Array<{productId: string, quantity?: number}>} params.items
 * @param {number} params.discountPercentage
 */
async function buildFullQuote({ customerName, customerPhone, startsAt, stopsAt, items, discountPercentage = 0 }) {
  // Step 1: Get or create customer
  const customer = await getOrCreateCustomer(customerName, customerPhone);
  if (!customer) return { success: false, error: 'Could not create customer' };

  // Step 2: Create the order
  const order = await createQuote(customer.id, startsAt, stopsAt, discountPercentage);
  if (!order) return { success: false, error: 'Could not create quote' };

  // Step 3: Add all line items
  const lineResults = await Promise.all(
    items.map(item => addLineItem(order.id, item.productId, item.quantity || 1))
  );
  const failedLines = lineResults.filter(l => !l);

  // Step 4: Build the quote URL (Booqable customer-facing quote link)
  const subdomain = BASE_URL.match(/https:\/\/([^.]+)\./)?.[1] || 'yourcompany';
  const quoteUrl = `https://${subdomain}.booqable.com/orders/${order.id}`;

  return {
    success: true,
    orderId: order.id,
    quoteUrl,
    customerId: customer.id,
    failedLineCount: failedLines.length,
    order,
  };
}

/**
 * Search catalog and check availability for a product name and date range.
 * @param {string} productName - e.g. "ARRI Alexa 35"
 * @param {string} fromDate    - e.g. "2025-04-15"
 * @param {string} tillDate    - e.g. "2025-04-17"
 */
async function checkProductAvailability(productName, fromDate, tillDate) {
  try {
    // Step 1: Search for the product
    const products = await searchProducts(productName);
    if (!products || products.length === 0) {
      return { found: false, message: 'Product not found in catalog' };
    }

    // Step 2: Check availability for each matching product
    var results = [];
    for (var i = 0; i < Math.min(products.length, 3); i++) {
      var product = products[i];
      var availability = await checkAvailability(product.id, fromDate, tillDate);
      results.push({
        name:      product.name,
        available: availability.available,
        count:     availability.availableCount,
      });
    }

    return { found: true, results: results };
  } catch (err) {
    console.error('[Booqable] checkProductAvailability error:', err.message);
    return { found: false, message: 'Could not check availability' };
  }
}

module.exports = {
  getCatalog,
  searchProducts,
  checkAvailability,
  checkProductAvailability,
  findCustomerByPhone,
  createCustomer,
  getOrCreateCustomer,
  createQuote,
  addLineItem,
  buildFullQuote,
};
