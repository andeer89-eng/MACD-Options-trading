# P1.24 — Prediction Journal Identity, Replay, and Verification

## Additions

P1.24 extends the P1.23 Firestore appender with two integrity controls:

1. An immutable identity index per prediction and per outcome label. Prediction identity hashes the full canonical snapshot; outcome identity hashes the full canonical outcome. Index creation is part of the same atomic Firestore commit as the event and chain-head update.
2. Complete event replay with Firestore REST pagination and full SHA-256 chain verification. Verification also compares the persisted head sequence/hash with the replayed chain.

## Conflict behavior

- Same exact event retry: returns the original event as an idempotent replay.
- Same prediction ID with a different canonical snapshot: returns HTTP-style conflict (409); no second prediction can be recorded under that ID.
- Same prediction ID with a different outcome label: returns conflict (409); labels cannot be overwritten.
- A uniqueness index without its corresponding event is treated as an integrity fault, not silently repaired.
- Concurrent writes use Firestore exists/update-time preconditions. A winning competing append is replayed when identical; otherwise the identity conflict is surfaced.
- Pagination tokens are checked for repetition and bounded by a maximum page count. The verifier never reports a partial history as valid.

## Verification contract

`readEvents(ownerId)` returns all persisted events ordered by sequence. `verify(ownerId)` validates sequence continuity, previous-hash linkage, canonical event hashes, and agreement with the separately persisted head document. A broken chain or head mismatch returns `valid: false`; Firestore read failures throw a service-unavailable error.

## Scope and safety

This remains a server-only persistence primitive. It is not connected to application routes, user-facing UI, scheduled outcome workers, strategy evaluation, broker clients, Alpaca, or order execution. No production writes or deployment are enabled by this PR.

STOCK and OPTION records remain in the same append-only journal per owner but retain their asset-class field and are not pooled by calibration logic. The existing calibration implementation continues to calculate separate reports per asset class.
