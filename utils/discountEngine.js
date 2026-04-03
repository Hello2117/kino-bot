// utils/discountEngine.js
// All pricing rules for KINO quote generation.

const SST_RATE = 0.06;
const VOLUME_DISCOUNT_THRESHOLD = 5000;
const VOLUME_DISCOUNT_RATE = 0.10;

/**
 * Apply multi-day rental discount.
 * Rule: 1-28 days → charge 3-day rate
 *       35+ days  → charge 2-day rate
 *       29-34 days → standard (flag for team review)
 *
 * @param {number} dailyRate - Rate per day for the item
 * @param {number} numberOfDays - Number of shoot days
 * @returns {{ chargeableDays: number, total: number, discountNote: string }}
 */
function applyMultiDayDiscount(dailyRate, numberOfDays) {
  let chargeableDays;
  let discountNote;

  if (numberOfDays >= 1 && numberOfDays <= 28) {
    chargeableDays = 3;
    discountNote = `Multi-day rate applied: ${numberOfDays} shoot day(s) charged at 3-day rate`;
  } else if (numberOfDays >= 35) {
    chargeableDays = 2;
    discountNote = `Long-term rate applied: ${numberOfDays} shoot day(s) charged at 2-day rate`;
  } else {
    // 29-34 days: grey zone — charge standard, flag for team
    chargeableDays = numberOfDays;
    discountNote = `Standard rate (${numberOfDays} days). Team to confirm if long-term rate applies.`;
  }

  return {
    chargeableDays,
    total: dailyRate * chargeableDays,
    discountNote,
  };
}

/**
 * Apply automatic 10% volume discount for orders >= RM5,000 (before SST).
 *
 * @param {number} subtotal - Total before SST
 * @returns {{ discountApplied: boolean, discountAmount: number, discountedSubtotal: number, note: string }}
 */
function applyVolumeDiscount(subtotal) {
  if (subtotal >= VOLUME_DISCOUNT_THRESHOLD) {
    const discountAmount = subtotal * VOLUME_DISCOUNT_RATE;
    return {
      discountApplied: true,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      discountedSubtotal: parseFloat((subtotal - discountAmount).toFixed(2)),
      note: `Automatic 10% discount applied (order total ≥ RM${VOLUME_DISCOUNT_THRESHOLD})`,
    };
  }
  return {
    discountApplied: false,
    discountAmount: 0,
    discountedSubtotal: subtotal,
    note: '',
  };
}

/**
 * Apply 6% SST to a given amount.
 *
 * @param {number} amount - Pre-SST amount
 * @returns {{ sst: number, totalWithSST: number }}
 */
function applySST(amount) {
  const sst = parseFloat((amount * SST_RATE).toFixed(2));
  return {
    sst,
    totalWithSST: parseFloat((amount + sst).toFixed(2)),
  };
}

/**
 * Full quote summary — applies all rules in sequence.
 * Use this to build the quote breakdown to present to customer.
 *
 * @param {number} dailyRate
 * @param {number} numberOfDays
 * @returns {object} Full breakdown
 */
function buildQuoteSummary(dailyRate, numberOfDays) {
  const multiDay = applyMultiDayDiscount(dailyRate, numberOfDays);
  const volume = applyVolumeDiscount(multiDay.total);
  const withSST = applySST(volume.discountedSubtotal);

  return {
    dailyRate,
    numberOfDays,
    chargeableDays: multiDay.chargeableDays,
    subtotal: multiDay.total,
    multiDayNote: multiDay.discountNote,
    volumeDiscountApplied: volume.discountApplied,
    volumeDiscountAmount: volume.discountAmount,
    volumeDiscountNote: volume.note,
    subtotalAfterDiscount: volume.discountedSubtotal,
    sst: withSST.sst,
    grandTotal: withSST.totalWithSST,
    paymentNote: withSST.totalWithSST >= 3000
      ? 'Eligible for 50/50 split payment: 50% before collection, 50% on collection.'
      : 'Full payment required before gear collection.',
  };
}

module.exports = {
  applyMultiDayDiscount,
  applyVolumeDiscount,
  applySST,
  buildQuoteSummary,
};
