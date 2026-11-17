# Operations Playbook: Day-One Execution & Compliance

_Built from `founder/idea.md`, `founder/offer.md`, `founder/numbers.json`, `founder/cfo-sources.md`, and live repo constraints (`server.ts`, `src/index.css`, `trullas-master-plan-v3`)._

---

## 1. Daily Operating Cycle (Eastern Time / NYSE Calendar)

1. **17:30 ET — Tier-1 EOD Batch** `[INTERNAL -> CUSTOMER-VISIBLE AT 17:45 ET]`: Worker pulls closed daily/weekly bars for all 503 S&P 500 + NDX-100 symbols via licensed feed, updates Weinstein Stages, Mansfield RS, breadth, Regime Score, SEC Form 4 clusters, `SignalOutcome` (`X1`/`X2`/`X3`), and archives/refreshes tomorrow's 15-name ranked watchlist.
2. **18:00 ET — EOD Ledger Snapshot & Health Check** `[INTERNAL]`: Verify 0 rate-limit errors, check `dataQuality !== 'estimated'` for all signal rows, and publish daily X/preview Regime recap.
3. **08:00 ET — Pre-Market Readiness Check** `[INTERNAL]`: Inspect worker heartbeat, verify Tiingo/CBOE VIX/EDGAR feeds are green, check NYSE holiday/half-day calendar (`isNyseMarketOpen`), and verify zero stale prices.
4. **08:30 ET — Pre-Market Watchlist Refresh & Telegram Brief** `[CUSTOMER-VISIBLE]`: Re-check overnight gaps/earnings flags; push 10-minute Swing Prep shortlist to web `Today` view and Telegram Pro subscribers.
5. **09:30–16:00 ET — Tier-2 Watchlist & Alert Monitoring** `[CUSTOMER-VISIBLE]`: Poll **only** active watchlist + tracked symbols (`<= 60` tickers every 5 min) on Fly.io worker; evaluate `canTrade()` fail-closed gate; dispatch high-conviction divergence/invalidation webhooks; answer priority support tickets (`< 4h` SLA).
6. **16:15 ET — Market Close Support, Onboarding & Billing Triage** `[CUSTOMER-VISIBLE]`: Respond to CSV import help requests, check Stripe webhooks / 1-click refund events, and review any trial-to-paid drop-offs.

---

## 2. Infrastructure & Market-Data Suppliers (Matched to `founder/numbers.json`)

| Line Item | Primary Vendor | Backup / Upgrade Vendor | Published Price & Terms | Cost in `numbers.json` |
| --- | --- | --- | --- | --- |
| **Commercial US Equities Data API** *(replaces unofficial Yahoo)* | **Tiingo Startup Redistribution** ([tiingo.com](https://www.tiingo.com/about/pricing)) | **Twelve Data Venture** (`$499/mo`, [twelvedata.com](https://twelvedata.com/pricing)) or **Massive/Polygon Business** (`$2,499/mo`, [massive.com](https://massive.com/pricing)) | Tiingo Startup external display starts at **`$250/mo`** (monthly contract; EOD + 24×5 derived consolidated feed). Request written startup quote before committing. | **`$250.00/mo`** *(matched)* |
| **Backtest Historical Point-in-Time Audit** | **Databento Usage-Based** ([databento.com](https://databento.com/pricing)) | **Nasdaq Data Link EOD** (trial / custom quote) | Metered per GB with **$0 base monthly fee** for historical pulls (`Spike E` / `Spike R` one-off check inside `$350` startup budget). | Inside **`$350`** startup *(matched)* |
| **Database, Auth & pg_cron** | **Supabase Pro** ([supabase.com/pricing](https://supabase.com/pricing)) | Neon Postgres (`$19+/mo`) | **`$25.00/mo`** (includes 100k MAUs, 8 GB DB, 250 GB egress; `$0.00325/extra MAU`). Instant signup, monthly billing. | **`$25.00/mo`** + `$0.20` metering *(matched)* |
| **Always-On Worker & Web Host** | **Fly.io** ([fly.io/pricing](https://fly.io/pricing)) | **Google Cloud Run** (`$0–$25/mo`, [cloud.google.com/run](https://cloud.google.com/run/pricing)) | **`$6.70/mo`** (`1x` 1GB RAM VM) + volume/IPv4/backup headroom = **`~$18/mo`**, billed monthly per second. | **`$18.00/mo`** *(matched)* |
| **Card Billing & Tax** | **Stripe Billing + Tax** ([stripe.com/pricing](https://stripe.com/pricing)) | Lemon Squeezy (Merchant of Record, `5% + $0.50`) | **`2.9% + $0.30`** domestic US (`$1.43` at `$39`); `+1.5%` international cards; **$0/mo base**; Stripe Tax `0.5%` per taxed transaction beyond free thresholds. | **`$1.43/sub-mo`** *(matched)* |
| **Transactional Email** | **Resend** ([resend.com/pricing](https://resend.com/pricing)) | Postmark (`$15/mo` for 10k emails) | `$0/mo` up to 3,000 emails (`$20/mo` Pro for 50k emails). | **`$20.00/mo`** w/ DNS & monitoring *(matched)* |

_Reconciliation check (`founder/numbers.json`)_: All published vendor benchmarks align with `founder/numbers.json`; only exact Tiingo startup redistribution written confirmation (`$250/mo`) and LLC/insurance quotes remain open quotes to finalize before launch spend.

---

## 3. People & Weekly Rota

| Phase | Owner | Weekly Hours & Focus | Support SLA |
| --- | --- | --- | --- |
| **Slow Launch Month (15–30 subs)** | Solo Technical Founder | **~18 hrs/wk**: Mon–Fri 08:00–08:45 ET health/brief check (`3.75h`), daily 16:15–17:00 ET support + X post (`3.75h`), Wed content/audit (`3h`), Sun EOD/shadow attribution review (`2.5h`), Dev/Bug polish (`5h`). | Under 4 business hours |
| **Steady Plan (150 subs)** | Founder + Fractional Part-Time Ops/Support (`$400–$600/mo` variable later; currently founder-covered in Profit) | **~25 hrs/wk** founder product/content + automated self-serve CSV import, in-app FAQ, and 1-click billing portal handling 90%+ of tickets. | Under 4 business hours |

_Note on payroll & owner compensation: `founder/numbers.json` omits a founder market salary (solo bootstrapper takes distributions from operating profit after break-even). Payroll taxes and owner draw structure vary by jurisdiction—have an accountant confirm entity & tax treatment before paying yourself._

---

## 4. Five One-Page Operating SOPs

### SOP 1: Daily Pre-Market Opening (08:00–08:35 ET)
1. Open Ops `/system-health` dashboard at 08:00 ET; confirm worker `lastHeartbeat < 10 min`, `rateLimitHitsCount === 0`, and `dataQuality === 'live'` (never `'estimated'`).
2. Verify NYSE Session Calendar (`America/New_York`) correctly flags regular open vs holiday vs 13:00 ET early close.
3. Spot-check Top 5 Stage-2 Divergence watchlist rows: confirm `entryZone`, `stop` (`<= 3×ATR`), `TP1`, and `SEC Form 4` badges loaded cleanly.
4. At 08:30 ET, confirm automated Telegram Pre-Market Brief delivered cleanly to the broadcast test channel.
5. If Tiingo upstream fails, keep `dataQuality = 'cached'`, display amber warning banner, pause intraday triggers (`canTrade()` fail-closed), and post status note inside app header.

### SOP 2: Core Fulfilment (14-Day Preview -> Paid Subscription -> Daily Usage)
1. Visitor clicks **"Inspect 60-Day Shadow Ledger Free (No Card)"** -> instant read-only/paper workspace scoped to their email.
2. Onboarding modal prompts 1-click **Broker/TradingView CSV import** + optional **Telegram Bot link** (`<= 3 min`).
3. On upgrade (`$29` Nightly / `$39` Swing Pro / Founding `$29 × 3m`), Stripe Checkout fires webhook -> Supabase updates `tier` claim immediately (`< 5s`).
4. Send plain receipt email with next billing date and direct link to **Settings -> Billing -> Cancel / 30-Day Refund**.
5. Weekly automated Sunday digest emails each user their own Journal `R-expectancy` + `Shadow Taken vs. Skipped` attribution summary.

### SOP 3: Complaint & 1-Click 30-Day Refund Handling
1. Any subscriber within 30 days of first payment can click **"Request 30-Day Refund"** in Settings -> Billing; Stripe API issues full refund automatically + sets subscription `cancel_at_period_end: false`.
2. Automated plain email sends within 5 minutes confirming refund ID + asking one optional multiple-choice question (*"Data freshness / UI clutter / Signal edge / Price"*).
3. For data-bug or calculation complaints: capture symbol + timeframe + `engine_version` + `asOf` timestamp, reproduce in unit tests (`npx tsx --test`), deploy patch within 24 hours, and reply directly with the changelog commit link.

### SOP 4: End-of-Day Closing & Shadow Reconciliation (17:30–18:15 ET)
1. Trigger Tier-1 EOD scan across `sp500_ndx100` on Fly.io worker at 17:30 ET.
2. Run Outcome Engine (`X1_fixed_v1`, `X2_trail_v1`, `X3_structure_v1`) on closed daily bars; void any row flagged `data_estimated` or gap anomaly (`void_reason` logged).
3. Confirm Postgres automated daily backup snapshot succeeded inside Supabase dashboard.
4. Post factual daily Regime & Breadth summary (`5` components + Stage 2 count) on X at 17:45 ET.

### SOP 5: Weekly Sunday Quality & Reorder/Vendor Check (Sunday 18:00 ET)
1. Review `v_signal_stats` rolling 60-day window + weekly CI90 degradation flag (`founder/master-plan-v3 §6.5`).
2. Audit Tiingo/Supabase/Fly.io usage meters against quota thresholds (`< 75%` of plan ceiling).
3. Review Marketing metrics (`Preview CPA`, `Trial-to-Paid %`, `Month-1 Churn %`) against `founder/marketing.md` red-flag triggers.
4. Archive expired watchlist items (`EXPIRED`/`INVALIDATED`) and verify zero orphan alerts or unlogged `canTrade()` refusals.

---

## 5. Minimal Tool Stack

- **Billing, Subscriptions & Sales Tax**: **Stripe Billing + Stripe Customer Portal + Stripe Tax** (`2.9% + $0.30` per charge) — eliminates custom billing/refund tickets.
- **Auth, Database, Cron & Row-Level Security**: **Supabase Pro** (`$25/mo`) — replaces `localStorage` and runs `pg_cron` schedules + RLS policies.
- **Backend API & Scheduled Worker**: **Fly.io** (`~$18/mo`) — always-on Node/TypeScript worker executing deterministic scans (`is247Active: true`).
- **Market Data**: **Tiingo Commercial Startup Redistribution** (`$250/mo`) + **SEC EDGAR API** (`$0`, strict `< 10 req/s` + declared `User-Agent`) + **CBOE Delayed Chain** (`$0`).
- **Bookkeeping**: **Wave Starter (`$0`) or QuickBooks / Xero (`~$20–$35/mo`)** inside the `$75/mo` compliance reserve.
- **Analytics & Support Inbox**: **Plausible / Cloudflare Web Analytics** (`$0–$9/mo`, cookie-light) + **HelpScout / Plain Support Email** (`$0–$20/mo`).

---

## 6. Licences, Permits, Compliance & Legal Checklist
_Rules vary by jurisdiction; confirm every item with a local business attorney or CPA before commercial launch (not legal advice):_
- [ ] **Business Entity & Tax ID**: Register LLC / sole proprietorship (US IRS EIN: [irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online](https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online)) and open dedicated business checking account.
- [ ] **Market Data Redistribution Licence**: Execute written Tiingo Startup Redistribution agreement (`$250/mo`) and **hard-disable unofficial Yahoo Finance endpoints** in commercial production builds to avoid exchange/Yahoo ToS breaches.
- [ ] **Open-Source Attribution Compliance (`src/index.css` Audit Fix)**: **Remove lines 20–33 of `src/index.css`** hiding TradingView `lightweight-charts` attribution links, ensuring full compliance with the Apache-2.0 / TradingView Lightweight Charts licence notice ([github.com/tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts)).
- [ ] **Publisher's Exclusion & Non-Advisory Terms**: Maintain impersonal, identical rule-based output across all subscribers (no individualized trade advice), backed by lawyer-reviewed Terms of Service and CFTC/SEC-style hypothetical performance & non-advisory disclosures ([sec.gov](https://www.sec.gov/)).
- [ ] **Sales Tax / VAT**: Enable Stripe Tax automatic nexus tracking for US state SaaS taxes and UK/EU digital-service VAT ([stripe.com/tax](https://stripe.com/tax)).
- [ ] **Third-Party Code/Brand Cleanup**: Remove `TrendSpiderSuite`, `LuxAlgoSuite`, `TradingWarz`, and unauthorized personal-name `"Trullàs"` references unless written IP consent is secured.
- [ ] **Tech E&O / General Liability Insurance**: Obtain cyber/software Errors & Omissions quote (`~$400–$800/yr`) once crossing `$2k/mo` MRR.

---

## 7. Ten-Item Operational Risk Register

| # | Risk | Likelihood | Impact | Concrete Plan / Mitigation |
| --- | --- | :---: | :---: | --- |
| 1 | **Unofficial Yahoo Finance HTTP 429/ban** | High (if unreplaced) | Critical | Switch paid production tier completely to **Tiingo Startup (`$250/mo`)** before billing launch; label free preview clearly as delayed. |
| 2 | **`Spike E` / `Spike R` shows weak net-of-cost edge** | Medium | Critical | Run 5-year test **before** ad launch (`founder-launch`); if raw setups don't beat SPY, reposition around *regime throttling + disciplined R-journaling* rather than setup alpha. |
| 3 | **IP / Cease & Desist over "Trullàs", `TrendSpiderSuite`, or `LuxAlgoSuite`** | Medium-High | High | Rebrand independently as **`StageLedger`** (`founder/brand.md`) and refactor third-party module names out of codebase before public launch. |
| 4 | **NYSE holiday / DST clock drift opens false signals** | Low-Medium | High | Keep fail-closed `canTrade()` using `America/New_York` IANA rules + automated tests covering Thanksgiving/Christmas Eve early close (`master-plan-v3 §8 #3`). |
| 5 | **Tiingo vendor raises price or Twelve Data `$499/mo` required** | Medium | Medium | Verified in CFO what-if: at `$499/mo`, Year-1 profit drops from `$32,093` to `$29,105` (break-even `25` subs vs `18`), remaining cleanly profitable. |
| 6 | **Chart licence complaint from `src/index.css` CSS watermark hide** | Medium | Medium | Delete the CSS rule hiding `lightweight-charts` attribution immediately in pre-launch PR. |
| 7 | **Slow Month-1 ramp (`50%` below plan = 15 subs)** | Medium | Medium | Verified in CFO (`--volume 0.5`): requires `$1,902` peak cash vs `$1,700` (fits inside `$3,000` reserve); delay Twelve Data upgrade & pause paid ads until organic converts. |
| 8 | **Auto-renew chargebacks / refund complaints** | Medium | Medium | Send 3-day pre-bill reminder + expose 1-click **Cancel / 30-Day Refund** directly in Settings; keep Stripe dispute rate `< 0.5%`. |
| 9 | **`localStorage` wipe loses customer journal/watchlist** | High (current state) | High | Migrate persistent state (`signals`, `watchlist_items`, `journal_entries`) to Supabase Postgres + JSON export backup before paid cohort opens. |
| 10 | **Solo founder illness or travel during trading week** | Low-Medium | Medium | Tier-1/Tier-2 worker runs autonomously on Fly.io + `pg_cron`; pre-drafted status template + autoresponder warns subscribers if manual support pauses >24h. |
