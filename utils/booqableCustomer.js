// utils/booqableCustomer.js
// Creates or finds customers in Booqable when invoice details are collected.

const axios = require('axios');

function getBooqableClient() {
  if (!process.env.BOOQABLE_API_KEY || !process.env.BOOQABLE_BASE_URL) return null;
  return axios.create({
    baseURL: process.env.BOOQABLE_BASE_URL,
    timeout: 15000,
    params:  { api_key: process.env.BOOQABLE_API_KEY },
    headers: { 'Content-Type': 'application/json' },
  });
}

// Find existing customer by email or name
async function findCustomer(email, name) {
  var booqable = getBooqableClient();
  if (!booqable) return null;
  try {
    var query = email || name;
    var res   = await booqable.get('/customers', { params: { q: query, per: 5 } });
    var customers = (res.data && res.data.customers) || [];
    if (email) {
      var byEmail = customers.find(function(c) {
        return c.email && c.email.toLowerCase() === email.toLowerCase();
      });
      if (byEmail) return byEmail;
    }
    return customers.length > 0 ? customers[0] : null;
  } catch(e) {
    console.error('[Booqable] findCustomer error:', e.message);
    return null;
  }
}

// Create a new customer in Booqable
async function createCustomer(invoiceDetails, invoiceType) {
  var booqable = getBooqableClient();
  if (!booqable) return null;

  try {
    var name  = invoiceType === 'company'
      ? (invoiceDetails.companyName || invoiceDetails.contactPerson || 'Unknown')
      : (invoiceDetails.name || 'Unknown');

    var email = invoiceDetails.email || null;

    // Check if customer already exists
    var existing = await findCustomer(email, name);
    if (existing) {
      console.log('[Booqable] Customer already exists:', existing.id, existing.name);
      return { customer: existing, created: false };
    }

    // Build customer properties for e-invoice compliance
    var properties = [];

    if (invoiceType === 'company') {
      if (invoiceDetails.registrationNo) {
        properties.push({ name: 'SSM Registration', value: invoiceDetails.registrationNo });
      }
      if (invoiceDetails.tinNumber) {
        properties.push({ name: 'TIN Number', value: invoiceDetails.tinNumber });
      }
      if (invoiceDetails.sstNumber) {
        properties.push({ name: 'SST Number', value: invoiceDetails.sstNumber });
      }
      if (invoiceDetails.contactPerson) {
        properties.push({ name: 'Contact Person', value: invoiceDetails.contactPerson });
      }
    } else {
      if (invoiceDetails.icNumber) {
        properties.push({ name: 'IC Number', value: invoiceDetails.icNumber });
      }
    }

    var payload = {
      customer: {
        name:  name,
        email: email,
        phone: invoiceDetails.phone || null,
        properties_attributes: properties.map(function(p) {
          return { name: p.name, value: p.value, type: 'Property::Text' };
        }),
      }
    };

    var res = await booqable.post('/customers', payload);
    var customer = res.data && res.data.customer;

    if (customer) {
      console.log('[Booqable] Customer created:', customer.id, customer.name);
      return { customer: customer, created: true };
    }
    return null;

  } catch(e) {
    console.error('[Booqable] createCustomer error:', e.response && JSON.stringify(e.response.data) || e.message);
    return null;
  }
}

module.exports = { createCustomer, findCustomer };
