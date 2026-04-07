// utils/pdfGenerator.js
// Generates a clean quote PDF when equipment list exceeds 10 items.
// Returns a Buffer — caller uploads to Supabase Storage and sends via WATI.

const PDFDocument = require('pdfkit');

// ─────────────────────────────────────────────
// ITEM COUNT DETECTION
// Counts equipment line items in KINO's reply
// ─────────────────────────────────────────────

function countQuoteItems(replyText) {
  var lines = replyText.split('\n');
  var count = 0;
  lines.forEach(function(line) {
    var trimmed = line.trim();
    // Line looks like an equipment item if it contains RM and a dash/separator
    var hasPrice   = /RM\s*[\d,]+/.test(trimmed);
    var hasSep     = /—|–|-/.test(trimmed);
    var notHeader  = !/^\*(CAMERAS|LENSES|LIGHTING|AUDIO|TRIPODS|SUPPORT|TOTAL|SUBTOTAL|SST|PAYMENT|ACCESSORIES|GRIP)/i.test(trimmed);
    var notMeta    = !/^(Job:|Customer:|Shoot|Collection:|Return:|Our team|TWENTYONE|2117\.|Payment:|---)/i.test(trimmed);
    if (hasPrice && hasSep && notHeader && notMeta) count++;
  });
  return count;
}

// ─────────────────────────────────────────────
// PDF GENERATION
// ─────────────────────────────────────────────

function generateQuotePDF(replyText, customerName, jobName, shootDate) {
  return new Promise(function(resolve, reject) {
    try {
      var doc    = new PDFDocument({ margin: 50, size: 'A4' });
      var chunks = [];

      doc.on('data',  function(chunk) { chunks.push(chunk); });
      doc.on('end',   function() { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var BRAND   = '#1A1A1A';
      var ACCENT  = '#C8A96E';   // warm gold — close to 2117 palette
      var LIGHT   = '#F5F5F5';
      var W       = doc.page.width - 100; // usable width

      // ── HEADER ──────────────────────────────────────────────────────────
      doc.rect(50, 50, W, 70).fill(BRAND);
      doc
        .fillColor('#FFFFFF')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('TWENTYONESEVENTEEN', 70, 65, { width: W - 40 });
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(ACCENT)
        .text('2117.rentals  |  Cinema Equipment Rental', 70, 90);

      doc.moveDown(3);

      // ── QUOTE TITLE ─────────────────────────────────────────────────────
      doc
        .fillColor(BRAND)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('QUOTATION', 50, 140);

      doc
        .moveTo(50, 158).lineTo(50 + W, 158)
        .strokeColor(ACCENT).lineWidth(1.5).stroke();

      // ── META INFO ───────────────────────────────────────────────────────
      var metaY = 170;
      var col2  = 320;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#555555');
      doc.text('CUSTOMER',  50,  metaY);
      doc.text('JOB',       50,  metaY + 16);
      doc.text('SHOOT DATE', 50, metaY + 32);
      doc.text('GENERATED', col2, metaY);

      doc.font('Helvetica').fillColor(BRAND);
      doc.text(customerName || '—', 150, metaY);
      doc.text(jobName      || '—', 150, metaY + 16);
      doc.text(shootDate    || '—', 150, metaY + 32);
      doc.text(new Date().toLocaleDateString('en-MY', {
        day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'Asia/Kuala_Lumpur'
      }), col2 + 80, metaY);

      doc.moveDown(4);

      // ── PARSE REPLY INTO SECTIONS ────────────────────────────────────────
      var lines    = replyText.split('\n');
      var sections = [];
      var current  = { header: null, items: [] };

      lines.forEach(function(line) {
        var trimmed = line.trim();
        if (!trimmed || trimmed === '---') return;

        // Section headers wrapped in * e.g. *LIGHTING*
        var headerMatch = trimmed.match(/^\*([A-Z][A-Z\s\/&]+)\*\s*$/);
        if (headerMatch) {
          if (current.header || current.items.length > 0) sections.push(current);
          current = { header: headerMatch[1], items: [] };
          return;
        }

        // TOTAL / SUBTOTAL / SST lines
        if (/^\*(TOTAL|SUBTOTAL|SST|PAYMENT|COLLECTION|RETURN)/i.test(trimmed)) {
          current.items.push({ type: 'summary', text: trimmed.replace(/\*/g, '') });
          return;
        }

        // Skip meta lines
        if (/^(Job:|Customer:|Shoot Date|Our team|TWENTYONE|2117\.|---)/i.test(trimmed)) return;

        // Equipment item lines (contain RM)
        if (/RM\s*[\d,]+/.test(trimmed)) {
          current.items.push({ type: 'item', text: trimmed.replace(/\*/g, '') });
        } else if (trimmed.length > 2) {
          current.items.push({ type: 'note', text: trimmed.replace(/\*/g, '') });
        }
      });
      if (current.header || current.items.length > 0) sections.push(current);

      // ── RENDER SECTIONS ──────────────────────────────────────────────────
      var y = 250;
      var pageH = doc.page.height - 80;

      function checkPage(neededHeight) {
        if (y + neededHeight > pageH) {
          doc.addPage();
          y = 60;
        }
      }

      sections.forEach(function(section) {
        if (!section.items || section.items.length === 0) return;

        checkPage(30);

        if (section.header) {
          // Section header bar
          doc.rect(50, y, W, 20).fill(BRAND);
          doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
            .text(section.header, 58, y + 6, { width: W - 16 });
          y += 26;
        }

        section.items.forEach(function(item) {
          checkPage(18);

          if (item.type === 'item') {
            // Equipment row — alternating background
            var rowBg = (section.items.indexOf(item) % 2 === 0) ? LIGHT : '#FFFFFF';
            doc.rect(50, y, W, 18).fill(rowBg);

            // Split item text into name and price
            var parts     = item.text.split(/—|–/);
            var itemName  = parts[0] ? parts[0].trim() : item.text;
            var itemPrice = parts[1] ? parts[1].trim() : '';

            doc.fillColor(BRAND).fontSize(9).font('Helvetica')
              .text(itemName, 58, y + 4, { width: W - 120, ellipsis: true });
            doc.fillColor(BRAND).fontSize(9).font('Helvetica-Bold')
              .text(itemPrice, 50 + W - 110, y + 4, { width: 105, align: 'right' });
            y += 18;

          } else if (item.type === 'summary') {
            // Totals / SST / Payment
            var isTotal = /^TOTAL/i.test(item.text);
            y += 4;
            checkPage(22);
            if (isTotal) {
              doc.rect(50, y, W, 22).fill(BRAND);
              doc.fillColor(ACCENT).fontSize(11).font('Helvetica-Bold')
                .text(item.text, 58, y + 5, { width: W - 16 });
            } else {
              doc.fillColor('#555555').fontSize(9).font('Helvetica')
                .text(item.text, 58, y + 3, { width: W - 16 });
            }
            y += isTotal ? 28 : 18;

          } else {
            // Note / plain text
            doc.fillColor('#777777').fontSize(8).font('Helvetica-Oblique')
              .text(item.text, 58, y + 2, { width: W - 16 });
            y += 16;
          }
        });

        y += 12; // gap between sections
      });

      // ── FOOTER ──────────────────────────────────────────────────────────
      checkPage(50);
      y = Math.max(y + 20, pageH - 50);
      doc.moveTo(50, y).lineTo(50 + W, y).strokeColor(ACCENT).lineWidth(0.5).stroke();
      y += 8;
      doc
        .fillColor('#999999').fontSize(7.5).font('Helvetica')
        .text(
          'This quotation is subject to availability and confirmation by the TWENTYONESEVENTEEN team. '
          + 'Prices are exclusive of delivery. 6% SST applies. '
          + 'Collection: 10:30am–5:00pm | Return: 10:30am–2:00pm | 2117.rentals',
          50, y, { width: W, align: 'center' }
        );

      doc.end();

    } catch(err) {
      reject(err);
    }
  });
}

module.exports = { generateQuotePDF, countQuoteItems };
