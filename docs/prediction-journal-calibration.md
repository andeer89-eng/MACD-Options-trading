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

## P1.26 — Multiclass calibration scores

The calibration report now includes:
- **Multiclass Brier score**: sum of squared errors across POSITIVE, NEUTRAL and NEGATIVE probabilities, averaged per prediction.
- **Multiclass log loss**: negative log probability assigned to the realized class, with a numerical floor of 1e-15.
- **Three-class accuracy**: argmax probability class compared with the realized outcome class.

The existing one-vs-rest positive Brier score and positive-probability reliability buckets remain available for continuity. Every report is still explicitly scoped to one asset class; callers must request STOCK and OPTION independently. Empty cohorts return zero-valued aggregate metrics and sampleSize=0; consumers must use sampleSize to distinguish an empty report from a measured zero score.

Tests cover positive, neutral and negative realized outcomes and verify that STOCK and OPTION remain separate. No persistence, API route, worker, UI, broker or execution integration is introduced.


## P1.28 — Cohort-based calibration and evaluation

`calculateCohortCalibration(records, assetClass, minimumSampleSize = 30)` supplements the unchanged global `calculateCalibration` API. It filters predictions and outcomes to the requested asset class before calculating any metric; STOCK and OPTION are never pooled.

### Horizon cohorts

Predictions are grouped by elapsed calendar-day horizon between `createdAt` and `targetAt`, using disjoint bands:
- `0-1d`: up to and including 1 day;
- `1-7d`: over 1 and up to 7 days;
- `7-30d`: over 7 and up to 30 days;
- `30-90d`: over 30 and up to 90 days;
- `90d+`: over 90 days.

Each cohort carries the same multiclass and one-vs-rest calibration metrics as the global report.

### Asset-specific evaluation

- **OPTION:** calibration is reported independently for `CLOSED`, `MARK_TO_MARKET` and `EXPIRED` exit methods. Contract-return labels remain the outcome target; underlying return is not substituted.
- **STOCK:** benchmark-relative evaluation uses only observations with `benchmarkReturnPct`. It reports benchmark coverage, mean excess return (`totalReturnPct - benchmarkReturnPct`) and the fraction of observations with positive excess return. If no benchmark observations exist, return metrics are `null` and coverage is zero.

### Sample-size interpretation

Every calibration cohort and benchmark report includes `belowMinimumSample`. The default threshold is 30 and can be overridden with a positive integer. This is an operational warning for thin samples, not a claim of statistical significance or a guarantee of calibration quality. Empty cohorts remain present with `sampleSize=0`; consumers must not interpret zero-valued metrics as measured performance.

This milestone adds only pure research calculations and tests. It does not add API routes, UI, automated outcome labeling, scheduled workers, broker/Alpaca access, or stock/options autotrading integration.


## P1.29 — Calibration uncertainty intervals

`calculateCalibrationUncertainty(records, assetClass)` reports two-sided 95% Wilson score intervals for observed classification accuracy and positive-outcome frequency. It also reports intervals for observed positive rates inside each positive-probability reliability bucket. STOCK reports additionally include the interval for benchmark outperformance frequency, using only observations with a benchmark return. OPTION results use option contract outcomes and are never pooled with STOCK.

Intervals are `null` for empty samples. These are sampling-uncertainty intervals for proportions, not confidence bounds on expected returns, proof of predictive edge, or a substitute for out-of-sample validation. The calculation is deterministic and read-only; no journal writes, outcome labeling, scheduler, broker, or autotrading integration is added.


## P1.30 — Chronological walk-forward calibration evaluation

calculateWalkForwardCalibration(records, assetClass, folds) evaluates each asset class independently over explicitly supplied train, calibration and test windows. Windows use half-open prediction-creation intervals (startAt <= createdAt < endAt) and must be strictly chronological and non-overlapping.

- Training observations are counted only when their outcomes were observable by calibration.startAt minus embargoMs; training metrics are deliberately omitted.
- Calibration observations are scored only when outcomes were observable by test.startAt minus embargoMs.
- Test observations are scored only when outcomes were observable by the fold's explicit evaluationAsOf.
- Late observations are reported as purged rather than silently included. The optional non-negative embargo is applied at the train/calibration and calibration/test boundaries.
- Calibration and test segments report multiclass calibration metrics and the P1.29 uncertainty intervals. Each fold reports assigned, eligible and purged sample sizes.
- Folds require unique IDs, valid finite time boundaries and an evaluation cutoff no earlier than test-window end. Invalid early outcome labels are rejected.

These are chronological evaluation cohorts, not a fitted probability calibrator or a claim of out-of-sample alpha. The caller must supply economically meaningful, pre-registered windows and a cutoff consistent with the data's actual availability. STOCK and OPTION are never pooled. This remains a pure read-only research calculation: no journal writes, automatic labeling, API/UI, scheduler, broker, order routing or autotrading integration.


## P1.31 — Walk-forward fold aggregation and stability

summarizeWalkForwardCalibration(reports, minimumSampleSize = 30) aggregates test-fold results for one asset class only. Test windows must be non-overlapping, preventing the same prediction from being counted more than once in aggregate metrics. The report includes sample-weighted accuracy, multiclass Brier score and log loss, plus unweighted population standard deviation of fold-level accuracy and multiclass Brier score as simple fold-stability diagnostics.

The aggregate reports total eligible test sample size and a configurable minimum-sample warning (default 30). Empty folds remain visible with null metrics; if all folds are empty, aggregate metrics and dispersion are null. Mixed STOCK/OPTION reports, duplicate fold IDs and overlapping test windows are rejected. Fold dispersion is descriptive, not a statistical significance test. Results remain read-only and do not authorize or trigger stock/options autotrading.
