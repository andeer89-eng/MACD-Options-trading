# P1.18d — Idempotent watchlist evaluation journal

## Service

`createWatchlistEvaluationJournal()` appends evaluation records to the
server-only Firestore collection `watchlistEvaluationEvents`. It uses the
configured named database, service-account OAuth, and Firestore create
semantics. The service does not update watchlist items.

## Deterministic identity

The document ID is SHA-256 over owner ID, normalized symbol, setup ID, rule
version, last closed candle timestamp, and normalized market-data digest.
Re-running the same evaluation over the same input resolves to the same ID.

- First append creates one immutable record.
- Retry reads the existing record and returns `replayed: true` when the
  canonical evidence/result is equivalent. The retry's `evaluatedAt` is excluded
  from comparison because it can legitimately change while the deterministic
  market-evidence identity remains the same; the original timestamp stays in the
  immutable stored record.
- Reuse of the same identity with changed result/evidence returns HTTP 409.
- Client Firestore rules deny access through the global deny rule; writes are
  intended only through server service-account credentials.

## Stored record

The immutable record includes owner, symbol, setup, rule version, evaluation
status/time, reason or trigger values, provider identifier, last closed candle
timestamp, and normalized payload SHA-256.

## Safety boundary

The persistence primitive is now used by the read-only P1.18e evaluation
endpoint documented in [watchlist-evaluation-worker.md](./watchlist-evaluation-worker.md).
The endpoint is not scheduled automatically. No production Firestore write has
been performed. It does not transition a watchlist item to `TRIGGERED`, call
the P1.17 trigger endpoint, submit broker orders, or activate automated trading.
