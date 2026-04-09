// utils/scheduler.js
// Runs every 30 minutes and handles all timed customer communications:
// 1. 12-hour quote follow-up (once only)
// 2. Pre-collection reminder + PIC check (day before)
// 3. Return reminder (morning of return date, 9am MYT)
// 4. PIC check right after quote is sent

const { createClient } = require('@supabase/supabase-js');
const { sendMessage }  = require('../handlers/watiHandler');

var SCHEDULER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
var MYT_OFFSET_MS         = 8 * 60 * 60 * 1000; // UTC+8

// ─────────────────────────────────────────────
// SUPABASE CLIENT (service role — bypasses RLS)
// ─────────────────────────────────────────────

function getSupabase() {
  var key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!process.env.SUPABASE_URL || !key) return null;
  return createClient(process.env.SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─────────────────────────────────────────────
// DATE HELPERS (Malaysia time)
// ─────────────────────────────────────────────

function nowMYT() {
  return new Date(Date.now() + MYT_OFFSET_MS);
}

function toMYT(date) {
  return new Date(new Date(date).getTime() + MYT_OFFSET_MS);
}

// Parse date from form — handles "11 April 2026", "11/04/2026", ISO
function parseFormDate(dateStr) {
  if (!dateStr) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr);
    var dmyMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      return new Date(dmyMatch[3] + '-' + dmyMatch[2].padStart(2,'0') + '-' + dmyMatch[1].padStart(2,'0'));
    }
    return new Date(dateStr);
  } catch(e) { return null; }
}

// Format date as "Monday, 11 April 2026"
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

// Is the date tomorrow (MYT)?
function isTomorrow(date) {
  var now      = nowMYT();
  var tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  var d = toMYT(date);
  return d.getUTCFullYear() === tomorrow.getUTCFullYear()
    && d.getUTCMonth()      === tomorrow.getUTCMonth()
    && d.getUTCDate()       === tomorrow.getUTCDate();
}

// Is the date today (MYT)?
function isToday(date) {
  var now = nowMYT();
  var d   = toMYT(date);
  return d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth()      === now.getUTCMonth()
    && d.getUTCDate()       === now.getUTCDate();
}

// Is current MYT time between 9am and 10am? (morning reminder window)
function isMorningWindow() {
  var now     = nowMYT();
  var hourMYT = now.getUTCHours(); // offset already applied
  return hourMYT >= 9 && hourMYT < 10;
}

// ─────────────────────────────────────────────
// MESSAGE TEMPLATES
// ─────────────────────────────────────────────

function msgFollowUp(name, jobName, orderNumber) {
  var job = jobName || 'your project';
  var ref = orderNumber ? ' (Booking #' + orderNumber + ')' : '';
  return 'Hi ' + (name || 'there') + ', just checking if you had a chance to review the quote for ' + job + ref + '. Happy to answer any questions or adjust the package — let us know if you\'d like to proceed.';
}

function msgCollectionReminder(name, jobName, collectionDate, orderNumber) {
  var ref = orderNumber ? ' (Booking #' + orderNumber + ')' : '';
  return 'Hi ' + (name || 'there') + ', a quick reminder that your gear collection for *' + (jobName || 'your shoot') + '*' + ref + ' is tomorrow — *' + formatDate(collectionDate) + '*.\n\nCollection hours are 10:30am to 5:00pm. Please ensure payment is settled before collection.\n\nCould you let us know who will be coming in to collect? We\'d like to have everything ready for them.';
}

function msgPICCheck(name, jobName) {
  return 'Also, who will be the person collecting the gear for *' + (jobName || 'this shoot') + '*? Just so we can make sure everything is prepared for them.';
}

function msgReturnReminder(name, jobName, returnDate, orderNumber) {
  var ref = orderNumber ? ' (Booking #' + orderNumber + ')' : '';
  return 'Good morning ' + (name || 'there') + '! Just a reminder that gear return for *' + (jobName || 'your shoot') + '*' + ref + ' is due today by *2:00pm*.\n\nReturn window: 10:30am — 2:00pm.\n\nPlease let us know if you need any assistance with the return.';
}

// ─────────────────────────────────────────────
// SCHEDULER CHECKS
// ─────────────────────────────────────────────

async function runSchedulerChecks() {
  var supabase = getSupabase();
  if (!supabase) {
    console.log('[Scheduler] Supabase not configured — skipping');
    return;
  }

  console.log('[Scheduler] Running checks at', new Date().toISOString());

  // Fetch all active sessions that have had a quote sent
  var { data: sessions, error } = await supabase
    .from('kino_sessions')
    .select('*')
    .not('quote_sent_at', 'is', null)
    .eq('handed_off', false);

  if (error) {
    console.error('[Scheduler] Fetch error:', error.message);
    return;
  }

  if (!sessions || sessions.length === 0) {
    console.log('[Scheduler] No active quoted sessions');
    return;
  }

  console.log('[Scheduler] Checking ' + sessions.length + ' quoted sessions');

  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    var waId    = session.wa_id;
    var form    = {};

    try { form = JSON.parse(session.form) || {}; } catch(e) {}

    var name        = (form.invoiceDetails && (form.invoiceDetails.name || form.invoiceDetails.contactPerson)) || 'there';
    var jobName     = form.jobName || null;
    var orderNumber = form.booqableOrderNumber || null;
    var pickupDate  = parseFormDate(form.prepPickupDate);
    var returnDate  = parseFormDate(form.returnDate || form.shootingDate);

    // Compute return date if not explicit (day after shoot)
    if (!returnDate && form.shootingDate) {
      returnDate = parseFormDate(form.shootingDate);
      if (returnDate) returnDate.setDate(returnDate.getDate() + 1);
    }

    try {

      // ── CHECK 1: 12-hour quote follow-up ──────────────────────────────
      if (!session.followed_up && session.quote_sent_at) {
        var quoteSentAt  = new Date(session.quote_sent_at);
        var hoursSinceSent = (Date.now() - quoteSentAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceSent >= 12 && hoursSinceSent < 36) {
          console.log('[Scheduler] Follow-up due for', waId, '(' + hoursSinceSent.toFixed(1) + 'h since quote)');
          await sendMessage(waId, msgFollowUp(name, jobName, orderNumber));
          await supabase.from('kino_sessions')
            .update({ followed_up: true, updated_at: new Date().toISOString() })
            .eq('wa_id', waId);
          console.log('[Scheduler] Follow-up sent to', waId);
        }
      }

      // ── CHECK 2: Pre-collection reminder + PIC (day before pickup) ────
      if (!session.collection_reminded && pickupDate && isTomorrow(pickupDate)) {
        console.log('[Scheduler] Collection reminder due for', waId);
        await sendMessage(waId, msgCollectionReminder(name, jobName, pickupDate, orderNumber));

        // PIC check only if not already confirmed
        if (!session.pic_confirmed) {
          await new Promise(function(r) { setTimeout(r, 2000); }); // 2s gap
          await sendMessage(waId, msgPICCheck(name, jobName));
        }

        await supabase.from('kino_sessions')
          .update({ collection_reminded: true, updated_at: new Date().toISOString() })
          .eq('wa_id', waId);
        console.log('[Scheduler] Collection reminder sent to', waId);
      }

      // ── CHECK 3: Return reminder (morning of return date) ─────────────
      if (!session.return_reminded && returnDate && isToday(returnDate) && isMorningWindow()) {
        console.log('[Scheduler] Return reminder due for', waId);
        await sendMessage(waId, msgReturnReminder(name, jobName, returnDate, orderNumber));
        await supabase.from('kino_sessions')
          .update({ return_reminded: true, updated_at: new Date().toISOString() })
          .eq('wa_id', waId);
        console.log('[Scheduler] Return reminder sent to', waId);
      }

    } catch(err) {
      console.error('[Scheduler] Error processing', waId, ':', err.message);
    }
  }

  console.log('[Scheduler] Checks complete');
}

// ─────────────────────────────────────────────
// START / STOP
// ─────────────────────────────────────────────

var schedulerTimer = null;

function startScheduler() {
  if (schedulerTimer) return;
  console.log('[Scheduler] Started — running every ' + (SCHEDULER_INTERVAL_MS / 60000) + ' minutes');

  // Run immediately on start, then on interval
  runSchedulerChecks().catch(function(e) {
    console.error('[Scheduler] Initial run error:', e.message);
  });

  schedulerTimer = setInterval(function() {
    runSchedulerChecks().catch(function(e) {
      console.error('[Scheduler] Interval run error:', e.message);
    });
  }, SCHEDULER_INTERVAL_MS);
}

function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[Scheduler] Stopped');
  }
}

module.exports = { startScheduler, stopScheduler, runSchedulerChecks };
