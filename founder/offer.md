# Offer Architecture: The 10-Minute Pre-Market Swing Edge Stack

_Built using the Offers lens (`founder/board/lenses.md`) on top of `founder/panel-v1/results.md`, `founder/competitors.md`, `founder/numbers.json`, and `founder/board.md`._

---

## 1. The Problem List (18 Obstacles in the Buyer's Words)

### Before Buying (Trust, Price & Tool Fatigue)
1. *"I got burned last quarter by an unverified options Discord alert group—every tool claims an edge with zero proof."*
2. *"I don't know if MACD Triple Divergence + Weinstein Stage 2 actually beats SPY over 5 years after slippage."*
3. *"$49/month on top of my $35/month TradingView Plus eats into a $10k–$50k account."*
4. *"Are you charging SaaS prices for free 10–20 minute delayed Yahoo Finance data?"*
5. *"I don't want to hand over my credit card only to get trapped by an auto-renewal like I read on Trustpilot."*
6. *"I'm tired of paying for features that get moved behind higher tiers or metered AI credits later."*
7. *"I already spend $125+/mo juggling a screener, charting app, and trade journal spreadsheet."*

### During Use (Time, Clutter & Execution Friction)
8. *"I work a full-time engineering or finance job during market hours—I can't watch 500 tickers all day."*
9. *"I only have 15–20 minutes after 16:00 ET or before the 09:30 ET open to build my watchlist."*
10. *"Eight separate workspace tabs overwhelm me; I just want today's actionable shortlist and invalidation prices."*
11. *"Unfiltered options flow and intraday scanners throw dozens of noisy alerts that bait me into chasing."*
12. *"Calculating ATR stop losses, risk-per-trade, and R-multiples manually in a spreadsheet takes too long."*
13. *"Moving years of historical trades out of Excel or TradingView into a new journal feels painful."*

### After Buying / Retention (Accountability & Proof)
14. *"How do I know if a bad month is market regime Chop vs. a broken setup rule?"*
15. *"Most journals only track trades I actually took—they never audit the setups I skipped or got stopped out of."*
16. *"If I forget to check the macro calendar or NYSE half-day schedule, I take trades into choppy or closed conditions."*
17. *"What if I try it for three weeks and realize I still prefer my old TradingView routine?"*
18. *"If I'm trading a smaller $15k account EOD, I don't need expensive intraday bells and whistles."*

---

## 2. Trimmed & Stacked Solutions

| Problem # | Solution Element | Buyer Value (1–5) | Delivery Cost (1–5, CFO) | Keep? |
| --- | --- | ---: | ---: | --- |
| 8, 9, 10, 12 | **Single-screen `Today` Pre-Market Readiness View** (Regime + Top 15 Stage-2 Divergence setups + pre-computed entry/SL/TP/invalidation `Levels`) | 5 | 1 | **Keep (Core)** |
| 4, 16 | **Licensed Commercial Market Feed + Fail-Closed NYSE Gate** (eliminates Yahoo delay on paid plans; blocks signals when market/data is stale) | 5 | 2 | **Keep (Core)** |
| 1, 2, 14, 15 | **Public 5-Year Methodology & Live 60-Day Anti-Lookahead Shadow Ledger (`X1`/`X2`/`X3` net of slippage vs. SPY)** unlocked in 14-day no-card preview | 5 | 1 | **Keep (Bonus 1)** |
| 7, 13 | **1-Click TradingView / Broker CSV Journal Migrator + Automated R-Multiple & MFE/MAE Playbook** | 4 | 1 | **Keep (Bonus 2)** |
| 8, 11 | **08:30 ET Pre-Market & High-Conviction Trigger Telegram Digest** (only curated Stage-2 confluence triggers, no firehose) | 4 | 1 | **Keep (Bonus 3)** |
| 3, 18 | **$29/mo Nightly Watchlist Tier** (separates EOD prep buyers from $39/mo Swing Pro real-time users) | 5 | 1 | **Keep (Pricing Tier)** |
| 5, 17 | **1-Click In-App Cancel + 30-Day Unconditional Refund Guarantee** (no support emails required) | 5 | 2 *(4% reserve = $1.56/mo)* | **Keep (Guarantee)** |
| — | *Secondary experimental tabs (Pine script editor, 507-tile heatmap, local Python daemon generator)* | 2 | 3 *(support/clutter cost)* | **Hide in Pro Labs / $69 Quant Desk** |
| — | *1-on-1 live coaching calls* | 4 | 5 *(high founder time)* | **Cut** |

---

## 3. The Offer Stack

- **Offer Name**: **The 10-Minute Pre-Market Swing Edge Stack**
- **The Core Outcome**: Finish your entire US equities & options swing prep in **10 minutes before the 09:30 ET open** on one clean `Today` screen—combining Market Regime breadth, CBOE VIX/GEX context, SEC EDGAR Form 4 insider clusters, a tight Stage-2 + MACD Triple Divergence shortlist, and pre-calculated ATR/structure `Levels` powered by a licensed commercial data feed.
- **Included Bonuses (Zero Extra Marginal Software Cost)**:
  1. **Open-Book 60-Day Anti-Lookahead Shadow Ledger & `Spike E` Audit Preview** *(kills the #1 "unproven Discord/black-box" objection before you ever enter a card)*.
  2. **1-Click Broker / Spreadsheet CSV Journal Importer & R-Multiple Attribution Pack** *(kills switching friction and eliminates manual Excel maintenance)*.
  3. **08:30 ET Curated Telegram Pre-Market Brief** *(replaces noisy intraday alerts for full-time salaried traders)*.
- **The Guarantee (CFO-Modeled)**:
  - **14-Day No-Card Shadow Preview** + **30-Day "First 20 Sessions" One-Click Guarantee**: subscribe with instant in-app cancellation; if the morning workflow does not save time or prove its signal transparency inside your first 30 days, click Refund in Account Settings for 100% back.
  - **CFO Cost Check (`founder/numbers.json`)**: Modeled explicitly at a **4% monthly refund reserve (`$1.56` per `$39.00` Swing Pro subscriber-month)**, leaving **`$35.81` contribution per subscriber-month (`92%` margin)** after Stripe (`$1.43`) and alert/DB metering (`$0.20`).
- **Honest Urgency**:
  - **Founding Member 14-Day Launch Window (or first 50 seats)**: Lock **Swing Pro at $29/mo for your first 3 months** (published standard rate **$39/mo** resumes Month 4; Nightly Watchlist remains **$29/mo**). Strictly closes 14 calendar days after launch—no fake countdown timers or inflated "was $199" anchors.

---

## 4. Value Equation Score (Before vs. After, 1–10)

| Dimension | Pitch v1 (`$49/mo`) | Pitch v2 (Stacked Offer) | What Moved the Score |
| --- | :---: | :---: | --- |
| **Dream Outcome** *(higher = better)* | 6 | **8** | Reframed from "all-in-one 500-stock terminal" to "10-minute pre-market swing readiness + verifiable R-ledger." |
| **Perceived Likelihood of Achievement** *(higher = better)* | 3 | **8** | Added licensed commercial feed (no Yahoo lag), 14-day no-card preview, open 60-day Shadow Ledger vs. SPY, and 30-day one-click guarantee. |
| **Time Delay** *(higher = better / shorter wait)* | 5 | **8** | Cut multi-tab hunting to an 08:30 ET Telegram shortlist + 1-click CSV journal import in minutes. |
| **Effort & Sacrifice** *(higher = better / less friction)* | 4 | **8** | Separated `$29/mo` Nightly Watchlist tier, removed credit-card wall on preview, and tucked 8 secondary tabs behind `Today`. |

---

## 5. Re-Test on Buyer Panel (`--n 20 --seed 7`, Same Persona Cards)

| Metric | Pitch v1 (`founder/panel-v1/results.md`) | Pitch v2 (`founder/panel/results.md`) | Change |
| --- | ---: | ---: | ---: |
| **Simulated Buy Rate** | **15%** (`3 buy · 17 pass`) | **55%** (`11 buy · 9 pass`) | **+40 pts (+8 buyers)** |
| **Price Objections (`reason_code: price`)** | 6 passes | **1 pass** | **-5 passes** |
| **Trust Objections (`reason_code: trust`)** | 6 passes | **2 passes** *(Review checkers waiting for external Trustpilot/Reddit reviews)* | **-4 passes** |
| **Systematic ($150k+) Buy Rate** | 25% (`1/4`) | **75%** (`3/4`) | **+50 pts** |
| **Part-Time Salaried ($10k–$50k) Buy Rate** | 22% (`2/9`) | **67%** (`6/9`) | **+45 pts** |

_Simulation disclosure: All 20 buyers were evaluated in-session against identical `seed 7` persona briefs (`founder/panel/briefs/`). Simulated LLM buyers represent an upper-bound diagnostic signal, never real customer conversion proof; the remaining 9 passes show real structural friction among DIY `thinkorswim`/`yfinance` coders (3), sticky TradingView loyalists (3), external review checkers (2), and tight dual-subscription budgets (1)._
