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


## P1.32 — Integrity-gated persisted calibration read model

The Firestore journal adapter exposes a read-only `getCalibrationReport(ownerId, minimumSampleSize?)` operation. It reads one event-history snapshot, verifies its contiguous sequence/hash chain against the persisted head, and blocks report generation if integrity fails. It then rehydrates the prediction/outcome domain journal to enforce semantic pairing before building the report.

The result contains independent STOCK and OPTION cohort reports plus integrity metadata (verified event count and head hash). Only labeled outcomes enter calibration; predictions without outcomes remain excluded. STOCK benchmark coverage and OPTION exit-method cohorts retain their P1.28 definitions. The default thin-sample threshold remains 30.

This is an owner-scoped server-side read model only. It adds no HTTP route, UI, scheduled worker, automatic labeling, broker/Alpaca access, order routing, or autotrading integration.


## P1.33 — Authenticated calibration read API

The server exposes `GET /api/research/prediction-calibration` as a read-only endpoint. It verifies the Firebase ID token, derives the Firestore owner scope exclusively from the verified Firebase UID (never from a request parameter), and returns the separate STOCK and OPTION calibration cohorts from P1.32. `minimumSampleSize` is optional (default 30; accepted range 1–10,000). Responses use `Cache-Control: no-store` and `Vary: Authorization`.

The route fails closed when Firebase authentication or Firestore storage is unavailable, rejects malformed UIDs and thresholds, and propagates integrity failures rather than returning unverified metrics. It has no write method, no user-supplied owner selector, no scheduler, and no integration with stock/options order execution or broker APIs.


## P1.34 — Read-only calibration dashboard

The Quant Lab exposes a Prediction Calibration dashboard backed by the authenticated P1.33 read endpoint. It obtains a Firebase ID token from the signed-in client session and never accepts an owner identifier from the browser. The user can switch between STOCK and OPTION reports and select the minimum cohort sample threshold.

The dashboard displays the verified journal integrity state, labeled sample size, multiclass accuracy/Brier/log-loss, positive-class Brier, mean confidence, positive-class reliability buckets, STOCK-only benchmark coverage/excess-return diagnostics, forecast-horizon cohorts, and OPTION exit-method cohorts. STOCK and OPTION remain isolated throughout the UI; option reports do not receive stock benchmark metrics.

The dashboard is read-only. It does not create predictions, label outcomes, modify portfolios, connect to broker APIs, submit orders, or control either the stock or options autotrading bot. Thin-sample labels are operational warnings only and must not be interpreted as statistical significance or evidence of future profitability.


## P1.35 — Integrity-gated walk-forward calibration dashboard

The authenticated calibration endpoint now includes a read-only walk-forward report for STOCK and OPTION independently. The Firestore adapter verifies the append-only event chain and head, rehydrates semantic prediction/outcome pairs, then builds three expanding-window chronological folds from five quantile partitions of distinct labeled prediction timestamps. The evaluation cutoff is captured once per asset-class report; timestamps at or after that cutoff are excluded. At least five distinct timestamps are required; otherwise the report explicitly returns unavailable rather than manufacturing folds.

Each fold exposes train/calibration/test assigned, eligible and purged counts. Training metrics remain omitted; calibration and test metrics are available only for outcomes observable by their respective boundaries. The aggregate reports sample-weighted test accuracy, multiclass Brier and log loss, plus descriptive fold-level standard deviations. Test windows are non-overlapping. The dashboard displays test accuracy and 95% Wilson intervals for accuracy and positive-outcome rate, and warns when the total eligible test sample is below the configured threshold.

These are automatically partitioned historical cohorts, not a user-pre-registered strategy backtest or fitted probability calibrator. Quantile partitioning is a convenience for chronological diagnostics and must not be treated as proof of out-of-sample alpha, investment edge, or statistical significance. No prediction/outcome writes, scheduler, broker, order routing, portfolio mutation, or stock/options autotrading integration is introduced.


## P1.36 — Temporal calibration degradation diagnostics

The walk-forward aggregate now compares the latest chronological test fold with a sample-weighted baseline formed from all earlier eligible test folds. STOCK and OPTION are evaluated independently through their existing separate reports. The comparison exposes baseline/latest sample sizes and deltas for accuracy, multiclass Brier score and log loss.

A read-only operational warning is emitted only when both the prior-fold baseline and latest fold meet the configured minimum sample size. The default thresholds are an accuracy decline of at least 10 percentage points, a multiclass Brier increase of at least 0.05, or a log-loss increase of at least 0.10. Any triggered threshold yields `POTENTIAL_DEGRADATION`; otherwise the report is `NO_CLEAR_DEGRADATION`. If either comparison sample is too small, the status is `INSUFFICIENT_DATA` and no degradation signal is emitted.

These fixed thresholds are monitoring heuristics, not hypothesis tests, p-values, causal attribution, or proof that a strategy has stopped working. Fold composition, market regime, label mix and option exit-method mix can change over time; investigate those effects before drawing conclusions. This diagnostic does not change risk limits, pause strategies, modify predictions, label outcomes, or control either stock or options autotrading bot. It is a read-only research warning only.

## P1.37 — Single-snapshot calibration API

The authenticated calibration endpoint now calls one owner-scoped Firestore read-model operation, `getCalibrationSnapshot`. The operation reads the append-only event history once, verifies that exact history against the persisted head once, rehydrates and semantically validates prediction/outcome pairs once, then derives the standard cohort reports and chronological walk-forward reports from the same in-memory records.

The evaluation cutoff is captured once and shared by STOCK and OPTION walk-forward calculations. The response therefore has one integrity length/head hash and one event-history revision for both report families. If the persisted head changes during the history read/verification window, integrity validation fails closed instead of returning mixed or unverified sections. Legacy report methods remain available as compatibility wrappers, but the HTTP endpoint uses only the combined snapshot method.

Tests assert one history read and one head verification for a combined report, separate STOCK/OPTION results, and rejection of a tampered journal. This is a read-only consistency and efficiency improvement: no journal writes, outcome labeling, scheduled work, portfolio changes, broker/Alpaca calls, order routing, or control of either autotrading bot is introduced.


## P1.38 — Temporal degradation diagnostics in Quant Lab

The Prediction Calibration dashboard surfaces the existing walk-forward temporal degradation assessment independently for STOCK and OPTION. It compares the latest chronological test fold with the sample-weighted prior-fold baseline and displays baseline/latest sample counts, fold identity, accuracy delta, multiclass Brier delta, log-loss delta, status, and triggered heuristic thresholds.

The dashboard consumes the assessment already included in each integrity-gated aggregate; it does not calculate a second diagnostic or perform another Firestore read. The parser validates status, sample counts, finite deltas, and allowed trigger identifiers before rendering. STOCK and OPTION assessments remain separate. Option calibration remains based on contract outcomes; stock benchmark-adjusted performance remains limited to rows with benchmark observations in the existing STOCK cohort report.

POTENTIAL_DEGRADATION is an operational monitoring heuristic (accuracy drop of at least 10 percentage points, multiclass Brier increase of at least 0.05, or log-loss increase of at least 0.10), not a statistical significance test, causal attribution, or proof of lost edge. If either baseline or latest sample is below the configured minimum, the status is INSUFFICIENT_DATA and no signal is emitted. This is a read-only dashboard enhancement: it does not alter strategy parameters, risk limits, predictions, outcomes, broker connectivity, order routing, or either autotrading bot.


## P1.40 — Walk-forward payload accounting invariants

The client parser now validates cross-field sample accounting before displaying
walk-forward diagnostics:

- Every segment must satisfy assigned = eligible + purged.
- Training segments must not expose calibration metrics or uncertainty intervals.
- Calibration and test segments must have metrics and uncertainty when eligible
  sample size is nonzero, and both must be absent for empty eligible segments.
- Segment metric sample size must equal the eligible sample count.
- Fold IDs must be unique.
- Aggregate fold count and test sample size must match the supplied folds, and
  the thin-sample flag must agree with the configured minimum sample threshold.

These checks reject internally inconsistent or partially fabricated API
payloads at the UI boundary. They do not replace server-side journal integrity
verification and do not change STOCK/OPTION evaluation or execution behavior.


## P1.41 — Prediction origin provenance

Prediction snapshots may now include an optional immutable `origin` envelope
to identify the source that produced the research decision:

- `kind`: STOCK_BOT, OPTION_BOT, WATCHLIST, SCANNER, CHART, MANUAL, or RESEARCH.
- `sourceId`: required stable source/run identifier.
- Optional `strategyId`, `decisionId`, `candidateId`, and `runId` identifiers.

The origin envelope is part of the canonical prediction snapshot hash and the
append-only journal event, so changing the source identity changes the
prediction identity digest. STOCK_BOT origins are accepted only for STOCK
predictions; OPTION_BOT origins only for OPTION predictions. Identifiers are
bounded and validated. Older snapshots without an origin remain valid.

This is a provenance contract only. It does not automatically capture bot
signals, read or modify bot queues, submit orders, or connect research
predictions to broker executions. Any future adapter must be separately
authorized, read-only at the execution boundary, and preserve independent
STOCK and OPTION records.


## P1.42 — Origin-based calibration cohorts

The integrity-gated calibration snapshot now partitions labeled predictions by their immutable origin kind, independently for STOCK and OPTION. Supported cohorts are STOCK_BOT, OPTION_BOT, WATCHLIST, SCANNER, CHART, MANUAL, RESEARCH, and LEGACY_UNATTRIBUTED for historical predictions without origin metadata. Each cohort reports the existing multiclass calibration metrics and thin-sample warning. Cohort counts must sum exactly to the asset-class overall sample size; the client parser rejects unknown, duplicate, cross-asset, or incomplete origin partitions. Internal source/run IDs are not exposed in aggregate responses. These are observational cohorts, not causal estimates or proof of strategy performance. No bot signal capture, broker access, order routing, or autotrading behavior is introduced.


## P1.44 — Authenticated semantic outcome-labeling API

The research router exposes `POST /api/research/predictions/:predictionId/outcome`. It requires a verified Firebase ID token and derives journal ownership exclusively from the verified UID. Request bodies are strictly allowlisted and must match the STOCK or OPTION outcome schema. The Firestore adapter verifies the complete journal chain and rehydrates the domain journal before applying a label, enforcing prediction existence, asset-class agreement, target maturity, valid outcome values, and immutable one-label semantics. New labels return HTTP 201; exact retries return HTTP 200; semantic conflicts retain HTTP 409. This is a manual research workflow only: no automatic labeling, broker execution inspection, or autotrading-bot connection is introduced.

## P1.46 — Integrity-gated pending prediction review queue

The server exposes an authenticated, read-only `GET /api/research/predictions/pending` endpoint. Ownership is derived exclusively from the verified Firebase UID. The Firestore adapter reads one complete event history, verifies its append-only hash chain and persisted head, then rehydrates semantic prediction/outcome records before identifying predictions that do not yet have an immutable outcome label.

The endpoint supports an optional exact `STOCK` or `OPTION` filter and bounded offset pagination (limit 1–100; offset 0–100,000). Results are ordered deterministically by target time, creation time and prediction ID. The response exposes only review metadata needed by the queue; evidence source references, journal event hashes, and raw Firestore records are not returned. Integrity or semantic validation failures block the listing.

The queue is manual research workflow infrastructure. It does not label outcomes, infer results, read broker executions, alter portfolios, activate scheduled jobs, route orders, or control either stock or options autotrading bot. STOCK and OPTION remain separately filterable and are never pooled.
