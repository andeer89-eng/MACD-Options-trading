# STOCK server-side shadow adapter

## Scope

This change adds the first server-side STOCK decision adapter. It reuses the existing strategy and candidate-selection functions instead of creating a second signal implementation.

The authenticated endpoint is:

- `POST /api/alpaca/bot/cycles/STOCK/shadow`

It loads the owner's persisted STOCK portfolio configuration, acquires the owner's distributed STOCK cycle lease, evaluates the strategy and returns the shadow result. A concurrent cycle for the same owner/bot receives a conflict response while the lease is held. The cycle verifies the fencing token before returning.

## Decision path

1. Read the authenticated owner's persisted STOCK portfolio.
2. Fetch an Alpaca Paper account/positions/orders/history snapshot.
3. Fail closed if the broker is not configured or required history is incomplete.
4. Fetch daily Yahoo candles for the configured symbol set.
5. Exclude daily bars younger than 24 hours and reject invalid OHLCV or non-monotonic timestamps.
6. Reuse `calculateIndicators`, `detectDivergences`, `filterActiveDivergences`, `getLatestVolatilityMetrics`, `evaluatePortfolioRisk`, and `selectAlpacaEquityCandidates`.
7. Return candidate entries, closes, reversals, risk gate results, data-quality errors and a SHA-256 configuration digest.
8. Release the distributed lease. The orchestrator rejects the cycle if the persisted fencing token is no longer valid.

## Safety guarantees

- Shadow execution is read-only. `ordersSubmitted` is always zero and the adapter has no broker order-submission dependency.
- The shadow endpoint does not require trading arming because it cannot submit orders. It does require Firebase authentication and the server-side execution ledger/lease store.
- The STOCK and OPTION cycle lease namespaces remain separate.
- Cancellation from lease loss is propagated through the candle-evaluation loop.
- Alpaca remains Paper-only.
- No browser bot scheduler is removed or activated/deactivated by this change.
- This is not yet a replacement for the browser bot and is not a production auto-trading release.

## Known validation boundary

The first adapter uses the existing client-side candidate selector as a shared pure decision function. Its dependencies include the existing portfolio configuration schema, queued candidates and active memory. The server currently reads the persisted portfolio snapshot; it does not yet persist all browser-only queue/memory inputs or guarantee exact parity of every legacy localStorage-derived field. Those need explicit schema ownership and parity tests before shadow comparison can be used as a release gate.

Yahoo Finance is treated as a non-contractual market-data source. The conservative 24-hour daily-bar exclusion reduces the chance of consuming an unfinished daily candle but does not establish institutional-grade feed finality or point-in-time market data.

## Next steps

1. Persist and version all STOCK strategy inputs, candidate queues and active-memory state on the server.
2. Add shadow decision journal with deterministic input/output hashes and replay.
3. Add side-by-side browser-vs-server decision parity reporting.
4. Build the separate OPTION short-put shadow adapter with live bid/ask/Greeks freshness checks.
5. Only after shadow validation, implement final broker submission fencing and migrate the decision pipeline behind the server-side order-intent state machine.
