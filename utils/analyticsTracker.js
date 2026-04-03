// utils/analyticsTracker.js
// In-memory counters for KINO activity.
// Resets on server restart. For persistent stats, wire into a DB.

const stats = {
  totalMessages: 0,
  quotesGenerated: 0,
  handoffs: 0,
  uniqueCustomers: new Set(),
  startTime: Date.now(),
};

function trackMessage(waId) {
  stats.totalMessages++;
  stats.uniqueCustomers.add(waId);
}

function trackQuote() {
  stats.quotesGenerated++;
}

function trackHandoff() {
  stats.handoffs++;
}

function getStats(activeSessions) {
  return {
    totalMessages:    stats.totalMessages,
    quotesGenerated:  stats.quotesGenerated,
    handoffs:         stats.handoffs,
    uniqueCustomers:  stats.uniqueCustomers.size,
    activeSessions:   activeSessions,
    uptimeHours:      ((Date.now() - stats.startTime) / 3600000).toFixed(1),
  };
}

function resetDailyCounters() {
  stats.totalMessages   = 0;
  stats.quotesGenerated = 0;
  stats.handoffs        = 0;
  stats.uniqueCustomers = new Set();
}

module.exports = { trackMessage, trackQuote, trackHandoff, getStats, resetDailyCounters };
