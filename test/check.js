/**
 * Starter compliance + journey monitor for the Adyen CHC checkout demo.
 *
 * This is the seed your eng team extends into the real automated monitor.
 * It does three things, all driven by ../spec.json:
 *
 *   1. CONTRACT  — navigate to the Tink consent screen and assert every
 *                  required element from spec.json.checks is present
 *                  (this is the core "is the consent screen compliant?" check).
 *   2. NEGATIVE  — load the same demo with ?broken=legal-disclosure and confirm
 *                  the monitor *catches* the missing disclosure (would alert).
 *   3. JOURNEY   — click through the full happy path (pick -> consent -> QR ->
 *                  phone approval -> order confirmation) to prove it completes.
 *
 *   node test/check.js                                   # against demoUrl in spec.json
 *   BASE_URL=http://localhost:8080 node test/check.js    # against a local copy
 *
 * Exit 0 = everything behaved as expected; exit 1 = something is off (use in CI).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spec.json'), 'utf8'));
const BASE_URL = (process.env.BASE_URL || spec.demoUrl || 'https://jjsmall452.github.io/adyen-chc-demo').replace(/\/$/, '');
const PAGE_URL = BASE_URL.endsWith('.html') ? BASE_URL : `${BASE_URL}/index.html`;

async function navigate(page, steps) {
  for (const s of steps) {
    if (s.action === 'expect') {
      await page.locator(s.selector).first().waitFor({ state: 'visible', timeout: 8000 });
    } else { // click (default)
      await page.locator(s.selector).first().click({ timeout: 8000 });
    }
  }
}

// Run the spec.json contract checks on whatever screen is currently shown.
async function runChecks(page) {
  const results = [];
  for (const c of spec.checks) {
    const loc = page.locator(c.selector).first();
    const count = await loc.count().catch(() => 0);
    let pass = count > 0;
    if (pass && c.assert === 'present_and_contains') {
      const txt = (await loc.innerText().catch(() => '')) || '';
      pass = txt.includes(c.expectedPhrase);
    }
    results.push({ id: c.id, required: c.required, pass });
  }
  const failedRequired = results.filter(r => r.required && !r.pass);
  return { results, compliant: failedRequired.length === 0, failedRequired };
}

function printChecks(label, url, { results, compliant, failedRequired }) {
  console.log(`\n● ${label}  (${url})`);
  console.log(`  verdict: ${compliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}`);
  for (const r of results) console.log(`    ${r.pass ? '✓' : '✗'} ${r.id}${r.required ? '' : ' (optional)'}`);
  if (failedRequired.length) {
    console.log(`    → monitor would alert + trigger disable/incident: [${failedRequired.map(r => r.id).join(', ')}]`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let ok = true;

  // 1. CONTRACT — consent screen on the live demo must be compliant.
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await navigate(page, spec.navigateToConsent);
  const contract = await runChecks(page);
  printChecks('contract (consent screen)', PAGE_URL, contract);
  ok = ok && contract.compliant;

  // 2. NEGATIVE — drop the legal disclosure; the monitor must catch it.
  const brokenUrl = `${PAGE_URL}?broken=legal-disclosure`;
  await page.goto(brokenUrl, { waitUntil: 'domcontentloaded' });
  await navigate(page, spec.navigateToConsent);
  const broken = await runChecks(page);
  printChecks('negative control (?broken=legal-disclosure)', brokenUrl, broken);
  const caughtBroken = !broken.compliant;
  console.log(`  expected NON-COMPLIANT → ${caughtBroken ? '✓ caught as expected' : '✗ MISSED — monitor failed'}`);
  ok = ok && caughtBroken;

  // 3. JOURNEY — full happy path must reach the order confirmation.
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  let journeyOk = true, failedStep = null;
  try {
    await navigate(page, spec.journey.steps);
  } catch (e) {
    journeyOk = false; failedStep = e.message.split('\n')[0];
  }
  console.log(`\n● journey (end-to-end)  (${PAGE_URL})`);
  console.log(`  ${journeyOk ? '✅ reached order confirmation' : '❌ FAILED: ' + failedStep}`);
  ok = ok && journeyOk;

  await browser.close();
  console.log(`\n${ok ? 'PASS' : 'FAIL'}: demo behaved as expected.`);
  process.exit(ok ? 0 : 1);
})();
