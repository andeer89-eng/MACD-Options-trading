# Board Briefing: Trullàs Divergence 24/7 Scanner

## 1. The Idea Summary
- **Working Name**: Trullàs Divergence 24/7 Scanner
- **One-liner**: A deterministic swing-trading scanner, regime dashboard, and trade-journal/shadow-analytics terminal for US equities and options traders.
- **Target Buyer**: Self-directed retail swing traders ($10k–$250k accounts, trading US stocks and options on daily/weekly timeframes) who currently cobble together TradingView, Finviz, spreadsheets, and brokerage scanners.
- **Working Commercial Offer**: Monthly SaaS subscription at **$49/month** (working hypothesis to test) giving access to:
  1. Full S&P 500 (503-stock) scan for MACD Triple Divergence, 4-Pillars Confluence, and Stan Weinstein Stage 1–4 + Mansfield Relative Strength.
  2. Market Regime & Breadth dashboard (SPDR 11-sector rotation, S&P 500 breadth, CBOE VIX + SPX Gamma Exposure / Put-Call telemetry, 507-tile Market Heatmap).
  3. Quant Chart Studio (Raindrop volume profiles, Auto-AVWAP anchored to earnings/pivots, custom PineTS indicators) + SEC EDGAR Form 4 / 13F / 8-K filings inspector.
  4. Fail-closed risk & execution layer (`canTrade()` NYSE calendar & session gate), Trade Journal with R-multiple & MFE/MAE tracking, Shadow Signal Outcome Engine (`X1`/`X2`/`X3` exit policies), and Telegram/Webhook alerts + downloadable Python 24/7 daemon (`trullas_scanner_247.py`).
- **Delivery & Operations**: Online SaaS web app + scheduled cloud scanner + alert webhooks.

## 2. Current Reality of the Asset (from Technical Audit & Master Plan v3)
- **What is already built**: Working React 19 + TypeScript + Express (`server.ts`) full-stack application with 8 workspace hubs (`Today`, `Scanner`, `Charts & SEC`, `Markets`, `Options`, `Bots & Backtest`, `Quant Lab`, `Ops & Alerts`), 132 passing unit tests, 192-trade historical options archive, and Python daemon generator.
- **Honest gaps and technical risks discovered in audit**:
  - **Market data licensing**: The prototype fetches unofficial free Yahoo Finance (`v8/finance/spark`, `v8/finance/chart`), CBOE delayed chains, and SEC EDGAR. Official commercial multi-user SaaS redistribution requires a paid, licensed market-data provider (e.g., Polygon.io / Databento / Twelve Data / Nasdaq Data Link), plus exchange redistribution compliance.
  - **True 24/7 execution**: `/api/system-health` truthfully reports `is247Active: false` in the single-server prototype because browser polling drives scans unless the user runs the standalone Python daemon locally or an external worker + Postgres/Supabase persistence replaces `localStorage`.
  - **Statistical edge unverified at commercial scale**: Master Plan v3 notes two validation spikes remain open (`Spike R` for Regime Score predictive power and `Spike E` for 5-year net-of-cost strategy edge over random entry).
  - **Brand & Name risk**: "Trullàs" is a personal/method name (David Trullàs) and the working codebase uses third-party brand names inside module labels (`TrendSpiderSuite`, `LuxAlgoSuite`, `TradingWarz` references in internal component/method names) that must be cleaned/audited before public commercial launch.
  - **Regulatory boundary**: Purely analytical scanner & rules engine (non-advisory, no personalized investment advice, fail-closed paper/live gates).

## 3. Working Constraints & Open Questions
- **Budget & Team**: Solo/small bootstrap team; ~$3,000 working cash hypothesis (unconfirmed by founder).
- **Unknowns for downstream skills**: Real market-data API commercial licensing cost (`founder-ops`, `founder-cfo`), competitor pricing & review complaints (`founder-competitors`), real buyer willingness to pay (`founder-consumer`, `founder-pricing`), customer acquisition cost (`founder-marketing`), and trademark clearance (`founder-brand`).
