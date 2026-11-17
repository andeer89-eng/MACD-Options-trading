# Pricing Strategy: Trullàs Divergence 24/7 Scanner

_Simulated buyer answers from `founder/pricing-curve.md` pick the candidate price band to test; real checkout tests confirm willingness to pay._

---

## 1. Recommended Price: **$39.00 / month** (Flagship *Swing Pro*)
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

## 2. The Price Ladder (Good / Better / Best)

| Tier | Monthly Price | Annual Equivalent | Target Buyer & Why Step Up |
| --- | ---: | ---: | --- |
| **Good — Nightly Watchlist** | **$29/mo** | **$24/mo** (`$288/yr`) | **For `$10k–$50k` salaried swing traders** checking charts after 16:00 ET. Includes daily EOD S&P 500 Stage 2 + MACD Triple Divergence ranked shortlist, Regime breadth, immutable `Levels`, and Trade Journal. *(Hits the exact `$25–$29/mo` EOD threshold requested by 7 passing panelists.)* |
| **Better — Swing Pro** *(Flagship)* | **$39/mo** | **$32/mo** (`$384/yr`) | **Step up for**: Licensed commercial intraday watchlist monitoring (eliminates Yahoo 10–20m delay), Telegram/Webhook alerts, full **Shadow Signal Ledger (`X1`/`X2`/`X3`)**, SEC EDGAR Form 4/13F filings, and CBOE VIX/GEX context. |
| **Best — Quant Desk & Daemon** | **$69/mo** | **$57/mo** (`$684/yr`) | **Step up for**: `$150k+` systematic traders needing `sp500_ndx100` expanded universe scanning, downloadable standalone Python 24/7 daemon/API token access, and full CSV/JSON shadow outcome exports. |

_No metered AI credit upsells, no surprise script paywalls, and a transparent one-click cancel inside Account Settings._

---

## 3. Opening Offer (Time-Boxed, No Fake Anchors)
- **Founding Member Launch Rate**: Lock **$29/mo for your first 3 months on Swing Pro** (regular published monthly rate `$39/mo` starting Month 4), **open strictly for 14 days from launch date (T+0 to T+14) or the first 50 founding seats**, paired with a **14-day no-card-required read-only shadow ledger preview + 30-day unconditional money-back guarantee on Month 1**.
- **Rule**: Never invent a fake "$99/mo value" crossed-out anchor; show the real `$39/mo` published Swing Pro price and the real 3-month founding cohort discount.

---

## 4. Real-World Price Test Plan
Run a two-week landing-page A/B split test on paid search / newsletter traffic **before** committing to commercial annual contracts:
- **Variant A**: `$29/mo` Nightly Watchlist + `$39/mo` Swing Pro
- **Variant B**: `$39/mo` single-plan Swing Pro (with 14-day guided trial)
- **Success metric**: Track **paid checkout rate × Day-45 retention** (net revenue per 1,000 landing-page visits), not raw email clicks. Only scale ad spend if net revenue per visitor clears CAC payback inside 60 days.

---

## 5. Top 3 Verbatim Price Objections from the Panel (`founder/panel/results.md`)
1. *"At $49 a month on top of my TradingView plan, it is too expensive for a $10k-$50k swing account when I can code basic divergence and Stage filters in Pine Script."* (`P005`)
2. *"Almost $600 a year eats a big chunk of a smaller swing account, and without real backtest proof I am not paying more than Finviz Elite."* (`P006`)
3. *"Paying $49/mo for delayed public market data feels off when free screeners already show delayed prices."* (`P008`)
