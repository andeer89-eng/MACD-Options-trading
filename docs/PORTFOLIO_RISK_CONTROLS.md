# P1.4 — Unified Alpaca Portfolio Risk Controls

## Enforcement layers

The same risk evaluator is used by both the equity and options automation managers. The Alpaca service repeats the check immediately before every new order submission; the browser check is for operator feedback, not a security boundary.

## Limits

- Daily account-equity loss: 2% (Alpaca account equity versus prior close).
- Rolling 7-calendar-day drawdown: 5%.
- Rolling 30-calendar-day drawdown: 8%.
- Gross marked exposure: 150% of account equity.
- Short-put strike collateral: 50% of account equity, including accepted/working short-put orders.
- Worst-case loss for a newly submitted short put: 1% of account equity.

The rolling periods use Alpaca's 1-year daily portfolio-history response and the current account equity. If history is missing, too short, or does not contain the required weekly/monthly baseline, new entries fail closed. This intentionally prefers a missed entry over opening risk with an unverifiable drawdown state.

## What remains enabled during a halt

The risk gate blocks new entries. Existing risk-reducing close/cancel operations remain available; the options cycle continues to evaluate take-profit and expiry exits before it considers new short puts.

## Working-order snapshot integrity

The server retrieves working orders with the same cursor-based pagination discipline as historical orders. If the broker snapshot reaches the pagination cap, repeats a cursor, or otherwise cannot be proven complete, the order request fails closed with HTTP 503; it does not evaluate risk against a silently truncated first page.

## Concurrency

A shared in-tab lock prevents the equity and options automation managers from running overlapping cycles in the same browser tab. The server-side risk check is independently executed on every POST /api/alpaca/orders request, so a second tab or direct API caller cannot rely on the UI lock.

The in-tab lock is not a distributed lock across browsers/devices. Server-side account snapshots and Alpaca buying-power validation remain authoritative. A true distributed order-intent lock/idempotency ledger is a separate follow-up.

## Exposure methodology

- Equity and option marked market values contribute to gross marked exposure.
- Short put collateral is computed from OCC strike × 100 × contract count.
- Pending/working short-put sell orders are included in collateral before fills.
- Per-contract short-put worst-case loss is strike notional less the submitted limit credit. Market orders receive no assumed premium credit for this conservative pre-trade check.

## Validation

Unit tests cover daily/weekly/monthly loss thresholds, missing history fail-closed behavior, short-put collateral, per-trade short-put loss, and cross-manager lock ownership. Server integration tests cover broker history ingestion and the server-side rejection of oversized short-put orders.

## Operational boundary

These are deterministic pre-trade guardrails, not a guarantee against gaps, slippage, broker outages, corporate actions, or assignment risk. Alpaca can still reject an order after the pre-trade check if buying power or account permissions change between snapshot and submission.


## Projected equity order exposure and close-order aggregation

The server includes the proposed equity order's estimated notional in the gross-exposure calculation. Limit and stop prices are used when supplied; market orders use the current held-position mark or a fresh Alpaca IEX latest trade. If a reliable price cannot be obtained for a market order or existing working equity order, the request fails closed. Existing working equity orders are also included using their remaining quantity.

Risk-reducing exits are allowed only to the extent that the requested close plus already-working close-side quantities do not exceed the current broker position. An attempted over-close is rejected with HTTP 409 rather than being treated as a fresh entry.
