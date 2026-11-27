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

## P1.6a — Alpaca broker-native order idempotency

Every order submission through `POST /api/alpaca/orders` must include a stable
`client_order_id` (maximum 48 characters, as required by Alpaca). The caller
must reuse the same ID for every retry of the same order intent and use a new
ID for a genuinely new order.

Before running the portfolio risk snapshot, the server queries Alpaca by
`client_order_id`. If the broker already knows the order, the server returns
that order without submitting another POST. If the initial POST has an
ambiguous transport failure or duplicate-ID response, the server queries the
same broker identifier and returns the accepted order when found. Reusing an
identifier with a different symbol, side, quantity, order type, time-in-force,
limit price, or stop price is rejected with HTTP 409.

Uniqueness is delegated to Alpaca's account-level `client_order_id`
constraint rather than an in-memory server cache. This protects retries across
server restarts and concurrent application instances, provided the caller
retains the same ID. It is not a substitute for a durable local execution
ledger: broker lookup availability and persistence of local risk/audit
decisions remain separate P1.6 follow-up work. All order submission remains
Paper-only.


## P1.6b — Persistent execution ledger

The server can persist broker order-acceptance events in a dedicated Firestore collection,
separate from the browser-owned journal and localStorage audit chain.

### Server configuration

Set these variables in the server runtime (never in Vite/client-prefixed variables):

- `FIREBASE_PROJECT_ID`: the Firebase project containing the default Firestore database.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON document. Store it as a secret; never commit it.
- `EXECUTION_LEDGER_REQUIRED=true`: require the ledger before accepting an order. Production defaults to required unless explicitly set to `false`.

The service account needs Firestore data access (for example, the **Cloud Datastore User**
IAM role) on the same project. The server uses a server-side service-account OAuth assertion
and the Firestore REST API; no service-account credential is exposed to the browser. Firestore
Security Rules do not authorize or constrain this privileged server identity, so IAM is the
authorization boundary. Use a dedicated least-privilege service account.

### Stored records and guarantees

- One parent document per SHA-256 hash of `client_order_id`.
- Event documents are immutable-by-convention and have deterministic IDs, preventing duplicate
  event creation when the same accepted order is retried.
- A metadata head document stores the latest sequence and hash.
- Event append writes the event and advances the head in one Firestore commit with document
  preconditions; concurrent writers retry on contention.
- Each event includes sequence, timestamp, broker order ID, client order ID, symbol, payload,
  previous hash and SHA-256 entry hash.
- Authenticated history endpoint:
  `GET /api/alpaca/orders/:clientOrderId/ledger`
  returns events and a chain-verification result.

If Alpaca accepts an order but Firestore persistence fails, the API returns HTTP 503 with the
broker and client order IDs. The caller must retry using the **same** `client_order_id`;
Alpaca idempotency recovers the original order and the ledger append can be retried safely.
Never create a new client order ID for that retry.

### Current scope / not yet claimed

This increment records accepted order submissions. The schema supports fill and cancellation
events, but automatic fill-activity ingestion, order-state reconciliation after restart,
retention/backup policy, and production IAM verification remain follow-up work. Do not treat
this increment as a complete execution/fill ledger until those items are implemented and
validated against a configured Paper account.

## P1.6c — Broker fill reconciliation

The authenticated endpoint
`POST /api/alpaca/orders/:clientOrderId/reconcile` performs an on-demand reconciliation
for one existing Paper order:

1. Resolves the broker order by its stable `client_order_id`.
2. Retrieves the complete paginated Alpaca FILL activity history and selects activities
   matching that broker `order_id`.
3. Refuses to write if activity pagination is incomplete, a fill row is malformed, or
   the sum of activity quantities differs from Alpaca's `filled_qty`.
4. Appends one deterministic `FILL_RECORDED` event per broker activity ID.
5. Appends a broker-state event: `ORDER_CANCELED`, `ORDER_REJECTED`, or
   `RECONCILIATION` (including partial/full fill state and aggregate broker quantity).
6. Reads back and verifies the complete SHA-256 chain before returning success.

Repeated calls are safe: deterministic event IDs make already-recorded fills and identical
broker-state snapshots idempotent. New fills or a changed broker status create new events.
The endpoint is on-demand; it does not run a background scheduler. Automated periodic
reconciliation, handling of broker corporate actions/adjustments, and live Paper-account
validation remain follow-up work. Do not claim that the ledger is continuously synchronized.

## P1.6d — automated broker reconciliation worker

When a server-side Firestore service account is configured, the direct server process
starts a periodic Paper-order reconciliation worker. The default interval is 60 seconds;
`EXECUTION_RECONCILIATION_INTERVAL_MS` may override it (minimum 30 seconds).

Every new ledger append atomically updates a separate `alpacaExecutionOrderIndex`
document alongside the event and hash-chain head. The worker paginates this index,
skips orders already in terminal states, and reconciles remaining orders with bounded
concurrency (3 by default). Each run:

- resolves the broker order by its stable `client_order_id`;
- verifies broker order identity and complete fill-activity pagination;
- requires aggregate activity quantity to equal broker `filled_qty`;
- appends deterministic fill events and the latest broker-state snapshot;
- reads back and verifies the order's full hash chain.

The worker is non-overlapping within one process. Repeated runs are idempotent because
event IDs are deterministic. Its latest run summary is available at the authenticated
`GET /api/alpaca/reconciliation/status` endpoint.

Operational boundaries:
- This worker only reconciles orders; it never submits, replaces, or cancels orders.
- It starts only in the direct server lifecycle, not when tests call `createApp`.
- It requires Firestore service-account configuration and working Alpaca Paper credentials.
- The order index is populated by ledger appends after this version is deployed. Existing
  pre-index ledger histories require a one-time backfill before they can be discovered by
  the worker; this increment does not silently assume historical orders were indexed.
- Multiple server replicas may run the worker concurrently. Deterministic event IDs and
  Firestore optimistic concurrency protect writes, but this release does not implement a
  distributed lease; configure one active worker replica until that is added.
- No production Firestore or live Paper-account validation is implied by CI.
