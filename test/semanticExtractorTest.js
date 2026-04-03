// test/semanticExtractorTest.js
// Tests the Claude Haiku semantic extractor against real-world customer messages.
// Run: node test/semanticExtractorTest.js
// Requires ANTHROPIC_API_KEY in .env

require('dotenv').config();
const { extractFormFields, mapToFormUpdate } = require('../utils/semanticExtractor');
const { extractAndUpdateForm } = require('../utils/formExtractor');
const { updateForm, getForm, getMissingFields, formatFormSummary } = require('../utils/sessionStore');

// ─────────────────────────────────────────────────────────────
// TEST CASES — Real-world messy customer messages
// Each case has the message, optional context, and expected fields
// ─────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    label: '🎬 Shoots dates + gear in one message (EN)',
    message: "I want to rent the Alexa 35 with Signature Primes for a 3-day TVC shoot starting 20 February.",
    context: [],
    expectFields: ['shootingDate', 'equipmentList'],
  },
  {
    label: '📦 Package + job name (EN)',
    message: "We need the Commercial Pro package for a Maxis campaign. Shoot is on the 5th and 6th of March.",
    context: [],
    expectFields: ['equipmentList', 'jobName', 'shootingDate'],
  },
  {
    label: '🧾 Company invoice details (EN)',
    message: "Invoice under our company: LIGHTWAVE STUDIO SDN BHD, SSM 202201034567, contact is Faridah, billing@lightwave.com.my",
    context: [],
    expectFields: ['invoiceType', 'invoiceDetails'],
  },
  {
    label: '🧾 Individual invoice (BM)',
    message: "Atas nama saya sendiri. Nama: Hafizuddin bin Rosli. Email hafiz@gmail.com.",
    context: [],
    expectFields: ['invoiceType', 'invoiceDetails'],
  },
  {
    label: '📅 Pick-up date stated naturally (BM)',
    message: "Nak ambil pada 14 April, shoot 15 dan 16 April.",
    context: [],
    expectFields: ['prepPickupDate', 'shootingDate'],
  },
  {
    label: '🎯 Job name buried in casual message (EN)',
    message: "Hey, we're shooting the new Shopee 12.12 campaign. Need a RED V-Raptor and some cinema lenses.",
    context: [],
    expectFields: ['jobName', 'equipmentList'],
  },
  {
    label: '🌐 Code-switching — mixed EN/BM',
    message: "Shoot kami pada 3 hingga 5 Mei. Job name: Telekom Malaysia Brand Film. Invoice syarikat.",
    context: [],
    expectFields: ['shootingDate', 'jobName', 'invoiceType'],
  },
  {
    label: '📋 Full form in one shot — power user',
    message: `Pick up 19 Jun, shoot 20-22 Jun. Job: Petronas Hari Raya 2025. 
Need ARRI Alexa Mini LF + ZERO Optik Leica-R lenses + Sachtler tripod. 
Company invoice: STARFORGE FILMS SDN BHD, SSM 202001012345, TIN C9876543210123, 
registered at No 8 Jalan Semarak, 50450 KL. Email accounts@starforge.com, contact Zulaikha.`,
    context: [],
    expectFields: ['prepPickupDate', 'shootingDate', 'jobName', 'equipmentList', 'invoiceType', 'invoiceDetails'],
  },
  {
    label: '🔇 No form data — just gear question',
    message: "What's the difference between the Atlas Orion and the Atlas Mercury?",
    context: [],
    expectFields: [],
  },
  {
    label: '📅 Relative date (context needed)',
    message: "Can we pick up next Monday?",
    context: [
      { role: 'user',      content: 'Hi I need to rent gear for a short film' },
      { role: 'assistant', content: 'Hi! Tell me about your shoot — what dates are you looking at?' },
    ],
    expectFields: ['prepPickupDate'],
  },
];

// ─────────────────────────────────────────────────────────────
// PARALLEL EXTRACTION + FORM FILL INTEGRATION TEST
// Tests the full pipeline: semantic extract → mapToFormUpdate → updateForm → formatSummary
// ─────────────────────────────────────────────────────────────

async function testFullPipeline() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔗 INTEGRATION TEST — Full form fill pipeline');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const waId = 'integration_test_001';

  const conversation = [
    "Hi, we're doing a TVC for Grab Malaysia next month.",
    "Shoot dates are 10 and 11 April. Pick up on the 9th.",
    "We need the Commercial Pro package — RED V-Raptor with Contax Zeiss lenses.",
    "Invoice under our company: CRIMSON WAVE PRODUCTIONS SDN BHD. SSM: 202101056789. TIN: C2345678901234. Email: ops@crimsonwave.com. Contact: Izzatul.",
    "Address is Level 3, Menara KEN, Jalan Burhanuddin Helmi, TTDI, 60000 KL.",
  ];

  for (let i = 0; i < conversation.length; i++) {
    const msg = conversation[i];
    const history = []; // simplified — no history for this test

    // Run both extractors as they would in production
    const [semanticResult] = await Promise.all([
      extractFormFields(msg, history),
    ]);
    extractAndUpdateForm(waId, msg);

    if (semanticResult) {
      const formUpdate = mapToFormUpdate(semanticResult);
      if (formUpdate) updateForm(waId, formUpdate);
    }

    const missing = getMissingFields(waId);
    console.log(`\nTurn ${i + 1}: "${msg.substring(0, 70)}..."`);
    console.log(`  Missing fields: [${missing.join(', ') || 'none — COMPLETE'}]`);
  }

  console.log('\n' + formatFormSummary(waId));
}

// ─────────────────────────────────────────────────────────────
// UNIT TESTS — Individual message extraction
// ─────────────────────────────────────────────────────────────

async function runUnitTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 UNIT TESTS — Semantic field extraction');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let passed = 0;
  let total  = TEST_CASES.length;

  for (const tc of TEST_CASES) {
    process.stdout.write(`\n${tc.label}\n  Message: "${tc.message.substring(0, 80)}..."\n`);

    const extracted = await extractFormFields(tc.message, tc.context);
    const mapped    = extracted ? mapToFormUpdate(extracted) : null;

    if (tc.expectFields.length === 0) {
      // Expect nothing extracted
      const gotNothing = !mapped || Object.keys(mapped).length === 0;
      console.log(`  Extracted: ${JSON.stringify(mapped || {})}`);
      console.log(`  ${gotNothing ? '✅ Correctly extracted nothing' : '⚠️  Unexpected fields extracted'}`);
      if (gotNothing) passed++;
    } else {
      // Check expected fields are present
      const extractedFields = mapped ? Object.keys(mapped) : [];
      const allPresent = tc.expectFields.every(f => extractedFields.includes(f));
      console.log(`  Expected : [${tc.expectFields.join(', ')}]`);
      console.log(`  Got      : [${extractedFields.join(', ')}]`);
      if (mapped?.invoiceDetails) {
        console.log(`  Invoice  : ${JSON.stringify(mapped.invoiceDetails)}`);
      }
      console.log(`  ${allPresent ? '✅ Pass' : '⚠️  Partial — check output above'}`);
      if (allPresent) passed++;
    }

    // Small pause between calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Result: ${passed}/${total} tests passed`);
  return passed === total;
}

// ─────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  const mode = process.argv[2];

  if (mode === '--integration') {
    await testFullPipeline();
  } else if (mode === '--unit') {
    await runUnitTests();
  } else {
    // Default: run both
    const unitsPassed = await runUnitTests();
    await testFullPipeline();
    if (!unitsPassed) {
      console.log('\n⚠️  Some unit tests were partial — review output above.');
      console.log('Partial results are normal for relative dates and ambiguous messages.');
    }
  }
}

main().catch(console.error);
