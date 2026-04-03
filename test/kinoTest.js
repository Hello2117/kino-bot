// test/kinoTest.js
// Local conversation simulator — test KINO without WhatsApp or WATI.
// Run: node test/kinoTest.js
// Requires ANTHROPIC_API_KEY in .env

require('dotenv').config();
const readline = require('readline');
const { askKino } = require('../handlers/claudeHandler');
const { getSession, addMessage } = require('../utils/sessionStore');
const { buildQuoteSummary } = require('../utils/discountEngine');

const TEST_WA_ID = 'test_user_001';

// ─────────────────────────────────────────────────────────────
// AUTOMATED SCENARIO TESTS
// ─────────────────────────────────────────────────────────────

const scenarios = [
  {
    name: '🎯 The Pro — lens enquiry',
    messages: [
      'Hi, I need the ARRI Signature Primes for an Alexa 35 shoot, 3 days next week.',
    ],
  },
  {
    name: '🤔 The Lost One — clueless customer',
    messages: [
      'Hi, I need to rent a camera.',
      'Just for a short video lah. Nothing big.',
      'Not sure, maybe 2 days?',
      'Around RM1000?',
    ],
  },
  {
    name: '💰 Budget-First — RM500 budget',
    messages: [
      'Hi, my budget is RM500 for 2 days. What can I get?',
    ],
  },
  {
    name: '📋 Procedure Guy — payment question',
    messages: [
      'Hi, macam mana nak sewa? Kena bayar deposit dulu ke?',
    ],
  },
  {
    name: '📦 Package enquiry — Commercial Pro',
    messages: [
      'Do you have any packages for a TVC shoot? 2 day shoot, serious production.',
    ],
  },
  {
    name: '🌙 Bilingual — BM customer',
    messages: [
      'Hai bro, korang ada package untuk MV tak? Budget dalam RM3000.',
    ],
  },
  {
    name: '💸 Volume discount trigger',
    messages: [
      'I want to rent the Signature Series package for 5 days. Does any discount apply?',
    ],
  },
  {
    name: '🚚 Delivery enquiry',
    messages: [
      'Do you deliver to Petaling Jaya? How much is delivery?',
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// DISCOUNT ENGINE UNIT TESTS
// ─────────────────────────────────────────────────────────────

function runDiscountTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 DISCOUNT ENGINE TESTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const cases = [
    { label: 'Creator Ready × 1 day',  rate: 1500, days: 1,  expectedDays: 3 },
    { label: 'Creator Ready × 3 days', rate: 1500, days: 3,  expectedDays: 3 },
    { label: 'Comm Pro × 14 days',     rate: 3000, days: 14, expectedDays: 3 },
    { label: 'Sig Series × 35 days',   rate: 4500, days: 35, expectedDays: 2 },
    { label: 'Volume discount (>5k)',   rate: 1700, days: 3,  expectedDays: 3 },
  ];

  let passed = 0;
  cases.forEach(c => {
    const result = buildQuoteSummary(c.rate, c.days);
    const ok = result.chargeableDays === c.expectedDays;
    const volOk = c.label.includes('Volume')
      ? result.volumeDiscountApplied === true
      : true;
    const status = ok && volOk ? '✅' : '❌';
    if (ok && volOk) passed++;
    console.log(`${status} ${c.label}`);
    console.log(`   Chargeable: ${result.chargeableDays} days | Subtotal: RM${result.subtotal} | Discount: RM${result.volumeDiscountAmount} | Grand total (incl SST): RM${result.grandTotal}`);
    console.log(`   Payment: ${result.paymentNote}`);
  });

  console.log(`\n${passed}/${cases.length} discount tests passed\n`);
}

// ─────────────────────────────────────────────────────────────
// SCENARIO RUNNER — calls Claude for each test
// ─────────────────────────────────────────────────────────────

async function runScenario(scenario, index) {
  const waId = `test_${index}`;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🧪 SCENARIO: ${scenario.name}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const message of scenario.messages) {
    const history = getSession(waId);
    console.log(`\n👤 Customer: "${message}"`);

    const { reply, handoffTriggered } = await askKino(history, message);
    addMessage(waId, 'user', message);
    addMessage(waId, 'assistant', reply);

    console.log(`🤖 KINO: "${reply}"`);
    if (handoffTriggered) console.log('⚡ [HANDOFF TRIGGERED]');

    // Small pause between turns to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
}

// ─────────────────────────────────────────────────────────────
// INTERACTIVE MODE — chat with KINO in terminal
// ─────────────────────────────────────────────────────────────

async function interactiveMode() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 INTERACTIVE MODE — Chat with KINO');
  console.log('Type your message and press Enter.');
  console.log('Type "exit" to quit. Type "reset" to clear session.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question('You: ', async (input) => {
      const text = input.trim();
      if (text.toLowerCase() === 'exit') { rl.close(); return; }
      if (text.toLowerCase() === 'reset') {
        require('../utils/sessionStore').clearSession(TEST_WA_ID);
        console.log('🔄 Session cleared.\n');
        return ask();
      }
      if (!text) return ask();

      const history = getSession(TEST_WA_ID);
      const { reply, handoffTriggered } = await askKino(history, text);
      addMessage(TEST_WA_ID, 'user', text);
      addMessage(TEST_WA_ID, 'assistant', reply);

      console.log(`\nKINO: ${reply}`);
      if (handoffTriggered) console.log('⚡ [Handoff would be triggered here]\n');
      else console.log();

      ask();
    });
  };

  ask();
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2];

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  // Run discount unit tests always
  runDiscountTests();

  if (mode === '--interactive' || mode === '-i') {
    await interactiveMode();
    return;
  }

  if (mode === '--scenario') {
    const idx = parseInt(process.argv[3] || '0');
    if (scenarios[idx]) {
      await runScenario(scenarios[idx], idx);
    } else {
      console.log(`Available scenarios (0-${scenarios.length - 1}):`);
      scenarios.forEach((s, i) => console.log(`  ${i}: ${s.name}`));
    }
    return;
  }

  // Default: run all scenarios
  console.log('\n🎬 Running all KINO conversation scenarios...\n');
  for (let i = 0; i < scenarios.length; i++) {
    await runScenario(scenarios[i], i);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All scenarios complete.');
  console.log('Run with -i for interactive chat mode.');
  console.log('Run with --scenario N to test one scenario.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
