# Adyen CHC Trial — bol.com "Pay by bank" checkout demo

A self-contained, synthetic **bol.com** checkout that shows what the experience could look like with the new **Pay by bank** method carrying Tink's **Customer Hosted Consent (CHC)** screen. Built for the Adyen trial. It doubles as the target for the eng team's planned **automated compliance monitoring**.

> ⚠️ Synthetic demo. Not a real bol.com, Tink, or Adyen page. No real payments, banks, or data.

**Live demo:** https://jjsmall452.github.io/adyen-chc-demo/

## The journey (desktop)

1. **bol.com checkout** — choose **Pay by bank** (the new method, shown alongside *iDEAL | Wero* and *Card*), then pick your bank. Because this is *customer-hosted* consent, the consent disclosure appears **inline on the bol.com checkout itself**: registered legal disclosure, Terms of Service / Privacy Notice / "Learn how your data is used" links, amount, beneficiary, reference, and source account. Then press **Betalen**.
2. **Tink Link / QR hand-off** — a QR to "scan with your banking app", with a **phone mock** beside it that plays out the mobile journey (bank login → approve → pay). Modelled on the real desktop → mobile hand-off.
3. **Order confirmation** — redirected back to the bol.com confirmation screen.

The UI is matched to a recording of the real bol.com iDEAL | Wero checkout (white header, pale-yellow notice, lavender section cards, "Overzicht" sidebar).

## For the eng team: automated monitoring

Everything testable hangs off stable `data-test` selectors, and the contract lives in [`spec.json`](spec.json) — one source of truth for humans and the monitor.

[`test/check.js`](test/check.js) is the starter monitor. It:

1. **Contract** — navigates to the consent screen and asserts every required element in `spec.json.checks` (the core "is this screen compliant?" check).
2. **Negative control** — reloads with `?broken=legal-disclosure` and confirms the monitor *catches* the missing disclosure (proves it would alert).
3. **Journey** — clicks the full happy path and confirms it reaches the order confirmation.

### Run it

```bash
npm install
npx playwright install chromium

# against the live GitHub Pages demo
npm test

# against a local copy
npm run serve            # serves on http://localhost:8080 (separate terminal)
BASE_URL=http://localhost:8080 npm test
```

Exit code `0` = everything behaved as expected; `1` = something is off (wire straight into CI).

### Demonstrating a non-compliant screen

Append `?broken=<data-test>` to drop a required element, e.g.
`.../index.html?broken=legal-disclosure`, `?broken=tos-link`, `?broken=decline`.
The monitor flags it as non-compliant — this is how you show the monitoring catching a regression.

### Extending toward production

In production the monitor reaches the **real** consent screen (via allowlisted egress and a stable merchant-provided path) and runs the same `spec.json` checks — only the URL and the navigation to reach the screen change. A scheduled GitHub Actions run is a natural next step (see the `consent-compliance-fixtures` repo's `.github/workflows/compliance-check.yml` for a copy-ready template).

## Files

| Path | What it is |
|------|------------|
| `index.html` | The whole demo — self-contained HTML/CSS/JS, no build step |
| `spec.json` | Compliance + journey contract (v3) |
| `test/check.js` | Starter Playwright monitor |
| `package.json` | `npm test` + a tiny static `npm run serve` |
