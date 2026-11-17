# Product lens
Score: 5 | Vote: FUND IF

## What is strong
- **Clear core loop emerging in the Today / Master Plan architecture**: Moving from fragmented modules toward a daily trader rhythm (`Today -> Scan -> Chart -> Risk Gate -> Review`) shows genuine product craft and respect for how a swing trader actually prepares before the New York open.
- **Refusal to tack on hype**: Explicitly excluding AI chatbots and enforcing fail-closed NYSE session rules (`canTrade()`) plus `LIVE`/`CACHED`/`DELAYED` badges demonstrates taste and integrity in an industry full of fake precision.

## What would kill it (the top 3, most dangerous first)
1. **Severe feature bloat ("eight hubs doing everything")**: Right now the app tries to be a market heatmap, an options GEX terminal, an SEC EDGAR reader, a TrendSpider/LuxAlgo chart suite, a backtester, an automated stock & options bot, a trade journal, AND a Python daemon generator. Nobody learns or trusts eight workspaces in their first five minutes; the "one thing" gets buried.
2. **Broken seams between browser, daemon, and data truth**: The web UI runs via `localStorage` and on-demand browser polling while exporting a separate Python daemon script and calling itself "24/7 Scanner." When state lives in `localStorage` in one tab and a Python script on a user's laptop in another, the customer hits jagged seams immediately.
3. **Borrowed identities inside the craft**: Leaving third-party product labels (`TrendSpiderSuite`, `LuxAlgoSuite`) and mixed-language rough edges in user-facing product surfaces undermines pride in craftsmanship and makes the software look assembled rather than authored.

## The questions I would ask the founder
- What are you willing to cut or move to a "Pro Labs" drawer so the first 5 minutes feel unmistakable: open `Today`, see Market Regime + Top 10 Stage-2 Divergence setups, check `Levels` + Risk Gate, and set one alert?
- Why does a SaaS subscriber need to run a standalone Python daemon at all if the hosted product handles EOD + pre-market scanning cleanly?
- How fast can you migrate persistence out of browser `localStorage` into authenticated cloud persistence so switching devices never wipes a trader's journal and watchlist? (Answers needed from `founder-ops` and `founder-cfo`.)

## If FUND IF: the conditions
1. **Cut the pitch and first-run surface down to one sentence and one workflow**: Pre-market swing readiness (Regime + Ranked Stage-2 Divergence Shortlist + Immutable Levels & Shadow Ledger), hiding secondary options/GEX/Pine experiments behind advanced toggles until daily retention is proven.
2. **Eliminate the browser-vs-daemon seam**: Either ship hosted cloud-scheduled EOD/pre-market worker runs as the core promise (and remove the confusing local daemon from the main pitch) or explicitly target technical self-hosters as a separate developer tier.
3. **Strip all third-party product branding from UI code, labels, and chart modules** and enforce strict data-freshness, `as-of`, and NYSE calendar transparency on every single panel.
