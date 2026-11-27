# P1.22 — Prediction Journal & Calibration

## Scope and safety

This milestone records research decisions and their later outcomes for both STOCK and OPTION assets. It is not an execution ledger and must not submit, modify, cancel, or reconcile broker orders. The first implementation is a pure domain core with an in-memory reference implementation; it is **not yet durable production storage**.

## Prediction snapshot

Each immutable prediction binds:
- prediction ID, asset class, symbol and (for options) exact OCC contract identity;
- creation time, target evaluation horizon, evidence-pack ID and SHA-256;
- committee and independent-judge timestamps, disposition and risk multiplier;
- confidence, a three-class probability distribution (positive / neutral / negative), cited source refs;
- optional provider/model/prompt-version metadata.

The probability vector must be finite, each value in [0,1], and sum to 1. The journal stores both a stable input digest (retry idempotency) and a snapshot digest (recorded representation).

## Append-only event model

`PREDICTION_RECORDED` and `OUTCOME_LABELED` events are hash chained with sequence numbers and a genesis hash. Duplicate prediction IDs are accepted only for byte-equivalent canonical inputs; conflicting reuse is rejected. Outcome labels are idempotent only when identical; conflicting relabels are rejected. Production persistence must implement atomic append/CAS and immutable event creation; the in-memory implementation is for deterministic tests only.

## Outcome contracts

- STOCK: realized total return, optional benchmark return, outcome class, realization/observation timestamps and label provenance.
- OPTION: realized contract return and underlying return, entry premium, exit value, exit method (closed / mark-to-market / expired), timestamps and label provenance. Contract and underlying outcomes remain distinct; option labels must not be inferred from underlying direction alone.

A label cannot be recorded before the prediction's target horizon or before the observation timestamp. Labels are separate from predictions so the original decision cannot be rewritten.

## Calibration

The initial report computes a one-vs-rest positive Brier score, threshold accuracy, mean confidence and reliability buckets. STOCK and OPTION are always reported separately. This first pass is a baseline metric, not a complete multiclass calibration suite. Neutral outcomes are treated as non-positive for the one-vs-rest metric; a later milestone should add multiclass Brier/log-loss and horizon/exit-method cohorts.

## Not included

- No live LLM/provider invocation.
- No Firestore/production persistence adapter or scheduled outcome-label worker.
- No UI, watchlist mutation, scheduler activation, broker or Alpaca integration.
- No live or paper trading execution eligibility; the journal is research-only.

## Acceptance gates

1. Validate STOCK and OPTION prediction schemas independently.
2. Reject evidence hash, probability, contract identity, timestamp and outcome-class mismatches.
3. Verify event-chain integrity and retry idempotency.
4. Prevent early, duplicate-conflicting or cross-asset labels.
5. Calculate calibration reports without pooling the two asset classes.
6. Keep all execution interfaces untouched.