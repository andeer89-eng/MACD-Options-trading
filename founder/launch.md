# Launch Plan: Pre-Sell Validation, Countdown & 30-Day Review

_Dates run from Today (**2026-11-17**) through Target Public Launch Day (**2026-12-15**) and Day-30 Review (**2027-01-14**), synced with `founder/marketing.md`, `founder/ops.md`, and `founder/cfo.md`._

---

## 1. Test Before You Spend (Zero-Wasted-Fixed-Cost Validation: `2026-11-18` to `2026-11-30`)

Before committing the `$1,700` startup budget (`founder/numbers.json`) or signing the `$250/mo` Tiingo commercial redistribution contract, run two cheap real-world tests (`<= $250` total):

1. **Test 1 — Strategy & Regime Proof Gate (`Spike E` + `Spike R`, Cost `<= $100`)**:
   - Pull clean point-in-time US equities sample via Databento usage-based historical API (`$0` monthly base).
   - Validate 5-year net-of-slippage expectancy (`5 bps/side`) vs. SPY and random-entry controls.
   - **Action Rule**: If net alpha beats controls, lead homepage copy with the verified numbers; if setups perform inline with market drift, immediately re-anchor marketing copy purely on *time-saved pre-market curation + Regime throttling + risk journaling* (never fake or exaggerate edge).
2. **Test 2 — Real Checkout / Founding Seat Pre-Sell (`Cost <= $150` Search + X link)**:
   - Publish a single-page landing screen (`StageLedger` / selected brand) featuring a read-only sample of the 60-day Shadow Ledger + **"Reserve Founding Swing Pro ($29/mo × 3 mo) or Nightly Watchlist ($29/mo)"** Stripe pre-auth / refundable deposit link + 14-day preview waitlist.
   - **Pass Bar (`2026-11-30` Decision)**: **`>= 200` preview signups AND `>= 20` paid Founding pre-orders (`>= 10%` real visitor-to-paid or waitlist-to-deposit rate)** — compared honestly against the consumer panel's `55%` simulated upper bound.
   - **Fail Action**: If `< 10` paid commitments after `200` qualified swing-trader visits, **STOP**: do not buy the `$250/mo` commercial API or incorporate an ad spend scale-up; email all non-buyers 1 question (*"What stopped you?"*) and re-run `founder-offer` / `founder-pricing`.

---

## 2. Weekly Countdown (`2026-11-17` to `2026-12-15`)

Tasks marked **[CRITICAL PATH]** slip Launch Day if delayed.

### Week 1 (`2026-11-17` to `2026-11-23`) — Proof, Legal Cleanup & Pre-Sell Page
- **[CRITICAL PATH]** Finalize brand clearance (`StageLedger` / `ClearStage` USPTO/EUIPO/UKIPO searches + domain purchase) — *Owner: Founder · Deadline: `2026-11-18`*
- **[CRITICAL PATH]** Run `Spike E` & `Spike R` historical audit (`founder/board.md` C4) — *Owner: Founder · Deadline: `2026-11-20`*
- Remove `src/index.css` CSS rule hiding `lightweight-charts` attribution + purge `TrendSpiderSuite` / `LuxAlgoSuite` / unauthorized `Trullàs` strings (`founder/ops.md` §6) — *Owner: Founder · Deadline: `2026-11-21`*
- Launch Pre-Sell & 14-Day Preview Landing Page + `$150` initial traffic test — *Owner: Founder · Deadline: `2026-11-22`*

### Week 2 (`2026-11-24` to `2026-11-30`) — GO/NO-GO Gate, Data License & Cloud Stack
- **[CRITICAL PATH]** **GO / NO-GO Review (`2026-11-30`)**: Confirm `>= 20` pre-orders before unlocking startup spend — *Owner: Founder · Deadline: `2026-11-30`*
- **[CRITICAL PATH]** Execute written **Tiingo Startup Redistribution (`$250/mo`)** contract & API integration (hard-disable Yahoo on commercial endpoints) — *Owner: Founder · Deadline: `2026-11-28`* *(contingent on early pre-sell traction or executed Nov 30)*
- **[CRITICAL PATH]** Deploy Supabase Pro (`$25/mo`, Postgres v3 schema + RLS + `localStorage` migration) & Fly.io scheduled worker (`$18/mo`) — *Owner: Founder · Deadline: `2026-11-29`*
- Register business entity / EIN, open business bank account, and configure Stripe Billing + Customer Portal (1-click 30-day refund) + Stripe Tax — *Owner: Founder + CPA check · Deadline: `2026-11-30`*

### Week 3 (`2026-12-01` to `2026-12-07`, `T-14` to `T-8`) — Campaign Kickoff & Beta Soft Open
- **`T-14 (2026-12-01)`**: Open public read-only **60-Day Shadow Signal Ledger** + publish `Spike E`/`R` note (`founder/marketing.md`) — *Owner: Founder*
- **[CRITICAL PATH]** Invite **10–15 Friends, Family & Beta Swing Traders** into live Staging (`Soft Open`) to verify CSV import, Telegram bot linking, and `Today` 10-minute workflow — *Owner: Founder · Deadline: `2026-12-03`*
- Launch `$15/day` Google Search exact-match A/B test (`$29` Nightly vs `$39` Swing Pro landing variants) — *Owner: Founder · Deadline: `2026-12-07`*

### Week 4 (`2026-12-08` to `2026-12-15`, `T-7` to Launch Day `T`) — Hardening & Public Launch
- Fix every friction bug found by Soft Open cohort; verify `0` console errors and `1-click CSV import` success across Schwab/Interactive Brokers/TradingView formats — *Owner: Founder · Deadline: `2026-12-11`*
- **[CRITICAL PATH]** Verify **7 consecutive error-free EOD (`17:30 ET`) & Pre-Market (`08:30 ET`) worker cycles** on Fly.io (`rateLimitHitsCount === 0`, `is247Active: true`) — *Owner: Founder · Deadline: `2026-12-13`*
- Run full Stripe `$1` live checkout + 1-click refund end-to-end production test — *Owner: Founder · Deadline: `2026-12-14`*
- **`T (2026-12-15)`**: **Public Launch Day** (Founding Cohort `$29/mo × 3 mo` open until `2026-12-29`).

---

## 3. Launch Day Run Sheet (`2026-12-15`, Eastern Time)

| Time (ET) | Task & Channel | Owner | If Something Breaks (from Risk Register) |
| --- | --- | --- | --- |
| **07:00** | Check `/system-health`: confirm Fly.io worker heartbeat, Tiingo API 200 OK, Supabase DB connections, and NYSE session gate (`REGULAR` open at 09:30 ET). | Founder | If Tiingo degrades: switch `dataQuality` badge to `CACHED`, pause intraday triggers, post notice banner, ping Tiingo support. |
| **07:45** | Final visual smoke test of `Today`, `60-Day Shadow Ledger`, and Stripe `$29/$39` Checkout links in clean browser. | Founder | Hold email blast for 30 min if checkout webhook fails; fix endpoint before announcing. |
| **08:00** | **GO LIVE**: Switch Founding Cohort checkout active; send Waitlist Email #3 (`T` announcement) + publish pinned X launch thread & YouTube demo. | Founder | If landing host spikes CPU, scale Fly.io machine temporarily (`2GB RAM`, ~$0.40/day). |
| **08:30** | Verify automated **Pre-Market Shortlist Telegram Digest** fires cleanly to early Founding users & test channel. | Founder | Manually trigger fallback broadcast CLI script and patch cron schedule before `17:30 ET`. |
| **09:30** | Market Open: Confirm Tier-2 `<= 60` symbol monitor tracks live prices and `canTrade()` displays `REGULAR · LIVE`. | Founder | Fail-closed safety: if feed stalls >10 min, auto-halt triggers rather than sending stale prices. |
| **12:00** | Mid-day Funnel Audit: check Stripe orders, preview signups, and early refund/support inbox. | Founder | Reply to any onboarding blocker in `< 1 hour` with Loom walkthrough. |
| **16:15** | Close-of-Day Support Sweep: help new users with broker CSV imports and monitor Search Ads `$29 vs $39` A/B split. | Founder | If a specific broker CSV format fails, write quick parser patch & deploy same evening. |
| **17:30–18:00** | Confirm **Tier-1 EOD S&P 500 + NDX-100 scan** completes cleanly; post Day-1 factual Regime & Breadth recap on X. | Founder | Re-run failed ticker chunk cleanly (`fetcher` bisection); verify Supabase snapshot integrity. |
| **20:00** | Day-1 Debrief: log Launch Day signups vs break-even target (`18` active paid subscribers/mo) and prep T+1 email. | Founder | — |

---

## 4. First 30 Days: Numbers to Watch & Review Cadence (`2026-12-15` to `2027-01-14`)

**Weekly Tracking Against CFO & Marketing Bars**:
- **Paying Subscribers vs. CFO Break-Even**: Need **18 active subscribers/mo** (`~1/day` billing rate in `numbers.json`) to cover `$638/mo` fixed costs; Year-1 Month-1 plan target = **30 subscribers** (`$1,170` revenue).
- **Preview CPA**: Target `<= $12` (Trigger: `> $20` -> cut high-CPC keywords).
- **Preview-to-Paid Conversion**: Target `>= 18%` (Trigger: `< 10%` -> audit Day-1 onboarding friction).
- **Refund & Month-1 Churn**: Target `<= 4%` refunds / `<= 12%` churn (Trigger: `> 8%` refunds -> pause paid ads immediately and fix top exit reason).

### Review Checkpoints
- **Day 7 (`2026-12-22`) — Activation & Tech Check**:
  - *Questions*: How many users imported a CSV journal or linked Telegram inside 48 hours? Did the worker miss any `08:30`/`17:30 ET` runs? Which pricing variant (`$29` Nightly vs `$39` Swing Pro) gets higher revenue per 1,000 clicks?
- **Day 14 (`2026-12-29`) — Founding Cohort Close & Offer Check**:
  - *Action*: **Close Founding `$29/mo × 3 mo` offer strictly at 23:59 ET** (`founder/marketing.md`); switch Swing Pro to standard `$39/mo`.
  - *Questions*: Did we cross the **18-subscriber break-even** line? Are real users converting near our Month-1 target (`30`), or below the 50%-downside line (`15`)?
- **Day 30 (`2027-01-14`) — Unit Economics & Review-Unlock Audit**:
  - *Questions*: (1) What is real Month-1 MRR, refund rate, and Tiingo/infra spend vs `founder/numbers.json`? (2) Request honest public reviews on Trustpilot from active Day-1 users so `Review & community checker` buyers (`P002`/`P013`) see real third-party feedback. (3) Decide whether to maintain `$250/mo` marketing or shift budget to highest-ROI newsletter/YouTube channels.
