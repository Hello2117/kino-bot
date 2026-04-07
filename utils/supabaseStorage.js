// utils/supabaseStorage.js
// Uploads a PDF buffer to Supabase Storage and returns a public URL.
// Requires: SUPABASE_URL, SUPABASE_KEY env vars.
// Requires: a public bucket named 'quotes' in Supabase Storage.

const { createClient } = require('@supabase/supabase-js');

function getClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Supabase env vars not set');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

// Upload PDF buffer → returns public URL string
async function uploadQuotePDF(pdfBuffer, filename) {
  var supabase = getClient();

  var { error } = await supabase.storage
    .from('quotes')
    .upload(filename, pdfBuffer, {
      contentType:  'application/pdf',
      upsert:       true,
    });

  if (error) throw new Error('Supabase upload failed: ' + error.message);

  var { data } = supabase.storage
    .from('quotes')
    .getPublicUrl(filename);

  if (!data || !data.publicUrl) throw new Error('Could not get public URL');
  return data.publicUrl;
}

// Generate a unique filename per customer quote
function buildFilename(waId, jobName) {
  var safe = (jobName || 'quote').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
  var ts   = Date.now();
  return 'quotes/' + waId + '_' + safe + '_' + ts + '.pdf';
}

module.exports = { uploadQuotePDF, buildFilename };
