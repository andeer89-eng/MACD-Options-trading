# P1.18e — Read-only watchlist evaluation worker

## Endpoint

`POST /api/internal/watchlist/evaluate`

This is a worker-authenticated, server-side evaluation endpoint. It fetches
provenance-bound market data, calculates Trullas indicators and divergences,
filters active setups, evaluates confirmed closed-candle breakouts, and appends
the results to the server-only `watchlistEvaluationEvents` journal.

It is read-only with respect to watchlist state. It does not call
`POST /api/internal/watchlist/trigger`, schedule recurring scans, or submit
broker orders.

## Required server configuration

- `WATCHLIST_EVALUATION_WORKER_TOKEN`: high-entropy bearer secret shared only
  with the trusted evaluation worker. Configure it as a server secret; never
  expose it in a `VITE_*` variable or client bundle.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: server-only service-account JSON with
  Firestore write/read access to the configured database.
- `FIREBASE_PROJECT_ID` (or the app Firebase project configuration) and the
  configured named Firestore database.

The separate `WATCHLIST_TRIGGER_WORKER_TOKEN` is for the P1.17 state-transition
endpoint. It is not used by this read-only evaluation endpoint.

## Request

The request body must contain:

```json
{
  "ownerId": "firebase-user-uid",
  "symbol": "AAPL",
  "timeframe": "1d",
  "range": "3mo"
}
```

Allowed timeframes: `5m`, `15m`, `30m`, `1h`, `1d`, `1wk`.

Allowed ranges: `1mo`, `3mo`, `6mo`, `1y`, `2y`.

Authenticate with:

```
Authorization: Bearer <WATCHLIST_EVALUATION_WORKER_TOKEN>
```

## Evaluation and persistence

1. Fetch Yahoo Finance Chart API v8 data through the server market-data service.
2. Fail closed if the provider evidence envelope cannot be created or validated.
3. Exclude the newest provider bar because this integration has no
   provider-verified per-candle finalization flag.
4. Calculate indicators and detect divergences using the closed OHLCV series.
5. Filter active setups and evaluate close-cross breakout rules.
6. Append each evaluation using the deterministic, create-only journal writer.
7. Return setup/evaluation counts, provider ID, normalized payload digest,
   last closed candle timestamp, and journal replay metadata.

The default maximum age for evidence retrieval is 15 minutes. This checks the
age of the server retrieval envelope; it does **not** independently prove that
the last closed candle is current for the exchange session. P1.18f adds a
timeframe-specific, conservative maximum age for the last closed candle: 20 min
(5m), 45 min (15m), 90 min (30m), 3 h (1h), 5 days (1d), and 10 days (1wk).
A candle outside its limit is rejected with HTTP 503; the worker does not widen
these limits automatically. These are fail-closed age limits, not an exchange
calendar: holidays and unusual sessions may cause false rejections. The ownerId
continues to be supplied by the trusted worker; this endpoint does not yet
independently bind it to a verified authenticated user session.

## Response and status behavior

- `200`: evaluation completed; the response includes `readOnly: true`.
- `400`: invalid owner, symbol, timeframe, or range.
- `401`: missing or invalid worker bearer token.
- `503`: worker configuration, provider evidence, OAuth, or Firestore service
  unavailable.
- `409`: a deterministic journal identity already exists with different
  canonical evaluation evidence.

A repeated evaluation with the same owner, symbol, setup, rule version, closed
bar and market-data digest returns `replayed: true` when stable result evidence
matches. A retry's wall-clock `evaluatedAt` may differ; the first stored event
timestamp remains immutable.

## Operational safety

- There is no scheduler or cron activation in this milestone.
- No production Firestore write or live-feed validation is claimed by the tests.
- Yahoo Finance is not an exchange-authoritative feed.
- The endpoint does not mutate watchlist status or call the trigger endpoint.
- No broker order is submitted, replaced, or cancelled.
- Do not configure a production worker until the data freshness policy,
  provider suitability, owner authorization model, and operational monitoring
  have been reviewed for the intended deployment.
