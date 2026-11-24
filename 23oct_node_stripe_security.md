# Node.js RCE notice from Stripe: assessment and actions (2026-10-23)

## What happened

On 2026-10-22 Stripe emailed Linneviken AB (`acct_1U3iGmATUnXLsMTc`, reference `FTV37SYWJ`). The email said Stripe's telemetry had seen API calls from a Node.js version affected by a critical remote code execution (RCE) bug. Because of that, the Stripe API keys may have been exposed.

**This is not evidence of a breach.** `stripe-node` sends the Node.js version with every API request. Stripe saw an unpatched version in our traffic and is warning us. The vulnerability is in Node.js, not in Stripe.

The email looks genuine. Every link goes to `docs.stripe.com` or `support.stripe.com`, it asks for no credentials, and the versions it lists match the official Node.js advisory. Still, open the Stripe Dashboard by typing its address, not by clicking links in the email.

## The vulnerability

Node.js security release, 2026-10-21: <https://nodejs.org/en/blog/vulnerability/october-2026-security-releases>

- **CVE-2026-111497 (High).** An out-of-bounds write in the Brotli decoder. An app that decompresses attacker-controlled Brotli data with `node:zlib` can crash, leak process memory or run attacker code. `fetch()` decompresses Brotli responses automatically, so any server we fetch from can deliver such data.
- The release fixes nine more bugs, including TLS hostname checks, DNS parsing and keep-alive response smuggling.
- **Affected:** 26.x, 24.x, 22.x and every end-of-life line. **Fixed:** 26.12.1, 24.22.1 and **22.23.4**. Node 20 and older will never get a fix.

## Where we were exposed

| Where | Before | Risk |
|---|---|---|
| Local Mac | Default Node v22.23.1; v20.19.5 also installed | `web/.env.local` holds a **live** secret key (`sk_live`), and `catalog:stripe` / `push-stripe-*.mjs` call Stripe from here. This is probably part of what Stripe saw. |
| Vercel `linnevik` (`prj_dmSQt1GMe2JdlBYEZHLAaAYDJFqk`) | `nodeVersion: 22.x`, last prod deploy built 2026-10-01 | Functions hold `STRIPE_SECRET_KEY`. The **price-watch cron** (`app/api/cron/price-watch` → `src/lib/priceWatch/scrape.ts`) `fetch()`es competitor sites every Monday. Those responses are untrusted, and Node decompresses them. That makes it the most realistic attack path on the server. |
| Aif worker (Antioch) | Runs on Cloudflare Workers (workerd, not Node) | Not affected, and it's a different Stripe account. Only the local Node scripts there matter. |

## Actions

### Done 2026-10-23
- [x] Installed Node **22.23.4** with nvm and made it the default. Reinstalled the global CLIs on it (`vercel`, `neonctl`, `skills`, `pnpm`).
- [x] Uninstalled Node 20.19.5 (end of life, will never be patched).
- [x] Redeployed production on Vercel, 14:57 UTC: `linnevik-asruoxgae-gabrielgabros-projects.vercel.app`, aliased to www.linnevik.se, site returns 200. **Exact Node patch version not confirmed:** the build log doesn't print it, and Vercel only promises "latest 22.x".

### To do
- [ ] **Confirm Vercel's Node patch version** is ≥ 22.23.4. Ask Vercel support, or watch for a changelog entry. If it's still lower, switch the project to 24.x once Vercel serves 24.22.1 (`engines` in `web/package.json` currently caps at `<23`).
- [ ] **Remove Node v22.23.1** once nothing needs it: `nvm uninstall 22.23.1`. Open terminals still have it on their PATH until restarted.
- [ ] **Review Stripe activity** (<https://docs.stripe.com/development/dashboard/request-logs>). Look for requests from IPs that aren't Vercel or home, unexpected refunds, payouts or customer exports, changed bank details or payout schedule, new webhook endpoints, and new team members.
- [ ] **Roll the live secret key**, even if nothing looks wrong (<https://docs.stripe.com/keys#rolling-keys>). Update `STRIPE_SECRET_KEY` in the Vercel env vars (Production) and in `web/.env.local`, then redeploy. Rolling API keys doesn't affect `STRIPE_WEBHOOK_SECRET`.
- [ ] **Narrow the keys:** give the catalog scripts a restricted key (`rk_live_…`, Products/Prices write only) so the full `sk_live` no longer has to live on the laptop.
- [ ] Optional: look for other signs of compromise. Check Vercel runtime logs for unusual errors or crashes around price-watch runs, and look for unknown Vercel env changes and deployments.

## Hardening afterwards
- Pin a patched Node version in `web/.nvmrc` so local runs match production.
- Subscribe to Node.js security announcements: <https://nodejs.org/en/blog/vulnerability>
- Stripe key best practices: <https://support.stripe.com/questions/protecting-against-compromised-api-keys>
