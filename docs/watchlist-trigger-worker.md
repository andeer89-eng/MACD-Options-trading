# Server-authoritative watchlist trigger endpoint

## Endpoint

`POST /api/internal/watchlist/trigger`

This is a worker-to-server persistence endpoint, not a market-signal evaluator. It is intentionally not callable with a Firebase user ID token. The caller must be a trusted scanner/trigger worker holding `WATCHLIST_TRIGGER_WORKER_TOKEN`.

Required server configuration:
- `WATCHLIST_TRIGGER_WORKER_TOKEN`: high-entropy secret shared only with the trusted worker.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: server-only service-account JSON with write access to the configured Firestore database.
- `FIREBASE_PROJECT_ID` (or app Firebase project config) and the app's named `firestoreDatabaseId`.

Example request:

```json
{
  "ownerId": "firebase-user-uid",
  "symbol": "AAPL",
  "triggerId": "stable-worker-event-id",
  "evidence": {
    "ruleId": "worker-defined-rule-version",
    "source": "trusted-market-data-feed",
    "observedPrice": 192.4,
    "threshold": 190,
    "evaluatedAt": "2026-11-27T18:00:00.000Z"
  }
}
```

The service:
- authenticates the worker with a constant-time bearer-token comparison;
- validates and bounds all request fields;
- loads the target user's watchlist item and permits only `NEW` or `WATCHING` to transition;
- uses Firestore update-time preconditions and an atomic commit to set `TRIGGERED` and create a server-only audit event;
- uses `triggerId` for idempotent retries and rejects reuse for another owner/symbol;
- writes through the configured named Firestore database using service-account OAuth; Firestore Security Rules are bypassed only by this server credential.

## Important boundary

This endpoint does not independently prove that the supplied market condition is true. The worker is a trusted computing component and must evaluate the configured trigger rule against an approved market-data source before calling this endpoint. The repository does not yet contain a production trigger evaluator/scheduler or a live market-data provenance contract. Until those exist and are validated, do not configure the worker token or send production trigger requests.

The API does not submit, replace, or cancel broker orders and does not activate automated trading.
