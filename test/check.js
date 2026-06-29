/**
 * Starter compliance + journey monitor for the Adyen CHC checkout demo.
 *
 * This is the seed your eng team extends into the real automated monitor.
 * For BOTH the desktop (index.html) and mobile (mobile.html) demos it:
 *
 *   1. CONTRACT  — navigate to the consent screen and assert every required
 *                  element from spec.json.checks (the core "is the consent
 *                  screen compliant?" check). Same contract for both.
 *   2. NEGATIVE  — load with ?broken=legal-disclosure and confirm the monitor
 *                  *catches* the missing disclosure (would alert).
 *   3. JOURNEY   — click the full happy path and confirm it reaches the order
 *                  confirmation (desktop: QR + phone mock; mobile: app-to-app).
 *
 *   node test/check.js                                   # against demoUrl in spec.json
 *   BASE_URL=http://localhost:8080 node test/check.js    # against a local copy
 *   BASE_URL=file:///abs/path/to/repo node test/check.js # against local files
 *
 * Exit 0 = everything behaved as expected; exit 1 = something is off (use in CI).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'spec.json'), 'utf8'));
const BASE = (process.env.BASE_URL || spec.demoUrl || 'https://jjsmall452.github.io/adyen-chc-demo').replace(/\/$/, '');
// BASE may point straight at a file (…/index.html) or at a directory.
const isFile = BASE.endsWith('.html');
const dir = isFile ? BASE.replace(/\/[^/]+$/, '') : BASE;
const pageUrl = p => `${dir}/${p}`;

const TARGETS = [
  { label: 'desktop', page: 'index.html',  nav: spec.navigateToConsent,        journey: spec.journey.steps },
  { label: 'mobile',  page: 'mobile.html', nav: spec.mobile.navigateToConsent, journey: spec.mobile.journey.steps },
];

async function navigate(page, steps) {
  for (const s of steps) {
    if (s.action === 'expect') {
      await page.locator(s.selector).first().waitFor({ state: 'visible', timeout: 8000 });
    } else {
      await page.locator(s.selector).first().click({ timeout: 8000 });
    }
  }
}

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
  if (failedRequired.length) console.log(`    → monitor would alert + trigger disable/incident: [${failedRequired.map(r => r.id).join(', ')}]`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  let ok = true;

  for (const t of TARGETS) {
    const url = pageUrl(t.page);
    console.log(`\n──────── ${t.label.toUpperCase()} (${t.page}) ────────`);
    const page = await browser.newPage();

    // 1. CONTRACT
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await navigate(page, t.nav);
    const contract = await runChecks(page);
    printChecks(`${t.label} contract`, url, contract);
    ok = ok && contract.compliant;

    // 2. NEGATIVE control
    const brokenUrl = `${url}?broken=legal-disclosure`;
    await page.goto(brokenUrl, { waitUntil: 'domcontentloaded' });
    await navigate(page, t.nav);
    const broken = await runChecks(page);
    printChecks(`${t.label} negative control`, brokenUrl, broken);
    const caught = !broken.compliant;
    console.log(`  expected NON-COMPLIANT → ${caught ? '✓ caught as expected' : '✗ MISSED — monitor failed'}`);
    ok = ok && caught;

    // 3. JOURNEY
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    let journeyOk = true, failedStep = null;
    try { await navigate(page, t.journey); }
    catch (e) { journeyOk = false; failedStep = e.message.split('\n')[0]; }
    console.log(`\n● ${t.label} journey (end-to-end)  (${url})`);
    console.log(`  ${journeyOk ? '✅ reached order confirmation' : '❌ FAILED: ' + failedStep}`);
    ok = ok && journeyOk;

    await page.close();
  }

  await browser.close();
  console.log(`\n${ok ? 'PASS' : 'FAIL'}: demos behaved as expected.`);
  process.exit(ok ? 0 : 1);
})();
