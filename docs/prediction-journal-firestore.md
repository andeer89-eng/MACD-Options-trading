# P1.23 — Firestore Prediction Journal Persistence

## Scope

This change adds a server-only Firestore append primitive for the P1.22 prediction journal. It supports the existing STOCK and OPTION prediction event contract. It is deliberately not wired into an HTTP route, scheduler, bot, broker, Alpaca client, or production startup path.

## Storage layout

For each verified owner:

- `users/{ownerId}/predictionJournalEvents/{eventHash}` stores an immutable event envelope and canonical event JSON.
- `users/{ownerId}/predictionJournalMeta/head` stores the current sequence and chain head hash.

Event document IDs are deterministic SHA-256 hashes of the canonical event body. A retry of the same event therefore resolves to the same document. Reusing the same event body does not create a second journal entry.

## Atomic append and concurrency

The appender reads the current head, then commits the event document and updated head in one Firestore `documents:commit` batch. The event write has an `exists:false` precondition; the head write has either an `exists:false` or exact `updateTime` precondition. Firestore applies the batch atomically.

If another writer advances the head first, the stale precondition fails and the appender rereads the head and retries. The deterministic event ID is checked again after a conflict so a lost commit response is treated as an idempotent replay. Retries are bounded; persistent contention returns a conflict rather than silently dropping an event.

The chain uses the same canonical JSON and SHA-256 approach as P1.22: each event binds its sequence, previous hash, event body, and event hash.

## Security

Client Firestore rules allow a verified owner to read their own prediction events and head metadata. Client create, update, and delete are denied. The server appender uses a service account and the Firestore REST API; service-account credentials must remain server-side and must never be exposed to the browser.

## Validation and limitations

Unit tests cover STOCK and OPTION event envelopes, monotonic sequence/hash linkage, deterministic retry idempotency, and rejection of invalid owners. Firestore emulator tests cover owner-scoped reads and deny client mutations.

This PR provides the atomic persistence primitive only. It does not yet:
- replace `InMemoryPredictionJournal` in application flows;
- implement journal replay/rebuild, full-chain verification from Firestore, pagination, or retention;
- label outcomes automatically or schedule workers;
- provision service-account secrets or deploy Firestore rules;
- enable any paper/live execution, broker action, or automated trading.

Before production adoption, add a repository adapter that performs prediction-ID and outcome-ID uniqueness checks in the same atomic commit, paginated event replay and full-chain verification, operational metrics, and a controlled migration/rollout plan. No production writes are enabled by this change.


## P1.25 — Semantic outcome labeling

The server adapter exposes `labelOutcome(ownerId, predictionId, outcome)` as the validated outcome-write path. Before appending, it reads the owner's history, verifies the complete hash chain and persisted head, then rehydrates the domain journal and delegates prediction existence, STOCK/OPTION agreement, target-horizon, outcome-shape, and immutable-label checks to the same domain validation used by the in-memory journal.

If history verification fails, labeling is blocked with a conflict response. If the prediction is absent, the asset class differs, the target horizon has not elapsed, or a different label already exists, no Firestore append is attempted. Repeating the exact same valid label is idempotent. The public `append` method accepts prediction-recorded events only and rejects raw outcome events. The internal persistence primitive is not exposed; `labelOutcome` is the sole public path for outcome writes and performs the full semantic validation before the append.

This remains server-only and is not wired to an automatic labeling worker, route, scheduler, broker, or trading bot. A production caller must authenticate and authorize `ownerId` before invoking the adapter.


## P1.43 — Semantic prediction write boundary

The public raw `append` method now rejects every event type. Prediction records
must use `recordPrediction(ownerId, input)`; outcome labels must use
`labelOutcome(ownerId, predictionId, outcome)`. The low-level atomic append
primitive remains private to the adapter.

Before recording a prediction, the adapter reads the owner's history, verifies
the full hash chain and persisted head, rehydrates the domain journal, and calls
the same `InMemoryPredictionJournal.record` validation used by the reference
implementation. This enforces required fields, probability simplex, time
ordering, STOCK/OPTION contract identity, origin provenance rules, and
prediction-ID immutability before any Firestore append. Exact retries return
the original immutable snapshot even if the current clock has advanced;
conflicting reuse of a prediction ID returns a conflict. Integrity failures
block writes.

This is still a server-side persistence primitive, not an HTTP route or bot
integration. It does not enable automatic prediction capture, outcome labeling,
broker activity, or order execution.
