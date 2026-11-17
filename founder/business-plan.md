# Trullàs Divergence 24/7 Scanner (Working Name) · Business plan

**Verdict: Profitable**

- ✓ Each subscriber-month earns $35.81 before fixed costs (92% contribution).
- ✓ Year 1 operating profit: $32,093.
- ✓ Break-even is 1 subscriber-months a day against a capacity of 33.
- ✓ 11 of 20 simulated buyers buy (55%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $39.00 a subscriber-month |
| Profit margin at plan | 81% per subscriber-month |
| Break-even | 1 subscriber-months a day |
| Year 1 operating profit | $32,093 |
| Startup spend | $1,700 |
| Cash needed before it pays for itself | $1,700 |
| Startup money earned back | month 3 |
| Buyer panel | 11 buy · 9 pass |

## The idea

- **What it is**: An evidence-first quantitative swing-trading scanner and rules terminal combining David Trullàs's MACD Triple Divergence + 4-Pillars Confluence with Stan Weinstein Stage 1–4 analysis, S&P 500 breadth/GEX regime context, SEC EDGAR filings, shadow signal outcome tracking, and Telegram/Webhook alerts (plus a downloadable standalone Python 24/7 scanner daemon).
- **Who it is for**: Self-directed retail and semi-pro US equities & options swing traders (holding 3–20 days, typically $10,000–$250,000 accounts) who trade systematically around weekly/daily trend stages and momentum divergences instead of staring at intraday 1-minute charts.
- **What it sells, at what price**: SaaS subscription for the web terminal, automated S&P 500 EOD + watchlist intraday alerts, shadow signal analytics, and standalone Python daemon generator — **Working candidate price: $49/month** *(Working hypothesis for the pack to test via Van Westendorp, competitor benchmarks, and CFO unit economics; not yet confirmed by the founder).*
- **Where and how**: 100% online web application (English, targeting US/EU/UK retail traders trading US equities/options), discovered via YouTube/X quantitative trading breakdowns, Substack/community channels, and direct search, and delivered as a hosted web workspace + Telegram/Webhook alert stream.
- **Budget and constraints**: Bootstrap solo/small technical team; core React/Express/TypeScript application and Python daemon are already built as a working single-user prototype (`metadata.json`: *Trullàs Divergence 24/7 Scanner*). Working cash budget assumption: **$3,000 bootstrap reserve** *(working hypothesis to size in CFO)* for licensed market-data API upgrade, cloud worker hosting, LLC/disclaimers, and paid landing-page tests. Strict product rules from codebase: deterministic calculations, honest `LIVE`/`CACHED`/`DELAYED` labeling, fail-closed NYSE session gate (`canTrade()`), and **no AI chatbots**.

## Summary

**StageLedger** is an evidence-first pre-market swing-trading scanner and shadow-audit web terminal built for self-directed US stock and options swing traders (`$10k–$250k` accounts) who check setups around a full-time job. Every morning before 09:30 ET, it narrows 500+ S&P 500 stocks into a 10-minute `Today` brief: Market Regime breadth, Stan Weinstein Stage 2 + MACD Triple Divergence setups with pre-calculated stop/invalidation levels, SEC EDGAR Form 4 context, and an unedited anti-lookahead Shadow Signal Ledger (`X1`/`X2`/`X3` net of slippage vs. SPY) at **$29/mo** (Nightly Watchlist) or **$39/mo** (Swing Pro).

- **Computed Verdict**: **Profitable** (`compile.py` check, all 4 checks passed):
  - **Profit Margin at Plan (`150` active subscribers/mo = `5/day`)**: **81%** (**`$35.81`** contribution per `$39.00` subscriber-month = **92%** before `$638/mo` fixed costs).
  - **Break-Even**: **1 subscriber-month a day** (18 active subscribers/mo vs. a capacity ceiling of `33/day` = 990 subscribers/mo).
  - **Year 1**: **$32,093** operating profit on **$43,290** revenue (**$30,393** after **$1,700** startup spend; payback **Month 3**; `$12,219` Year-1 profit if volume lands at 50%).
- **Board vs. Buyer Panel Alignment**: Both the Offers/Product board lenses (`2 FUND IF, 1 PASS`, `5.0/10`) and the buyer panel agreed that **unproven multi-year strategy claims**, **unofficial 10–20m delayed Yahoo feeds**, **8-tab clutter**, and a **`$49/mo` price wall** would kill launch conversion (Pitch v1 passed 85%: `3 buy · 17 pass`). Stacking a licensed commercial feed (`Tiingo $250/mo`), a 14-day no-card Shadow Ledger preview, a `$29/mo` EOD tier, 1-click CSV journal import, and a 30-day one-click refund flipped the same `seed 7` panel to **55% (`11 buy · 9 pass`)**. The Monopoly lens (`PASS`) still warns that raw technical formulas are easily copied on TradingView unless the product owns a credible public track-record ledger and drops third-party/personal naming risks.
- **Biggest Risk & Mitigation**: Unverified strategy edge (`Spike E` / `Spike R`) paired with personal/third-party IP naming exposure (`David Trullàs`, `TrendSpiderSuite`, `LuxAlgoSuite`) and commercial Yahoo ToS bans. **Fix**: run `Spike E`/`Spike R` (`<= $100`), switch commercial production to `Tiingo Startup ($250/mo)`, rebrand cleanly as **`StageLedger`**, remove the `src/index.css` chart-attribution hide rule, and validate `>= 20` paid Founding pre-orders before spending startup cash.
- **Cash Required & First Test**: **$1,700** startup cash (`$1,902` in the 50%-volume downside case), tested first with **`<= $250`** on `Spike E` + a 12-day pre-sell landing page (`2026-11-18` to `2026-11-30`).
- **The One Thing to Do This Week**: Run `Spike E` & `Spike R` on historical data, secure the `StageLedger` domain/trademark checks, and put up the 1-page pre-sell + 60-day Shadow Ledger sample before signing the `$250/mo` Tiingo API contract.

_Simulated buyer panels are upper-bound research tools (simulated in-session in this build environment), and financial outputs are model projections from named inputs; confirm demand with real checkouts and costs with signed vendor quotes before spending. Not financial, legal, tax, or investment advice._

## What the board said

**Vote:** 2 FUND IF, 1 PASS | **Average Score:** **5.0 / 10** *(Offers: 6 · Monopoly: 4 · Product: 5)*

---

### 1. Shared Risks (Raised by Multiple Board Members)
1. **Data-licensing, "24/7" runtime & credibility gap** *(Offers + Product + Monopoly)*: Shipping a commercial subscription backed by unofficial Yahoo Finance scraping while `/api/system-health` shows `is247Active: false` and persistence relies on `localStorage` risks exchange/API lockouts, missing alerts, and instant churn.
2. **Commodity indicators & copycat risk without verified edge** *(Offers + Monopoly)*: MACD Triple Divergence, Stan Weinstein Stages, AVWAP, and SEC EDGAR filings are public methods on public feeds. Neither `Spike E` (5-year net-of-cost strategy expectancy vs. random entry) nor `Spike R` (Regime Score discrimination) has been validated yet, leaving the business vulnerable to quick clones and skeptical buyers.
3. **Brand, IP & third-party naming exposure** *(Monopoly + Product)*: Carrying "Trullàs" alongside third-party product labels inside module identifiers (`TrendSpiderSuite`, `LuxAlgoSuite`, `TradingWarz` references) creates trademark/brand confusion that must be resolved before public launch.
4. **Distribution & willingness-to-pay uncertainty** *(Offers + Monopoly)*: Competing head-to-head against TradingView, TrendSpider, and Finviz Elite requires either a sharp narrow beachhead or an undeniable offer stack; neither CAC nor confirmed $49/mo willingness to pay is proven yet.

### 2. Where the Board Disagrees
- **Scope vs. Stack**: The **Offers lens** wants to stack complementary deliverables (daily curated watchlist, risk sizing, journal, shadow stats, daemon, onboarding playbooks) to justify $49+/month without competing on price. The **Product lens** strongly pushes the opposite way: cut the sprawling 8-hub surface and confusing local Python daemon down to one unmistakable 5-minute pre-market workflow.
- **Viability Verdict**: The **Offers** and **Product** lenses see a viable specialist workflow business (`FUND IF`), whereas the **Monopoly lens** votes **PASS** unless the founder switches from selling "another technical scanner" to owning a defensible wedge (an auditable, anti-lookahead shadow-signal ledger + point-in-time outcome dataset that incumbents refuse to expose).

### 3. Merged Conditions Checklist
- [ ] **C1 (Competitors & Gap — `founder-competitors`)**: Map TradingView, TrendSpider, Finviz Elite, LuxAlgo, and options/scanner substitutes with real prices & user complaints; verify an evidence-backed market gap.
- [ ] **C2 (Demand & Price — `founder-consumer`, `founder-pricing`, `founder-offer`)**: Test willingness to pay around $49/month, validate which trader segment converts best, and strip bloat into a concrete outcome-first offer.
- [ ] **C3 (Data Licensing & 24/7 Architecture — `founder-ops`, `founder-cfo`)**: Replace unofficial Yahoo Finance reliance with a commercial licensed market-data vendor + scheduled cloud worker + database persistence, and prove >=75–80% gross margin and realistic Year-1 cash requirements.
- [ ] **C4 (Edge Verification — `founder-launch` / pre-sell gate)**: Run `Spike R` and `Spike E` (net of slippage, survivorship caveat disclosed) before making statistical edge claims or scaling paid marketing.
- [ ] **C5 (Product Simplicity & Brand Cleanliness — `founder-brand`, `founder-ops`)**: Remove all third-party product names from UI/code labels, audit "Trullàs" trademark/domain availability, and center the user's first 5 minutes on `Today -> Watchlist -> Levels -> Shadow Ledger` with strict `as-of` / `DELAYED` vs `LIVE` labels.

### 4. The Strongest Version of This Business
The strongest business the board sees is **not** a generic "24/7 AI-free TradingView clone with 8 workspaces," nor a script bundle for tinkerers. It is an **evidence-first pre-market swing-readiness & signal-audit terminal** for active US stock/options swing traders who are burned out by black-box Discord alerts and manual TradingView/spreadsheet checklists: every morning before 08:30 ET, a licensed cloud worker delivers a 15-name ranked Stage-2 & divergence shortlist paired with transparent Regime context, immutable ATR/structure `Levels`, fail-closed NYSE risk rules, and an auditable anti-lookahead shadow-performance ledger (`X1`/`X2`/`X3`) that proves which setups and filters actually pay net of slippage.

## The competition

_All prices, positioning lines, ratings, and review complaints come from public vendor pages, Trustpilot, App Store listings, and Reddit threads checked on **2026-11-17**._

---

### 1. Competitor Table (Sorted by How Directly Each Competes)

| Name | Type | Comparable Monthly Price | What It Sells | Positioning Line | Rating / Reviews | Public URL |
| --- | --- | --- | --- | --- | --- | --- |
| **TrendSpider** | Direct | **$89.00/mo** (Elite; Pro $149/mo) | Automated trendlines, multi-TF scan, Raindrop charts, backtesting, bots, Sidekick AI | *"Elevate your trading & investing with TrendSpider: the all-in-one platform for real-time data, time-saving automation & sophisticated market research."* | 4.8/5 (Trustpilot, 900+) | [trendspider.com](https://trendspider.com/) |
| **TradingView** | Direct | **$34.95/mo** (Plus; Premium $69.95/mo) | Supercharts, screener, Pine Script, 100 technical alerts, social network | *"Where the world charts, chats, and trades markets."* | 2.5/5 (Trustpilot, 1,300+) | [tradingview.com](https://www.tradingview.com/) |
| **Finviz Elite** | Direct | **$39.50/mo** ($299.50/yr) | Real-time screener, heatmaps, alerts, backtesting, exports | *"Stock screener for investors and traders, financial visualizations."* | 3.1/5 (Trustpilot, ~35) | [finviz.com/elite.ashx](https://finviz.com/elite.ashx) |
| **TC2000** | Direct | **~$39.98–$44.99/mo** ($29.99 Gold + ~$10–$15 data) | EasyScan multi-timeframe US stock scanning, sorting, charting, alerts | Stock scanning, sorting, and charting by Worden Brothers | N/A | [tc2000.com](https://www.tc2000.com/) |
| **Trade Ideas** | Direct | **$127.00/mo** (Standard; Premium $254/mo) | Streaming intraday scanner, simulated trading, Holly AI | AI-assisted real-time stock scanning & trade ideas | 4.0/5 (Trustpilot, ~50) | [trade-ideas.com](https://www.trade-ideas.com/) |
| **MarketSurge** | Direct | **$149.95/mo** ($1,499/yr) | RS ratings, CAN SLIM fundamental/pattern screener, institutional sponsorship | IBD flagship stock research & pattern recognition | N/A | [investors.com/marketsurge](https://www.investors.com/marketsurge/) |
| **LuxAlgo** | Indirect | **$39.99/mo** (Premium w/ webhooks; $24.99 Essential) | Indicator overlays, Vela charting, orderflow lookback, AI Quant | Technical indicator suites, Vela charting, and Quant AI | 4.3/5 (Trustpilot, 1,700+) | [luxalgo.com](https://www.luxalgo.com/) |
| **Unusual Whales** | Indirect | **$50.00/mo** (Retail Basic; Pro $75/mo) | Real-time options flow, dark pool, GEX, 25 alerts | Options flow, dark pool, and GEX market telemetry | 4.6/5 (App Store) / mixed web | [unusualwhales.com](https://unusualwhales.com/) |
| **TradeZella** | Indirect | **$35.00/mo** (Essential; Pro $59/mo) | Auto broker journal sync, R-multiple analytics, replay, backtesting | Automated trade journaling & strategy backtesting | 4.8/5 (Trustpilot, 1,000+) | [tradezella.com](https://www.tradezella.com/) |
| **Schwab thinkorswim** | Substitute | **$0/mo** (funded Schwab account) | Stock Hacker (thinkScript), real-time quotes, options chains | $0-commission retail trading terminal | N/A (broker) | [schwab.com/trading/thinkorswim](https://www.schwab.com/trading/thinkorswim) |
| **DIY Python + yfinance** | Substitute | **$0/mo** | Unofficial Yahoo Finance wrapper + custom scripts/alerts | Open-source research wrapper | N/A (OSS) | [pypi.org/project/yfinance](https://pypi.org/project/yfinance/) |

---

### 2. Comparable Monthly Price Range (Paid Tools)
Across the 9 comparable paid monthly subscriptions (`$34.95`, `$35.00`, `$39.50`, `$39.99`, `~$42.50` TC2000 Gold+Data, `$50.00`, `$89.00`, `$127.00`, `$149.95`):
- **Lowest paid comparable**: **$34.95/mo** (TradingView Plus; LuxAlgo Essential without webhooks is $24.99/mo)
- **Median paid comparable**: **~$42.50/mo** (midpoint cluster **$39.50–$50.00/mo**)
- **Highest paid comparable**: **$149.95/mo** (MarketSurge; Trade Ideas Premium reaches $254/mo)
- **Zero-cost substitutes**: **$0/mo** (Schwab thinkorswim Stock Hacker + DIY `yfinance` Python scripts)

---

### 3. Two-Axis Positioning Map
The two axes swing traders care about most here are **Monthly Price** and **Workflow Focus (Generic DIY Toolkit vs. Opinionated Pre-Trade + Auditable Outcomes)**:

```
HIGH PRICE ($90–$150+/mo)
  ^
  |  [Trade Ideas $127]                     [MarketSurge $150]
  |    (noisy intraday firehose)              (RS/CAN SLIM patterns, costly)
  |  [TrendSpider $89]
  |    (powerful multi-TF DIY automation)
  |
  |                         [Unusual Whales $50]      <-- TRULLÀS GAP ($39-$49?)
  |                         (raw GEX/options noise)       Opinionated Stage-2 + Divergence
  |  [TradingView $35]                                    + Fail-Closed Risk + Shadow Ledger
  |  [Finviz Elite $39.50]   [LuxAlgo $40]  [TradeZella $35-$59]
  |    (DIY charts/screeners) (overlays)     (post-trade journal only)
  |
  |  [thinkorswim $0 / DIY yfinance $0]
  v
LOW PRICE ($0–$40/mo)
  <---------------------------------------------------------------------------->
  GENERIC DIY TOOLKIT / RAW DATA               OPINIONATED SETUP + RISK + AUDIT
```

---

### 4. Ranked User Complaints (Public Reviews & Forums)

1. **Paywall creep, feature stripping & surprise renewal billing** *(High volume — TradingView 1,300+ Trustpilot reviews, LuxAlgo 1,700+ Trustpilot reviews, Finviz ~35)*
   - TradingView reviewers complain basic capabilities are repeatedly pushed onto higher plans: *"In the meantime, even absolute basic functions are put behind a paywall"* ([Trustpilot TradingView](https://www.trustpilot.com/review/www.tradingview.com)); *"Now I can only create or edit 1 script which was never the case"* ([Trustpilot TradingView](https://www.trustpilot.com/review/www.tradingview.com)).
   - LuxAlgo and Finviz reviewers cite friction around automatic renewals and rigid post-renewal refund handling ([Trustpilot LuxAlgo](https://www.trustpilot.com/review/luxalgo.com), [Trustpilot Finviz](https://www.trustpilot.com/review/finviz.com)).

2. **Steep learning curve, lack of guidance & UI clutter** *(High — TrendSpider, Trade Ideas, Finviz)*
   - TrendSpider reviewers praise automation and support yet warn beginners face *"a high degree of sophistication"* and complexity ([Trustpilot TrendSpider](https://www.trustpilot.com/review/trendspider.com)).
   - Trade Ideas reviewers on Trustpilot and Reddit report outdated UI elements (*"software written in the early 2000s"*) and information overload for non-experts ([Trustpilot Trade Ideas](https://www.trustpilot.com/review/www.trade-ideas.com)).
   - Finviz beginners complain the tool lacks built-in workflow instructions, leaving newer traders to *"flounder around"* ([Trustpilot Finviz](https://www.trustpilot.com/review/finviz.com)), while Reddit threads criticize Finviz charts as clunky/outdated (`r/swingtrading`).

3. **Raw data / signals are noisy, non-actionable & "black box"** *(High — Unusual Whales, LuxAlgo, Trade Ideas on Reddit)*
   - On `r/options` and `r/TraderTools`, traders stress that unusual options sweeps are mostly institutional hedges or spreads rather than clean directional entries, creating *"data overload"* and false confidence unless paired with strict technical regime context.
   - Critics of paid indicator suites call algorithmic overlays a *"black box"* when no transparent forward/outcome proof is shown ([Trustpilot LuxAlgo](https://www.trustpilot.com/review/luxalgo.com)).

4. **High combined subscription cost when stitching screener + charts + journal** *(Moderate-High — TradeZella, TrendSpider, MarketSurge)*
   - Traders who want TrendSpider ($89/mo) + TradeZella ($35–$59/mo) + MarketSurge/Unusual Whales ($50–$150/mo) easily spend **$125–$200/month** across disconnected tabs with no shared rule engine (`Levels` in one app, journal in another).

5. **Outdated or limited companion charting / mobile parity** *(Thin-to-Moderate — Finviz Elite, TrendSpider)*
   - Finviz Elite users note weak interactive charting relative to $39.50/mo (`r/swingtrading`); TrendSpider users note mobile acts mainly as a companion viewer ([Trustpilot TrendSpider](https://www.trustpilot.com/review/trendspider.com)).

---

### 5. The Evidence-Backed Gap
Nobody in the **$35–$55/month** bracket unifies **all four stages of an active swing trader's daily loop** without forcing them into a noisy DIY sandbox or a $125+/mo multi-tool stack:
1. **Curated daily trend + divergence triage** (Stan Weinstein Stage 2 + Mansfield RS + MACD Triple Divergence with explicit invalidation prices — instead of Finviz's static tables or Trade Ideas' noisy intraday ticker firehose).
2. **Macro/Regime + SEC EDGAR gating** (does market breadth, VIX/GEX, sector rotation, and Form 4 context allow normal sizing today, or reduce risk? — missing in TradingView/Finviz/TradeZella).
3. **Anti-lookahead Shadow Signal Audit (`X1`/`X2`/`X3`)** (proving in R-multiples net of slippage which setups and filters actually beat random controls — answering the exact "black box indicator" complaint leveled at LuxAlgo and options flow tools).
4. **Transparent, predictable pricing with zero feature creep or metered AI upsells** (directly answering TradingView's paywall backlash and TrendSpider/TradeZella's AI credit add-on complaints).

---

### 6. The Threat (Who Copies Fastest & How)
- **Fastest direct threat**: **TradingView community Pine Script authors + TrendSpider**. Any capable Pine Script developer can publish an open/paid Weinstein Stage 2 + MACD Triple Divergence indicator on TradingView in 1–2 weeks for $0–$20/mo, while TrendSpider already automates multi-timeframe scanning, Raindrop charts, and bots with 900+ Trustpilot reviews at 4.8/5.
- **Zero-cost threat**: **Schwab thinkorswim (`Stock Hacker`) + ChatGPT/Claude writing `yfinance` scripts**. Technical traders already build local Python divergence scanners for $0.
- **How Trullàs survives copycats**: Not by hiding MACD/Weinstein formulas, but by owning **pre-computed, point-in-time shadow signal history (`X1`/`X2`/`X3`), regime-conditional attribution (`taken` vs `skipped`), SEC EDGAR context, and fail-closed execution rules** in one zero-setup daily workspace at half TrendSpider's price.

## The buyer panel

**11 buy · 9 pass** (55% buy) out of 20 simulated buyers. Seed 7, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Systematic / semi-pro trader ($150k+ account) | 4 | 75%  (thin) |
| Part-time salaried swing trader ($10k-$50k account) | 9 | 67% |
| Active side-hustle trader ($50k-$150k account) | 7 | 29%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Evidence skeptic | 4 | 100%  (thin) |
| Tools hopper | 2 | 100%  (thin) |
| Time-strapped prep trader | 4 | 75%  (thin) |
| TradingView / Finviz loyalist | 5 | 40%  (thin) |
| Review & community checker | 2 | 0%  (thin) |
| Cost-cutter / DIY tinkerer | 3 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| under $105,000 | 6 | 83%  (thin) |
| $171,000 and up | 7 | 57%  (thin) |
| $105,000 to $171,000 | 7 | 29%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| need | 3 | "Even at $29 a month, I already scan in thinkorswim Stock Hacker for free and maintain my TradingView Plus setup, so I do not need another charting subscription." (P003) · "Even with a licensed feed and public shadow ledger, I already enjoy maintaining my own thinkorswim Stock Hacker scans and Python scripts at zero software cost." (P015) |
| habit | 3 | "$29 a month and a one-click refund are fair, yet I already know TradingView Plus inside out and do not want to migrate my workflow unless TradingView stops serving me." (P005) · "Moving to a licensed commercial feed fixes my delayed-quote objection, yet I am deeply used to my TradingView Plus charts and spreadsheet and prefer not to switch mid-quarter." (P011) |
| trust | 2 | "The 14-day no-card shadow ledger preview is a big improvement, but after getting burned last quarter I still wait until there are real independent discussions on r/swingtrading and Trustpilot." (P002) · "A licensed market-data feed and 14-day no-card preview look serious, but I still do not enter billing details on any trading SaaS until real users review it on Trustpilot and Reddit." (P013) |
| price | 1 | "The $29/mo Nightly Watchlist tier is close, yet with my $67k salary and $35/mo TradingView Plus plan I cannot carry both subscriptions unless I cancel TradingView completely." (P014) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| convenience | 6 | "Focusing the experience into a single 10-minute Today screen on a licensed commercial feed for $29 founding ($39 regular) makes this an immediate yes to try alongside my engineering job." (P007) · "The $29/mo Nightly Watchlist plan matches my budget and evening routine, and moving to a licensed commercial feed removes my worry about stale Yahoo quotes." (P008) |
| trust | 3 | "Opening a 14-day no-card preview of the 5-year methodology and live 60-day anti-lookahead shadow ledger lets me verify real R-outcomes net of slippage before paying $29 to $39 a month." (P001) · "Inspecting a 60-day anti-lookahead shadow ledger net of slippage with no card upfront addresses my biggest doubt, and $29 founding / $39 regular on a licensed feed is trivial for my $150k+ account if the math checks out." (P004) |
| price | 2 | "Having a $29/mo Nightly Watchlist tier, a 14-day no-card shadow ledger preview, and a 30-day one-click guarantee removes the risk for my $10k-$50k account and undercuts Finviz Elite." (P006) · "Offering a 14-day no-card preview of the shadow ledger, a $29/mo Nightly Watchlist option, and a 30-day one-click refund eliminates my risk after losing money on an alert group." (P012) |

### What would flip a no

- See 20+ independent user reviews from real subscribers after the founding cohort completes 60 days.
- Offer an EOD email/journal-only plan under $19/mo or direct Schwab order routing.
- Verify in the 14-day preview that the Stage-2 shortlist lets me downgrade TradingView Plus back to Basic.
- Have TradingView Plus raise prices again or let me test a 30-day parallel run cleanly.
- Show verified Trustpilot reviews and public Reddit discussions after the founding cohort runs 60 days.
- Verify in the free 14-day preview that the built-in charts cover my needs so I can downgrade TradingView to free.
- Include direct historical point-in-time CSV/API exports of S&P 500 + EDGAR clusters under $39/mo.
- Show how a single 10-minute morning checklist replaces both Finviz and my spreadsheet.
- Include clean JSON webhook/API access in Swing Pro instead of gating developer tools higher.

Buyers say they would buy **1.0 times** in the first month on average.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

_Simulated buyer answers from `founder/pricing-curve.md` pick the candidate price band to test; real checkout tests confirm willingness to pay._

---

### 1. Recommended Price: **$39.00 / month** (Flagship *Swing Pro*)
- **Where it sits on Van Westendorp (`founder/pricing-curve.md`)**:
  - `PMC` (too cheap ceiling): **$18.98**
  - `OPP` (least resistance): **$19.12**
  - `IPP` (bargain = expensive): **$34.07**
  - `PME` (too expensive wall): **$49.02**
  - Our initial `$49.00/mo` hypothesis sat **0.02 below the PME wall ($49.02)** — causing 6 of 17 passes directly on price. Dropping flagship *Swing Pro* to **$39.00/mo** puts it comfortably inside the acceptable band (`$18.98–$49.02`), near the `$34.07` indifference point while protecting SaaS data-licensing margins.
- **Against Competitors (`founder/competitors.md`)**:
  - Undercuts **Finviz Elite** (`$39.50/mo`), **LuxAlgo Premium** (`$39.99/mo`), **Unusual Whales** (`$50.00/mo`), **TradeZella Pro** (`$59.00/mo`), and **TrendSpider Elite** (`$89.00/mo`, more than 2× higher), while sitting right alongside **TradingView Plus** (`$34.95/mo`) with a complete pre-market Stage-2 + Divergence + Shadow Ledger workflow built in.
- **CFO Margin Check (`unit_economics.py` across 3 candidate prices)**:
  - At **$29.00/mo**: Contribution `$25.81` (`89%`), Profit margin at plan `74%`, Year-1 operating profit `$20,993` (payback Month 4).
  - At **$39.00/mo**: Contribution **`$35.81` (`92%`)**, Profit margin at plan **`81%`**, Year-1 operating profit **`$32,093`** (payback Month 3, ~18 subscribers/mo break-even).
  - At **$49.00/mo**: Contribution `$45.81` (`93%`), Profit margin at plan `85%`, Year-1 operating profit `$43,193` (but suffered an 85% pass rate on the buyer panel).

---

### 2. The Price Ladder (Good / Better / Best)

| Tier | Monthly Price | Annual Equivalent | Target Buyer & Why Step Up |
| --- | ---: | ---: | --- |
| **Good — Nightly Watchlist** | **$29/mo** | **$24/mo** (`$288/yr`) | **For `$10k–$50k` salaried swing traders** checking charts after 16:00 ET. Includes daily EOD S&P 500 Stage 2 + MACD Triple Divergence ranked shortlist, Regime breadth, immutable `Levels`, and Trade Journal. *(Hits the exact `$25–$29/mo` EOD threshold requested by 7 passing panelists.)* |
| **Better — Swing Pro** *(Flagship)* | **$39/mo** | **$32/mo** (`$384/yr`) | **Step up for**: Licensed commercial intraday watchlist monitoring (eliminates Yahoo 10–20m delay), Telegram/Webhook alerts, full **Shadow Signal Ledger (`X1`/`X2`/`X3`)**, SEC EDGAR Form 4/13F filings, and CBOE VIX/GEX context. |
| **Best — Quant Desk & Daemon** | **$69/mo** | **$57/mo** (`$684/yr`) | **Step up for**: `$150k+` systematic traders needing `sp500_ndx100` expanded universe scanning, downloadable standalone Python 24/7 daemon/API token access, and full CSV/JSON shadow outcome exports. |

_No metered AI credit upsells, no surprise script paywalls, and a transparent one-click cancel inside Account Settings._

---

### 3. Opening Offer (Time-Boxed, No Fake Anchors)
- **Founding Member Launch Rate**: Lock **$29/mo for your first 3 months on Swing Pro** (regular published monthly rate `$39/mo` starting Month 4), **open strictly for 14 days from launch date (T+0 to T+14) or the first 50 founding seats**, paired with a **14-day no-card-required read-only shadow ledger preview + 30-day unconditional money-back guarantee on Month 1**.
- **Rule**: Never invent a fake "$99/mo value" crossed-out anchor; show the real `$39/mo` published Swing Pro price and the real 3-month founding cohort discount.

---

### 4. Real-World Price Test Plan
Run a two-week landing-page A/B split test on paid search / newsletter traffic **before** committing to commercial annual contracts:
- **Variant A**: `$29/mo` Nightly Watchlist + `$39/mo` Swing Pro
- **Variant B**: `$39/mo` single-plan Swing Pro (with 14-day guided trial)
- **Success metric**: Track **paid checkout rate × Day-45 retention** (net revenue per 1,000 landing-page visits), not raw email clicks. Only scale ad spend if net revenue per visitor clears CAC payback inside 60 days.

---

### 5. Top 3 Verbatim Price Objections from the Panel (`founder/panel/results.md`)
1. *"At $49 a month on top of my TradingView plan, it is too expensive for a $10k-$50k swing account when I can code basic divergence and Stage filters in Pine Script."* (`P005`)
2. *"Almost $600 a year eats a big chunk of a smaller swing account, and without real backtest proof I am not paying more than Finviz Elite."* (`P006`)
3. *"Paying $49/mo for delayed public market data feels off when free screeners already show delayed prices."* (`P008`)

## The offer

_Built using the Offers lens (`founder/board/lenses.md`) on top of `founder/panel-v1/results.md`, `founder/competitors.md`, `founder/numbers.json`, and `founder/board.md`._

---

### 1. The Problem List (18 Obstacles in the Buyer's Words)

#### Before Buying (Trust, Price & Tool Fatigue)
1. *"I got burned last quarter by an unverified options Discord alert group—every tool claims an edge with zero proof."*
2. *"I don't know if MACD Triple Divergence + Weinstein Stage 2 actually beats SPY over 5 years after slippage."*
3. *"$49/month on top of my $35/month TradingView Plus eats into a $10k–$50k account."*
4. *"Are you charging SaaS prices for free 10–20 minute delayed Yahoo Finance data?"*
5. *"I don't want to hand over my credit card only to get trapped by an auto-renewal like I read on Trustpilot."*
6. *"I'm tired of paying for features that get moved behind higher tiers or metered AI credits later."*
7. *"I already spend $125+/mo juggling a screener, charting app, and trade journal spreadsheet."*

#### During Use (Time, Clutter & Execution Friction)
8. *"I work a full-time engineering or finance job during market hours—I can't watch 500 tickers all day."*
9. *"I only have 15–20 minutes after 16:00 ET or before the 09:30 ET open to build my watchlist."*
10. *"Eight separate workspace tabs overwhelm me; I just want today's actionable shortlist and invalidation prices."*
11. *"Unfiltered options flow and intraday scanners throw dozens of noisy alerts that bait me into chasing."*
12. *"Calculating ATR stop losses, risk-per-trade, and R-multiples manually in a spreadsheet takes too long."*
13. *"Moving years of historical trades out of Excel or TradingView into a new journal feels painful."*

#### After Buying / Retention (Accountability & Proof)
14. *"How do I know if a bad month is market regime Chop vs. a broken setup rule?"*
15. *"Most journals only track trades I actually took—they never audit the setups I skipped or got stopped out of."*
16. *"If I forget to check the macro calendar or NYSE half-day schedule, I take trades into choppy or closed conditions."*
17. *"What if I try it for three weeks and realize I still prefer my old TradingView routine?"*
18. *"If I'm trading a smaller $15k account EOD, I don't need expensive intraday bells and whistles."*

---

### 2. Trimmed & Stacked Solutions

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

### 3. The Offer Stack

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

### 4. Value Equation Score (Before vs. After, 1–10)

| Dimension | Pitch v1 (`$49/mo`) | Pitch v2 (Stacked Offer) | What Moved the Score |
| --- | :---: | :---: | --- |
| **Dream Outcome** *(higher = better)* | 6 | **8** | Reframed from "all-in-one 500-stock terminal" to "10-minute pre-market swing readiness + verifiable R-ledger." |
| **Perceived Likelihood of Achievement** *(higher = better)* | 3 | **8** | Added licensed commercial feed (no Yahoo lag), 14-day no-card preview, open 60-day Shadow Ledger vs. SPY, and 30-day one-click guarantee. |
| **Time Delay** *(higher = better / shorter wait)* | 5 | **8** | Cut multi-tab hunting to an 08:30 ET Telegram shortlist + 1-click CSV journal import in minutes. |
| **Effort & Sacrifice** *(higher = better / less friction)* | 4 | **8** | Separated `$29/mo` Nightly Watchlist tier, removed credit-card wall on preview, and tucked 8 secondary tabs behind `Today`. |

---

### 5. Re-Test on Buyer Panel (`--n 20 --seed 7`, Same Persona Cards)

| Metric | Pitch v1 (`founder/panel-v1/results.md`) | Pitch v2 (`founder/panel/results.md`) | Change |
| --- | ---: | ---: | ---: |
| **Simulated Buy Rate** | **15%** (`3 buy · 17 pass`) | **55%** (`11 buy · 9 pass`) | **+40 pts (+8 buyers)** |
| **Price Objections (`reason_code: price`)** | 6 passes | **1 pass** | **-5 passes** |
| **Trust Objections (`reason_code: trust`)** | 6 passes | **2 passes** *(Review checkers waiting for external Trustpilot/Reddit reviews)* | **-4 passes** |
| **Systematic ($150k+) Buy Rate** | 25% (`1/4`) | **75%** (`3/4`) | **+50 pts** |
| **Part-Time Salaried ($10k–$50k) Buy Rate** | 22% (`2/9`) | **67%** (`6/9`) | **+45 pts** |

_Simulation disclosure: All 20 buyers were evaluated in-session against identical `seed 7` persona briefs (`founder/panel/briefs/`). Simulated LLM buyers represent an upper-bound diagnostic signal, never real customer conversion proof; the remaining 9 passes show real structural friction among DIY `thinkorswim`/`yfinance` coders (3), sticky TradingView loyalists (3), external review checkers (2), and tight dual-subscription budgets (1)._

## The numbers

### The CFO's note
- **The margin**: At **$39.00/mo**, each subscriber-month leaves **$35.81** (`92%` contribution margin) after Stripe card fees (`$1.43`), alert/MAU metering (`$0.20`), and a 4% refund reserve (`$1.56`). At planned steady volume (`5/day` = `150` active subscribers/month across 30 days), the net operating margin is **81%** after all **$638/mo** fixed costs (exact break-even = **18 active subscribers/mo**, rounded to `1/day` by the tool). *Note: Excludes a full-time founder market salary; assumes solo founder draws profit after break-even.*
- **The line to watch**: **Subscriber acquisition ramp & commercial market-data licensing (`$250/mo` Tiingo vs. `$499/mo` Twelve Data Venture)**. If Year-1 volume lands at half of plan (`--volume 0.5`, ramping from 15 to 75 subscribers), Months 1–2 lose `-$101/mo`, Year-1 operating profit drops from **$32,093** to **$12,219**, payback pushes from Month 3 to Month 6, and cash required rises from **$1,700** to **$1,902**. If Twelve Data Venture (`$499/mo`) is required instead of Tiingo Startup (`$250/mo`), fixed costs rise to `$887/mo` and Year-1 profit moves to **$29,105** (still profitable, payback Month 4).
- **Cash**: You need **$1,700** before the business pays for itself (`$1,902` in the 50%-volume downside case), well inside the `$3,000` bootstrap working reserve.
- **Three ways to improve the margin (verified with `unit_economics.py`)**:
  1. **Add the `$69/mo` Quant Desk & Daemon tier to lift blended ARPU (`--price 44` vs `--price 34` Founding blend)**: Raising realized ARPU from the `$34` Founding Cohort/Nightly mix (`$26,543` Year-1 profit, `78%` plan margin) back to `$39` adds **`+$5,550`** in Year-1 profit and `+3 pts` margin.
  2. **Offer annual prepay (`$384/yr`, `$32/mo` effective) on 25% of subscribers**: Eliminates 11 extra `$0.30` Stripe per-charge fixed fees per user per year and cuts involuntary churn—locking Year-1 cash ahead of the `$250/mo` Tiingo API bill.
  3. **Gate commercial Twelve Data (`$499/mo`) or Polygon Business (`$2,499/mo`) upgrades behind subscriber milestones**: Stay on Tiingo Startup Redistribution (`$250/mo`) until passing 100 active subscribers (`~$3,581/mo` contribution), saving `$2,988/yr` vs Twelve Data Venture (`$29,105` vs `$32,093` Year-1 profit) and protecting bootstrap cash.
- **Board financial conditions (`founder/board.md` C3)**: **Met conditionally**—commercial data licensing (`$250/mo` Tiingo) and hosted worker persistence (`$43/mo` Supabase Pro + Fly.io) fit comfortably inside `$638/mo` fixed costs with a `92%` contribution margin and 18-subscriber break-even, **provided** you obtain a written Tiingo/Twelve Data startup commercial quote before signing annual contracts.
- **Tax & accounting note**: All revenue is **before sales tax / US state SaaS tax / EU-UK VAT** (which Stripe Tax collects on top of `$29/$39/$69` where nexus applies). _Not financial, tax, or legal advice: have an accountant check entity structure, payroll/owner-draw taxes, and SaaS sales-tax/VAT obligations before accepting live payments._

Every number below comes from the input file (`founder/numbers.json`). Nothing is looked up or guessed.

### One subscriber-month

| line | per subscriber-month |
| --- | ---: |
| Price | $39.00 |
| Stripe processing (2.9% + $0.30) | -$1.43 |
| Alert delivery & DB MAU metering (est.) | -$0.20 |
| 30-day guarantee / refund reserve (4% est.) | -$1.56 |
| **Contribution** (what each subscriber-month leaves to pay the fixed costs) | **$35.81** (92%) |

### The margin that matters

Fixed costs: $638 a month (Tiingo Startup Redistribution data API $250, Supabase Pro (Postgres + Auth + Cron) $25, Fly.io worker & web app hosting $18, Email / domain / error monitoring (est.) $20, Content & creator marketing budget (est.) $250, Bookkeeping & compliance reserve (est.) $75).

- **Break-even: 1 subscriber-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (5 a day): **81%** of every sale, after every cost.
- Capacity: 33 a day.

### Year 1, month by month

| month | subscriber-months a day | revenue | profit | cumulative (after $1,700 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | $1,170 | $436 | -$1,264 |
| 2 | 1 | $1,170 | $436 | -$827 |
| 3 | 2 | $2,340 | $1,511 | $683 |
| 4 | 2 | $2,340 | $1,511 | $2,194 |
| 5 | 3 | $3,510 | $2,585 | $4,779 |
| 6 | 3 | $3,510 | $2,585 | $7,364 |
| 7 | 3 | $3,510 | $2,585 | $9,948 |
| 8 | 4 | $4,680 | $3,659 | $13,608 |
| 9 | 4 | $4,680 | $3,659 | $17,267 |
| 10 | 4 | $4,680 | $3,659 | $20,926 |
| 11 | 5 | $5,850 | $4,734 | $25,660 |
| 12 | 5 | $5,850 | $4,734 | $30,393 |

- **Year 1 operating profit: $32,093** on $43,290 of revenue.
- After the $1,700 startup spend: $30,393.
- Startup money earned back: month 3.
- Cash you need before it pays for itself: **$1,700**.

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 81% | 1 | $32,093 |
| Price -10% | 79% | 1 | $27,764 |
| Volume -20% | 78% | 1 | $24,143 |
| Unit costs +15% | 80% | 1 | $31,562 |

No red flags in these numbers. They are only as good as the inputs: check every cost against a real quote.

## Marketing

_Grounded in `founder/panel/results.md` (55% simulated buy rate on Pitch v2), `founder/competitors.md`, `founder/pricing.md`, `founder/offer.md`, and `founder/cfo.md`. Today: **2026-11-17**; Target Launch Day (`T`): **2026-12-15**._

---

### 1. Positioning Options (Recommended First)

1. **Recommended — Pre-Market Workflow & Audit Positioning** *(backed by 100% v2 buy rate in `Evidence skeptic` [4/4], 75% in `Time-strapped prep trader` [3/4], and 75% in `Systematic $150k+` [3/4])*:
   > *For time-strapped US stock and options swing traders who spend hours scanning 500 tickers around a day job and distrust black-box alert groups, Trullàs Scanner is the pre-market swing-readiness terminal that pairs S&P 500 Stan Weinstein Stage 2 + MACD Triple Divergence setups with an open, anti-lookahead Shadow Signal Ledger (X1/X2/X3) and fail-closed NYSE risk rules, unlike noisy DIY scanners like Finviz or expensive toolkits like TrendSpider ($89/mo).*
2. **Option B — Consolidate & Save Stack Positioning** *(targets `$10k–$50k` accounts passing on dual subscriptions)*:
   > *For part-time swing traders tired of paying $35–$125/mo across Finviz, TradingView, and spreadsheet journals, Trullàs Scanner is the $29–$39/mo swing prep workspace that puts Stage 2 filtering, invalidation levels, and R-multiple journaling in one Today view, unlike fragmented charting apps.*
3. **Option C — Quantitative Verification Positioning** *(niche systematic wedge aligned with Monopoly lens)*:
   > *For systematic US equities traders who refuse any indicator without out-of-sample proof, Trullàs Scanner is the deterministic rule engine that audits every triggered and regime-skipped signal net of slippage in a public 60-day shadow ledger, unlike black-box indicator overlays like LuxAlgo.*

---

### 2. Launch Channels (Pick 3 to Start; What We Exclude)

| Channel | Why It Fits This Buyer | Initial Budget Share | How We Know It Worked (Target Bar) |
| --- | --- | ---: | --- |
| **1. X (Twitter) + YouTube Walk-Throughs (Public Shadow Audit Series)** | Active US swing traders (`$50k–$250k` accounts) follow daily Weinstein Stage 2, breadth, and R-multiple charts on X/YouTube after the 16:00 ET close. Directly cures `P002`/`P013` skepticism over months. | **$50/mo** *(screen-record / domain tools)* | **>= 120 click-throughs/week** to the open 60-day Shadow Ledger & **>= 12% 14-day preview signups**. |
| **2. High-Intent Search & Comparison Pages (`"TrendSpider alternative"`, `"Finviz Elite alternative"`, `"Stan Weinstein Stage 2 scanner"`)** | Captures buyers actively frustrated by TradingView paywalls, TrendSpider `$89/mo` pricing, and Finviz clunky charts (`founder/competitors.md`). | **$350 startup test + $150/mo** *(Google Search exact-match)* | **CPC <= $2.50**, **Preview-to-paid >= 15%**, blended **CAC <= $45/paid subscriber**. |
| **3. Substack / Swing-Trading Newsletter Sponsorships & Referral Founding Cohort** | Time-strapped salaried traders (`P007`, `P010`, `P020`) read morning/weekend US market newsletters before the NY bell. | **$150 startup test + $100/mo** *(small 5k–25k sub quant newsletters)* | **>= 8 paid Founding Cohort signups** per `$150` sponsorship placement (`<= $20–$35 CAC`). |

**What we are NOT doing (and why):**
- **No broad Meta/Instagram/TikTok "make money trading" ads**: Attracts low-intent signal chasers, violates ad compliance risk, and explodes CAC above `$35.81` contribution.
- **No Discord/Telegram cold DM spam or influencer hype**: Directly triggers the #1 panel trauma (*"burned last quarter by an unverified Discord alert group"*).
- **No app-store mobile app push**: Panel buyers check setups at a desk after 16:00 ET or 20 minutes before 09:30 ET.

---

### 3. Ten Marketing Hooks (Answering Specific Panel Objections)

_Note: All hooks cite product mechanics and public competitor prices—never simulated panel quotes as customer testimonials._

1. **Objection: Black-box alert scams (`P002`, `P009`)** *(YouTube/X 3-sec hook)*:
   > *"Don't trust any scanner that hides its missed trades. Here is every signal our engine fired—and skipped—over the past 60 days, net of slippage."*
2. **Objection: Unproven multi-year edge (`P001`, `P004`)** *(Landing Hero / X)*:
   > *"Inspect our 5-year Stage 2 + MACD Triple Divergence methodology and live X1/X2/X3 shadow outcomes vs. SPY before you ever enter a card."*
3. **Objection: `$89/mo` TrendSpider / `$125+` multi-tool cost (`P005`, `P006`)** *(Search Ad Headline)*:
   > *"Stage 2 Scans + Levels + Trade Journal for $29–$39/mo — Half the Price of TrendSpider, Zero Per-Script Paywalls."*
4. **Objection: Delayed Yahoo Finance scraping (`P008`, `P018`)** *(Comparison Page Header)*:
   > *"Tired of scanners wrapping delayed free feeds? Swing Pro runs on a licensed commercial market-data API—with data freshness stamped on every panel."*
5. **Objection: Working full-time during NYSE hours (`P007`, `P010`, `P020`)** *(Substack Sponsor Copy)*:
   > *"Work 9-to-5? Review S&P 500 regime breadth, Form 4 insider clusters, and 15 invalidation-priced setups in 10 minutes before the 09:30 ET bell."*
6. **Objection: Auto-renewal & refund traps (`P001`, `P012`, `P016`)** *(Checkout Sub-head)*:
   > *"14-day preview with no credit card. One-click cancel and a 30-day unconditional refund button inside Settings—no support tickets."*
7. **Objection: Messy 8-tab complexity (`P007`, `P019`)** *(Product Demo Video Hook)*:
   > *"Five hundred stocks narrowed to one Today screen: Regime Score, Stage 2 watchlist, ATR stop box, and nothing else."*
8. **Objection: Spreadsheet migration fatigue (`P016`, `P019`)** *(Onboarding Banner)*:
   > *"Upload your broker or Excel CSV in 30 seconds and get instant R-multiple, MFE/MAE, and session-heatmap attribution."*
9. **Objection: Smaller `$10k–$50k` account cost drag (`P006`, `P008`, `P014`)** *(Pricing Tier Hook)*:
   > *"Only scan after the 16:00 ET close? Get the Nightly Watchlist + Journal tier for $29/mo—don't pay for intraday tools you can't watch at work."*
10. **Objection: Blindly trading into choppy/closed sessions (`P004`, `Master Plan`)** *(X Thread Opener)*:
    > *"Our risk gate blocks trades automatically when NYSE is closed, data goes stale, or market breadth flips Risk-Off. Discipline shouldn't rely on willpower."*

---

### 4. Dated 30-Day Launch Campaign (`T-14 = 2026-12-01` to `T+16 = 2026-12-31`)

**Launch-Week Offer (`founder/pricing.md`)**: **Founding Cohort Rate — $29/mo for the first 3 months of Swing Pro** (regular `$39/mo` Month 4+; Nightly Watchlist `$29/mo`), capped at **50 seats or strictly ending 2026-12-29 (T+14)**, with a **14-day no-card Shadow Ledger preview**.

**What to post on quiet days (no new feature news)**:
- *Daily 17:45 ET (`5-min` X post)*: Market Regime Score breakdown (5 components) + # of S&P 500 stocks in Stage 2 vs. Stage 4 today.
- *Wednesday Post-Mortem*: One Shadow Signal from last month that hit stop-loss—walking through why the ATR/structure invalidation capped loss at `-1.0R`.
- *Weekend Build Log*: Behind-the-scenes comparison of `X1_fixed` vs `X2_trail` capture efficiency (`MFE - R realized`) from the shadow database.

| Date | Day | Channel | Asset / Message |
| --- | --- | --- | --- |
| **2026-12-01** | T-14 | X + YouTube | Publish `Spike E` & `Spike R` methodology breakdown + open the free read-only **60-Day Shadow Signal Ledger** (`P001`/`P009` trust builder). |
| **2026-12-02** | T-13 | Waitlist Email #1 | "Why we cut 8 messy screens down to one 10-minute `Today` view" + Founding Cohort waitlist early access notice. |
| **2026-12-03** | T-12 | X Thread | Tear-down: "Why 90% of scanners hide skipped signals (and how `v_signal_alpha` tests rules vs. random SPY entry)." |
| **2026-12-04** | T-11 | Site / Blog | Publish comparison page: *Trullàs vs. Finviz Elite & TrendSpider ($29–$39 vs. $39.50–$89)* — zero metered AI credits. |
| **2026-12-05** | T-10 | YouTube Short (60s) | Screen recording: "From 503 S&P 500 tickers to 12 Stage-2 Divergence setups with stop boxes in 90 seconds." |
| **2026-12-06** | T-9 | X | Sunday weekly prep checklist for salaried traders: 30-min Sunday RRG sector rotation + Regime band sizing rules. |
| **2026-12-07** | T-8 | Search Ads (Soft Test) | Launch `$15/day` exact-match test (`"Stan Weinstein scanner"`, `"TrendSpider alternative"`) pointing to no-card 14-day preview. |
| **2026-12-08** | T-7 | Substack Sponsor #1 | First small quant/swing newsletter placement inviting readers to the 14-day no-card Shadow Ledger preview. |
| **2026-12-09** | T-6 | X | Show `canTrade()` NYSE fail-closed gate & live data-quality timestamps ("never trade on stale/closed-session feeds"). |
| **2026-12-10** | T-5 | Waitlist Email #2 | "1-Click CSV Import demo + Pricing transparency ($29 Nightly / $39 Pro / Founding $29×3mo opens Dec 15)." |
| **2026-12-11** | T-4 | X | SEC EDGAR Form 4 cluster + Stage 2 case study (factual walkthrough of a past setup, no forward return promises). |
| **2026-12-12** | T-3 | YouTube | 8-minute "Before-the-Bell Workflow" walkthrough featuring real licensed-feed speed vs. delayed public tickers. |
| **2026-12-13** | T-2 | X | Sunday prep: Live preview of Monday's Regime Score + open invitation to Founding Cohort launch Tuesday 08:00 ET. |
| **2026-12-14** | T-1 | Waitlist Email #3 | Tomorrow 08:00 ET: Founding Cohort opens (`$29/mo` for 3 months of Swing Pro, capped at 50 seats or Dec 29; 30-day 1-click refund). |
| **2026-12-15** | **T (Launch)** | All Channels | **Public Launch 08:00 ET**: Open Founding Cohort checkout + 14-day no-card preview live; pinned X walkthrough + Search Ads A/B (`$29` vs `$39`). |
| **2026-12-16** | T+1 | X + Email | Day-1 Shadow Ledger update + live onboarding walkthrough ("Set up your 08:30 ET Telegram shortlist in 3 minutes"). |
| **2026-12-17** | T+2 | X | Transparent "First 48 hours of Launch" metric & signal recap (including stopped-out shadow signals). |
| **2026-12-18** | T+3 | Substack Sponsor #2 | Second swing-newsletter placement highlighting the `$29/mo` Nightly Watchlist tier for part-time `$10k–$50k` accounts. |
| **2026-12-19** | T+4 | Search Ads | Pause lowest-CTR keyword; shift budget to highest preview-to-signup exact-match keywords (`$29 vs $39` A/B check). |
| **2026-12-20** | T+5 | X + YouTube | Weekly `X1` vs `X2` vs `X3` exit efficiency breakdown from the live database. |
| **2026-12-21** | T+6 | In-App / Email | 7-day onboarding check-in to preview users: "Did you import your CSV journal yet? Need a walkthrough?" |
| **2026-12-22** | T+7 | X | Case study: How Regime Band (`Risk-Off` / `Neutral`) throttled position size automatically during volatile VIX spikes. |
| **2026-12-23** | T+8 | Search + Blog | Publish "Why TradingView + Excel costs more time than a single deterministic R-multiple workspace." |
| **2026-12-24** | T+9 | X (Short Holiday Session) | Holiday-hours notice showing `canTrade()` handling NYSE Christmas Eve 13:00 ET early close automatically. |
| **2026-12-25** | T+10 | Quiet Build Post | Zero market spam; publish year-end Engineering Changelog & data-integrity spec. |
| **2026-12-26** | T+11 | Waitlist Email #4 | "4 days left on the Founding Swing Pro Cohort ($29/mo × 3 months ends Dec 29)" — factual seat/date reminder. |
| **2026-12-27** | T+12 | X + YouTube | Sunday Sector RRG + Stage 2 breadth outlook for final trading week of 2026. |
| **2026-12-28** | T+13 | Email + X | "Final 24 hours for Founding `$29/mo × 3 mo` Swing Pro rate (switches to standard `$39/mo` tomorrow at 23:59 ET)." |
| **2026-12-29** | **T+14** | Email + Site | **Close Founding Cohort Offer at 23:59 ET**; switch all Swing Pro checkouts strictly to `$39/mo` (Nightly `$29/mo`). |
| **2026-12-30** | T+15 | X | Publish full December Shadow Signal Ledger scorecard (`n`, win rate, net R, `CI90`) with zero cherry-picking. |
| **2026-12-31** | T+16 | Internal + Public | Publish Month-1 real user feedback summary & invite Founding Cohort reviews on Trustpilot (`P002`/`P013` unlock). |

---

### 5. Budget Split & Maximum Allowable CAC

- **Startup launch ad test (`$500` in `founder/numbers.json`)**:
  - `$350` Google Search exact-match comparison & Weinstein keywords (A/B pricing test)
  - `$150` 1–2 targeted Substack swing-trading newsletter placements
- **Ongoing monthly budget (`$250/mo` in `founder/numbers.json`)**:
  - `$150/mo` High-intent Search (`60%`)
  - `$100/mo` Newsletter sponsorships / YouTube breakdown production tools (`40%`)
- **Max Allowable CAC (from `founder/cfo.md` & `founder/panel/results.md`)**:
  - Contribution per `$39/mo` Swing Pro subscriber-month: **`$35.81`** (`$25.81` on `$29/mo` Nightly Watchlist).
  - Panel first-month purchases: **`1.0`** (`$35.81` Month-1 cash contribution).
  - **Month-1 Payback CAC Cap**: **`$35.81`** (instant payback in Month 1).
  - **Conservative 4-Month Retention Ceiling (`4 × $35.81 = $143.24` LTV contribution at a 3:1 LTV:CAC floor)**: **`$47.75` maximum allowable CAC** (Target operating ceiling: **`<= $40/paid subscriber`**).

---

### 6. Weekly Metrics to Watch (and Change Triggers)

| Weekly Metric | Healthy Target | Red-Flag Trigger ("Change Something Immediately") | Action When Triggered |
| --- | --- | --- | --- |
| **1. Cost per 14-Day Preview Signup** | `<= $12` | **`> $20`** for 2 consecutive weeks | Pause highest-CPC Search keywords; rewrite top landing headline using winning organic X hook. |
| **2. Preview-to-Paid Conversion Rate** | `>= 18%` *(conservative vs. 55% sim)* | **`< 10%`** after 30+ previews | Inspect where trial users drop off in `Today` / `Shadow Ledger`; simplify onboarding or lead with `$29` Nightly Watchlist. |
| **3. Month-1 Refund + Churn Rate** | `<= 12%` monthly churn (`<= 4%` refund) | **Refunds `> 8%`** or **Month-1 churn `> 20%`** | Interview every canceling user via 1-question exit prompt; fix data/alert friction before buying more traffic. |

_Compliance & Truth Note: Panel results inform hooks and objections only—never use simulated buyer quotes in ads. Every marketing claim must include an explicit "analytical software only, not investment advice" disclosure and never imply guaranteed returns._

## Brand

_Grounded in `founder/idea.md`, `founder/marketing.md` (Recommended Positioning: pre-market swing readiness + verifiable shadow ledger), `founder/competitors.md`, and `founder/panel/results.md`. Trademark checks below reflect public web searches on **2026-11-17**—not legal advice; a trademark attorney and registrar checkout confirm final availability._

---

### 1. Ten Name Candidates (Across 5 Styles)

| # | Candidate | Style | What It Says | Sound Out Loud | App Icon / 32px Sign | Risk / Public Check |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **StageLedger** | Descriptive + Evocative | Weinstein market *stages* + auditable *shadow ledger* | Crisp 3 syllables ("Stage-Led-ger") | Reads `SL` monogram cleanly | **Low trading conflict**: public search shows construction scaffolding ("stage ledger"), no mainstream trading SaaS—avoid *ShadowLedger* (`shadowledger.app` exists for trading journals). |
| 2 | **ClearStage** | Descriptive | Uncluttered Stage 2 swing readiness before the bell | Clear 2 words ("Clear-Stage") | Reads `CS` badge cleanly | **Low-Moderate**: verify SaaS overlap in Class 42 (often used in event/software staging). |
| 3 | **Trullàs Desk** | Founder's Name | Direct continuation of the *Trullàs Divergence* codebase | Diacritic `à` causes US spelling friction ("Tru-yas" vs "Trul-las") | `TD` mark works well | **High IP/Name Risk unless licensed**: public search confirms **David Trullàs** is an active trader/educator teaching MACD/RSI setups. Only use if founder IS or holds a written license from David Trullàs. |
| 4 | **OpenGate Quant** | Descriptive | Transparent rules + fail-closed `canTrade()` session gate | Punchy, technical | `OG` clean geometric gate | Moderate confusion with OpenGate Capital (finance/PE, Class 36). |
| 5 | **TenBefore** | Evocative (Time) | "10 minutes before the open" workflow promise | Memorable 3 syllables | `10B` compact icon | Doesn't signal equities/swing trading on its own; needs strong tagline. |
| 6 | **BreadthLine** | Descriptive | Regime breadth + Stage trendlines + invalidation line | Clear, trader-native | Waveform + horizon line | Narrowly sounds like a breadth-only indicator rather than a full terminal. |
| 7 | **RigorTape** | Evocative | Institutional tape discipline + statistical R-rigor | Crisp, distinct | Split bar + tick mark | Slightly old-school ("ticker tape" day-trading vibe vs swing trading). |
| 8 | **VerveQuant** | Invented / Abstract | Invented fintech sound | Easy to say | Generic `VQ` | Sounds generic / AI-hype adjacent; contradicts anti-hype brand voice. |
| 9 | **DivergeLab** | Descriptive | Signal lab built around MACD Triple Divergence | Technical, clear | `DL` works at 32px | Anchors only on MACD divergence and risks sounding like an experiment vs daily tool. |
| 10 | **LibertyBell Brief** | Place (NYSE/NY) | Pre-market New York opening prep | Too long for icon | Needs `LBB` initials | Sounds like a political newsletter rather than quant software. |

---

### 2. Shortlist of 3 & Verification Checklist

1. **Recommended Primary Brand: `StageLedger`** *(eliminates personal-name IP exposure if launching independently, directly names the product's two differentiators: Stan Weinstein Stages + Anti-Lookahead Shadow Ledger)*.
   - **Domain check (`2026-11-17`)**: `stageledger.com` shows no active mainstream SaaS platform in public search; verify live registrar availability for `stageledger.com` (and `.io` / `.app`) + avoid `shadowledger.app` (existing trading journal).
   - **Handles to claim/verify before launch**: `@stageledger` on X, YouTube, Instagram, TikTok (fallback: `@stageledgerhq`).
2. **Runner-Up Brand: `ClearStage`** *(emphasizes the 10-minute uncluttered `Today` workflow vs 8-tab bloat)*.
   - **Domain check (`2026-11-17`)**: `clearstage.io` shows no prominent active trading SaaS; `.com` may be parked/taken in event-tech—check registrar before committing.
   - **Handles**: `@clearstage` / `@clearstagehq`.
3. **Conditional Legacy Option: `Trullàs Desk`** *(only if owned/authorized by David Trullàs)*.
   - **Domain check**: Register both `trullasdesk.com` and `trullasscanner.com` (plain ASCII without `à`, because US buyers do not type diacritics).

#### Official Trademark Registers & Nice Classes to Search Manually Before Purchase
Check **Nice Class 9** (downloadable scanner scripts/software), **Nice Class 36** (financial market data & analytical information), and **Nice Class 42** (SaaS / non-downloadable web terminal) across every target market:
- **United States (USPTO)**: [https://www.uspto.gov/trademarks/search](https://www.uspto.gov/trademarks/search)
- **European Union (EUIPO)**: [https://euipo.europa.eu/eSearch/](https://euipo.europa.eu/eSearch/) (Classification guide: [TMclass](https://www.euipo.europa.eu/tmclass))
- **United Kingdom (UKIPO)**: [https://www.gov.uk/search-for-trademark](https://www.gov.uk/search-for-trademark)
- **Canada (CIPO)**: [https://ised-isde.canada.ca/cipo/trademark-search/srch](https://ised-isde.canada.ca/cipo/trademark-search/srch)

_Competitor clearance check (`founder/competitors.md`)_: None of `StageLedger` or `ClearStage` resemble TradingView, TrendSpider, Finviz, TC2000, Trade Ideas, MarketSurge, LuxAlgo, Unusual Whales, or TradeZella. **Internal code cleanup condition (`founder/board.md` C5)**: strip `TrendSpiderSuite`, `LuxAlgoSuite`, and `TradingWarz` names from all UI labels and docs before public launch.

---

### 3. Voice, One-Line Promise & Taglines

- **One-Line Promise**: *Every trading morning before the open, you see the exact Stage 2 setups, their pre-defined invalidation price, and an unedited ledger of how those rules actually perform.*
- **Three Tagline Options**:
  1. **"Verify the edge before you take the trade."** *(Recommended — hits `Evidence skeptic` and anti-Discord trust head-on)*
  2. **"Pre-market swing clarity in 10 minutes flat."** *(Targets salaried 9-to-5 swing traders)*
  3. **"Stage 2 setups. Transparent stops. Zero black boxes."** *(Direct contrast to indicator overlays)*
- **Brand Voice (Three Adjectives)**:
  1. **Surgical** — *Do*: state exact `n`, `CI90`, slippage bps, and `as-of` ET timestamps. *Don't*: write vague adjectives like "powerful," "institutional-grade," or "AI-supercharged."
  2. **Restrained** — *Do*: show stopped-out signals openly and label delayed feeds honestly. *Don't*: post rocket emojis, win streaks without sample sizes, or profit promises.
  3. **Respectful of Time** — *Do*: lead with the ranked shortlist and one clear invalidation price. *Don't*: bury the trader under 8 tabs or forced tutorials.
- **Pitch Line Rewrite (Before -> After)**:
  - *Before (`founder/pitch-v1.md`)*: *"Trullàs Divergence 24/7 Scanner scans all 500+ S&P 500 stocks daily for Stan Weinstein Stage 2 trends, MACD Triple Divergence setups, market regime breadth, CBOE VIX/GEX context, and SEC EDGAR filings in one web terminal."*
  - *After (On-Voice)*: *"Open StageLedger at 08:30 ET: see today's Market Regime score, up to 15 S&P 500 Stage 2 setups with pre-calculated stop levels, and an unedited 60-day shadow ledger proving every rule net of slippage."*

---

### 4. Visual Look Brief (Harmonized with Existing Dark Terminal CSS)

#### Color System (All Pairs Verified >= WCAG AAA `7.0:1` Contrast)
Preserves the existing dark terminal foundation (`#09090B` / `#18181B`) in `src/index.css` so no gratuitous redesign is needed:
- **Canvas Background**: `#09090B` (`zinc-950`) — eye-fatigue-free dark workspace.
- **Elevated Surface / Card**: `#18181B` (`zinc-900`, `1px` border `#27272A`) — separation without neon clutter.
- **Primary Signal / CTA Green**: `#10B981` (`emerald-500` CTA fills) and `#34D399` (`emerald-400` positive R/Stage-2 text).
- **Risk / Invalidated / Fail-Closed Rose**: `#FB7185` (`rose-400`) — reserved strictly for stopped-out trades, Risk-Off regimes, and closed-gate warnings.
- **Primary / Secondary Text**: `#F4F4F5` (`zinc-100`) and `#A1A1AA` (`zinc-400`).
- **Verified WCAG Contrast Ratios**:
  - `#F4F4F5` on `#09090B`: **18.10:1** (Passes AA & AAA)
  - `#F4F4F5` on `#18181B`: **16.12:1** (Passes AA & AAA)
  - `#A1A1AA` on `#09090B`: **7.76:1** (Passes AA & AAA)
  - `#34D399` on `#09090B`: **10.35:1** (Passes AA & AAA)
  - `#09090B` button text on `#10B981`: **7.84:1** (Passes AA & AAA)
  - `#FB7185` on `#09090B`: **7.39:1** (Passes AA & AAA)

#### Typography (100% Free & Open Licensed)
- **Display & UI Body**: **Inter** ([fonts.google.com/specimen/Inter](https://fonts.google.com/specimen/Inter), SIL Open Font License 1.1) — crisp tabular clarity at small sidebar/badge sizes.
- **Data, Tickers, Timestamps & R-Multiples**: **JetBrains Mono** ([fonts.google.com/specimen/JetBrains+Mono](https://fonts.google.com/specimen/JetBrains+Mono), SIL Open Font License 1.1) with `tabular-nums` so columns never jitter on live updates.

#### Logo Brief
- **Concept**: A minimalist geometric **"stepped rising stage bracket + open ledger rule"** mark inside a sharp `#18181B` square tile with a `#10B981` horizontal confirmation line—evoking Weinstein's 4 stages stepping upward into a ruled ledger line.
- **Where it must work**: 32×32px browser favicon / Telegram channel avatar, 160px navbar wordmark lockup, and monochrome white/black PDF export header.
- **What to avoid**: Bulls, bears, candlesticks on fire, green rockets, glowing neural networks/AI brains, or any visual resemblance to TradingView's cloud/TV icon or TrendSpider's web spider.

#### First Five Customer Touchpoints
1. **Homepage Hero**: Live read-only widget showing yesterday's real 5-component Regime Score + 3 sample shadow signals (with `as-of` timestamp & net R), headline *"Verify the edge before you take the trade"*, and a single **"Inspect 60-Day Shadow Ledger Free (No Card)"** CTA.
2. **14-Day Preview & Checkout Screen**: Explicit side-by-side **$29/mo Nightly Watchlist** vs **$39/mo Swing Pro (Founding $29/mo × 3 mo)**, plain-English billing date, "1-Click Cancel & 30-Day Refund inside Settings" badge, and Stripe Tax transparency.
3. **Billing Receipt Email**: Plain transactional breakdown (plan name, amount, next renewal date, direct deep link to Settings -> Manage Billing, and non-advisory software notice).
4. **First X / YouTube Post (`T-14`)**: Dark-mode chart screenshot of a real historical Stage 2 divergence setup *paired directly alongside* its matching `X1`/`X2` shadow outcome row (showing both winners and `-1.0R` stop-outs).
5. **First Refund / Complaint Reply Template**: *"Refund processed in full—no forms or retention hoops. If you have 20 seconds, was it data speed, UI clutter, or signal quality that missed the mark so we can fix it in this week's changelog?"*

## Operations

_Built from `founder/idea.md`, `founder/offer.md`, `founder/numbers.json`, `founder/cfo-sources.md`, and live repo constraints (`server.ts`, `src/index.css`, `trullas-master-plan-v3`)._

---

### 1. Daily Operating Cycle (Eastern Time / NYSE Calendar)

1. **17:30 ET — Tier-1 EOD Batch** `[INTERNAL -> CUSTOMER-VISIBLE AT 17:45 ET]`: Worker pulls closed daily/weekly bars for all 503 S&P 500 + NDX-100 symbols via licensed feed, updates Weinstein Stages, Mansfield RS, breadth, Regime Score, SEC Form 4 clusters, `SignalOutcome` (`X1`/`X2`/`X3`), and archives/refreshes tomorrow's 15-name ranked watchlist.
2. **18:00 ET — EOD Ledger Snapshot & Health Check** `[INTERNAL]`: Verify 0 rate-limit errors, check `dataQuality !== 'estimated'` for all signal rows, and publish daily X/preview Regime recap.
3. **08:00 ET — Pre-Market Readiness Check** `[INTERNAL]`: Inspect worker heartbeat, verify Tiingo/CBOE VIX/EDGAR feeds are green, check NYSE holiday/half-day calendar (`isNyseMarketOpen`), and verify zero stale prices.
4. **08:30 ET — Pre-Market Watchlist Refresh & Telegram Brief** `[CUSTOMER-VISIBLE]`: Re-check overnight gaps/earnings flags; push 10-minute Swing Prep shortlist to web `Today` view and Telegram Pro subscribers.
5. **09:30–16:00 ET — Tier-2 Watchlist & Alert Monitoring** `[CUSTOMER-VISIBLE]`: Poll **only** active watchlist + tracked symbols (`<= 60` tickers every 5 min) on Fly.io worker; evaluate `canTrade()` fail-closed gate; dispatch high-conviction divergence/invalidation webhooks; answer priority support tickets (`< 4h` SLA).
6. **16:15 ET — Market Close Support, Onboarding & Billing Triage** `[CUSTOMER-VISIBLE]`: Respond to CSV import help requests, check Stripe webhooks / 1-click refund events, and review any trial-to-paid drop-offs.

---

### 2. Infrastructure & Market-Data Suppliers (Matched to `founder/numbers.json`)

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

### 3. People & Weekly Rota

| Phase | Owner | Weekly Hours & Focus | Support SLA |
| --- | --- | --- | --- |
| **Slow Launch Month (15–30 subs)** | Solo Technical Founder | **~18 hrs/wk**: Mon–Fri 08:00–08:45 ET health/brief check (`3.75h`), daily 16:15–17:00 ET support + X post (`3.75h`), Wed content/audit (`3h`), Sun EOD/shadow attribution review (`2.5h`), Dev/Bug polish (`5h`). | Under 4 business hours |
| **Steady Plan (150 subs)** | Founder + Fractional Part-Time Ops/Support (`$400–$600/mo` variable later; currently founder-covered in Profit) | **~25 hrs/wk** founder product/content + automated self-serve CSV import, in-app FAQ, and 1-click billing portal handling 90%+ of tickets. | Under 4 business hours |

_Note on payroll & owner compensation: `founder/numbers.json` omits a founder market salary (solo bootstrapper takes distributions from operating profit after break-even). Payroll taxes and owner draw structure vary by jurisdiction—have an accountant confirm entity & tax treatment before paying yourself._

---

### 4. Five One-Page Operating SOPs

#### SOP 1: Daily Pre-Market Opening (08:00–08:35 ET)
1. Open Ops `/system-health` dashboard at 08:00 ET; confirm worker `lastHeartbeat < 10 min`, `rateLimitHitsCount === 0`, and `dataQuality === 'live'` (never `'estimated'`).
2. Verify NYSE Session Calendar (`America/New_York`) correctly flags regular open vs holiday vs 13:00 ET early close.
3. Spot-check Top 5 Stage-2 Divergence watchlist rows: confirm `entryZone`, `stop` (`<= 3×ATR`), `TP1`, and `SEC Form 4` badges loaded cleanly.
4. At 08:30 ET, confirm automated Telegram Pre-Market Brief delivered cleanly to the broadcast test channel.
5. If Tiingo upstream fails, keep `dataQuality = 'cached'`, display amber warning banner, pause intraday triggers (`canTrade()` fail-closed), and post status note inside app header.

#### SOP 2: Core Fulfilment (14-Day Preview -> Paid Subscription -> Daily Usage)
1. Visitor clicks **"Inspect 60-Day Shadow Ledger Free (No Card)"** -> instant read-only/paper workspace scoped to their email.
2. Onboarding modal prompts 1-click **Broker/TradingView CSV import** + optional **Telegram Bot link** (`<= 3 min`).
3. On upgrade (`$29` Nightly / `$39` Swing Pro / Founding `$29 × 3m`), Stripe Checkout fires webhook -> Supabase updates `tier` claim immediately (`< 5s`).
4. Send plain receipt email with next billing date and direct link to **Settings -> Billing -> Cancel / 30-Day Refund**.
5. Weekly automated Sunday digest emails each user their own Journal `R-expectancy` + `Shadow Taken vs. Skipped` attribution summary.

#### SOP 3: Complaint & 1-Click 30-Day Refund Handling
1. Any subscriber within 30 days of first payment can click **"Request 30-Day Refund"** in Settings -> Billing; Stripe API issues full refund automatically + sets subscription `cancel_at_period_end: false`.
2. Automated plain email sends within 5 minutes confirming refund ID + asking one optional multiple-choice question (*"Data freshness / UI clutter / Signal edge / Price"*).
3. For data-bug or calculation complaints: capture symbol + timeframe + `engine_version` + `asOf` timestamp, reproduce in unit tests (`npx tsx --test`), deploy patch within 24 hours, and reply directly with the changelog commit link.

#### SOP 4: End-of-Day Closing & Shadow Reconciliation (17:30–18:15 ET)
1. Trigger Tier-1 EOD scan across `sp500_ndx100` on Fly.io worker at 17:30 ET.
2. Run Outcome Engine (`X1_fixed_v1`, `X2_trail_v1`, `X3_structure_v1`) on closed daily bars; void any row flagged `data_estimated` or gap anomaly (`void_reason` logged).
3. Confirm Postgres automated daily backup snapshot succeeded inside Supabase dashboard.
4. Post factual daily Regime & Breadth summary (`5` components + Stage 2 count) on X at 17:45 ET.

#### SOP 5: Weekly Sunday Quality & Reorder/Vendor Check (Sunday 18:00 ET)
1. Review `v_signal_stats` rolling 60-day window + weekly CI90 degradation flag (`founder/master-plan-v3 §6.5`).
2. Audit Tiingo/Supabase/Fly.io usage meters against quota thresholds (`< 75%` of plan ceiling).
3. Review Marketing metrics (`Preview CPA`, `Trial-to-Paid %`, `Month-1 Churn %`) against `founder/marketing.md` red-flag triggers.
4. Archive expired watchlist items (`EXPIRED`/`INVALIDATED`) and verify zero orphan alerts or unlogged `canTrade()` refusals.

---

### 5. Minimal Tool Stack

- **Billing, Subscriptions & Sales Tax**: **Stripe Billing + Stripe Customer Portal + Stripe Tax** (`2.9% + $0.30` per charge) — eliminates custom billing/refund tickets.
- **Auth, Database, Cron & Row-Level Security**: **Supabase Pro** (`$25/mo`) — replaces `localStorage` and runs `pg_cron` schedules + RLS policies.
- **Backend API & Scheduled Worker**: **Fly.io** (`~$18/mo`) — always-on Node/TypeScript worker executing deterministic scans (`is247Active: true`).
- **Market Data**: **Tiingo Commercial Startup Redistribution** (`$250/mo`) + **SEC EDGAR API** (`$0`, strict `< 10 req/s` + declared `User-Agent`) + **CBOE Delayed Chain** (`$0`).
- **Bookkeeping**: **Wave Starter (`$0`) or QuickBooks / Xero (`~$20–$35/mo`)** inside the `$75/mo` compliance reserve.
- **Analytics & Support Inbox**: **Plausible / Cloudflare Web Analytics** (`$0–$9/mo`, cookie-light) + **HelpScout / Plain Support Email** (`$0–$20/mo`).

---

### 6. Licences, Permits, Compliance & Legal Checklist
_Rules vary by jurisdiction; confirm every item with a local business attorney or CPA before commercial launch (not legal advice):_
- [ ] **Business Entity & Tax ID**: Register LLC / sole proprietorship (US IRS EIN: [irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online](https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online)) and open dedicated business checking account.
- [ ] **Market Data Redistribution Licence**: Execute written Tiingo Startup Redistribution agreement (`$250/mo`) and **hard-disable unofficial Yahoo Finance endpoints** in commercial production builds to avoid exchange/Yahoo ToS breaches.
- [ ] **Open-Source Attribution Compliance (`src/index.css` Audit Fix)**: **Remove lines 20–33 of `src/index.css`** hiding TradingView `lightweight-charts` attribution links, ensuring full compliance with the Apache-2.0 / TradingView Lightweight Charts licence notice ([github.com/tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts)).
- [ ] **Publisher's Exclusion & Non-Advisory Terms**: Maintain impersonal, identical rule-based output across all subscribers (no individualized trade advice), backed by lawyer-reviewed Terms of Service and CFTC/SEC-style hypothetical performance & non-advisory disclosures ([sec.gov](https://www.sec.gov/)).
- [ ] **Sales Tax / VAT**: Enable Stripe Tax automatic nexus tracking for US state SaaS taxes and UK/EU digital-service VAT ([stripe.com/tax](https://stripe.com/tax)).
- [ ] **Third-Party Code/Brand Cleanup**: Remove `TrendSpiderSuite`, `LuxAlgoSuite`, `TradingWarz`, and unauthorized personal-name `"Trullàs"` references unless written IP consent is secured.
- [ ] **Tech E&O / General Liability Insurance**: Obtain cyber/software Errors & Omissions quote (`~$400–$800/yr`) once crossing `$2k/mo` MRR.

---

### 7. Ten-Item Operational Risk Register

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

## Launch plan

_Dates run from Today (**2026-11-17**) through Target Public Launch Day (**2026-12-15**) and Day-30 Review (**2027-01-14**), synced with `founder/marketing.md`, `founder/ops.md`, and `founder/cfo.md`._

---

### 1. Test Before You Spend (Zero-Wasted-Fixed-Cost Validation: `2026-11-18` to `2026-11-30`)

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

### 2. Weekly Countdown (`2026-11-17` to `2026-12-15`)

Tasks marked **[CRITICAL PATH]** slip Launch Day if delayed.

#### Week 1 (`2026-11-17` to `2026-11-23`) — Proof, Legal Cleanup & Pre-Sell Page
- **[CRITICAL PATH]** Finalize brand clearance (`StageLedger` / `ClearStage` USPTO/EUIPO/UKIPO searches + domain purchase) — *Owner: Founder · Deadline: `2026-11-18`*
- **[CRITICAL PATH]** Run `Spike E` & `Spike R` historical audit (`founder/board.md` C4) — *Owner: Founder · Deadline: `2026-11-20`*
- Remove `src/index.css` CSS rule hiding `lightweight-charts` attribution + purge `TrendSpiderSuite` / `LuxAlgoSuite` / unauthorized `Trullàs` strings (`founder/ops.md` §6) — *Owner: Founder · Deadline: `2026-11-21`*
- Launch Pre-Sell & 14-Day Preview Landing Page + `$150` initial traffic test — *Owner: Founder · Deadline: `2026-11-22`*

#### Week 2 (`2026-11-24` to `2026-11-30`) — GO/NO-GO Gate, Data License & Cloud Stack
- **[CRITICAL PATH]** **GO / NO-GO Review (`2026-11-30`)**: Confirm `>= 20` pre-orders before unlocking startup spend — *Owner: Founder · Deadline: `2026-11-30`*
- **[CRITICAL PATH]** Execute written **Tiingo Startup Redistribution (`$250/mo`)** contract & API integration (hard-disable Yahoo on commercial endpoints) — *Owner: Founder · Deadline: `2026-11-28`* *(contingent on early pre-sell traction or executed Nov 30)*
- **[CRITICAL PATH]** Deploy Supabase Pro (`$25/mo`, Postgres v3 schema + RLS + `localStorage` migration) & Fly.io scheduled worker (`$18/mo`) — *Owner: Founder · Deadline: `2026-11-29`*
- Register business entity / EIN, open business bank account, and configure Stripe Billing + Customer Portal (1-click 30-day refund) + Stripe Tax — *Owner: Founder + CPA check · Deadline: `2026-11-30`*

#### Week 3 (`2026-12-01` to `2026-12-07`, `T-14` to `T-8`) — Campaign Kickoff & Beta Soft Open
- **`T-14 (2026-12-01)`**: Open public read-only **60-Day Shadow Signal Ledger** + publish `Spike E`/`R` note (`founder/marketing.md`) — *Owner: Founder*
- **[CRITICAL PATH]** Invite **10–15 Friends, Family & Beta Swing Traders** into live Staging (`Soft Open`) to verify CSV import, Telegram bot linking, and `Today` 10-minute workflow — *Owner: Founder · Deadline: `2026-12-03`*
- Launch `$15/day` Google Search exact-match A/B test (`$29` Nightly vs `$39` Swing Pro landing variants) — *Owner: Founder · Deadline: `2026-12-07`*

#### Week 4 (`2026-12-08` to `2026-12-15`, `T-7` to Launch Day `T`) — Hardening & Public Launch
- Fix every friction bug found by Soft Open cohort; verify `0` console errors and `1-click CSV import` success across Schwab/Interactive Brokers/TradingView formats — *Owner: Founder · Deadline: `2026-12-11`*
- **[CRITICAL PATH]** Verify **7 consecutive error-free EOD (`17:30 ET`) & Pre-Market (`08:30 ET`) worker cycles** on Fly.io (`rateLimitHitsCount === 0`, `is247Active: true`) — *Owner: Founder · Deadline: `2026-12-13`*
- Run full Stripe `$1` live checkout + 1-click refund end-to-end production test — *Owner: Founder · Deadline: `2026-12-14`*
- **`T (2026-12-15)`**: **Public Launch Day** (Founding Cohort `$29/mo × 3 mo` open until `2026-12-29`).

---

### 3. Launch Day Run Sheet (`2026-12-15`, Eastern Time)

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

### 4. First 30 Days: Numbers to Watch & Review Cadence (`2026-12-15` to `2027-01-14`)

**Weekly Tracking Against CFO & Marketing Bars**:
- **Paying Subscribers vs. CFO Break-Even**: Need **18 active subscribers/mo** (`~1/day` billing rate in `numbers.json`) to cover `$638/mo` fixed costs; Year-1 Month-1 plan target = **30 subscribers** (`$1,170` revenue).
- **Preview CPA**: Target `<= $12` (Trigger: `> $20` -> cut high-CPC keywords).
- **Preview-to-Paid Conversion**: Target `>= 18%` (Trigger: `< 10%` -> audit Day-1 onboarding friction).
- **Refund & Month-1 Churn**: Target `<= 4%` refunds / `<= 12%` churn (Trigger: `> 8%` refunds -> pause paid ads immediately and fix top exit reason).

#### Review Checkpoints
- **Day 7 (`2026-12-22`) — Activation & Tech Check**:
  - *Questions*: How many users imported a CSV journal or linked Telegram inside 48 hours? Did the worker miss any `08:30`/`17:30 ET` runs? Which pricing variant (`$29` Nightly vs `$39` Swing Pro) gets higher revenue per 1,000 clicks?
- **Day 14 (`2026-12-29`) — Founding Cohort Close & Offer Check**:
  - *Action*: **Close Founding `$29/mo × 3 mo` offer strictly at 23:59 ET** (`founder/marketing.md`); switch Swing Pro to standard `$39/mo`.
  - *Questions*: Did we cross the **18-subscriber break-even** line? Are real users converting near our Month-1 target (`30`), or below the 50%-downside line (`15`)?
- **Day 30 (`2027-01-14`) — Unit Economics & Review-Unlock Audit**:
  - *Questions*: (1) What is real Month-1 MRR, refund rate, and Tiingo/infra spend vs `founder/numbers.json`? (2) Request honest public reviews on Trustpilot from active Day-1 users so `Review & community checker` buyers (`P002`/`P013`) see real third-party feedback. (3) Decide whether to maintain `$250/mo` marketing or shift budget to highest-ROI newsletter/YouTube channels.

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
