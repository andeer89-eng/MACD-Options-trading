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
