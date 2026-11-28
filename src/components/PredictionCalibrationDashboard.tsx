import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';

type AssetClass = 'STOCK' | 'OPTION';
type CalibrationMetrics = {
  assetClass: AssetClass;
  sampleSize: number;
  brierScore: number;
  multiclassBrierScore: number;
  logLoss: number;
  accuracy: number;
  meanConfidence: number;
  reliability: Array<{
    bucket: string;
    count: number;
    meanPredictedPositive: number;
    observedPositiveRate: number;
  }>;
};
type Cohort = { key: string; report: CalibrationMetrics; belowMinimumSample: boolean };
type AssetReport = {
  assetClass: AssetClass;
  overall: CalibrationMetrics;
  horizonCohorts: Cohort[];
  benchmark?: {
    sampleSize: number;
    coverage: number;
    meanExcessReturnPct: number | null;
    positiveExcessRate: number | null;
    belowMinimumSample: boolean;
  };
  exitMethodCohorts?: Cohort[];
};
type WilsonInterval = { lower: number; upper: number } | null;
type WalkForwardSegment = {
  assignedSampleSize: number;
  eligibleSampleSize: number;
  purgedSampleSize: number;
  calibration: CalibrationMetrics | null;
  uncertainty: {
    accuracy: WilsonInterval;
    positiveOutcomeRate: WilsonInterval;
  } | null;
};
type WalkForwardFold = {
  foldId: string;
  train: WalkForwardSegment;
  calibration: WalkForwardSegment;
  test: WalkForwardSegment;
};
type WalkForwardAssetReport = {
  assetClass: AssetClass;
  available: boolean;
  reason: string | null;
  distinctTimestamps: number;
  folds: WalkForwardFold[];
  aggregate: null | {
    foldCount: number;
    testSampleSize: number;
    belowMinimumSample: boolean;
    weightedMeanAccuracy: number | null;
    weightedMeanMulticlassBrierScore: number | null;
    weightedMeanLogLoss: number | null;
    accuracyFoldStdDev: number | null;
    multiclassBrierFoldStdDev: number | null;
    degradation: {
      status: 'INSUFFICIENT_DATA' | 'NO_CLEAR_DEGRADATION' | 'POTENTIAL_DEGRADATION';
      baselineFoldCount: number;
      baselineSampleSize: number;
      latestFoldId: string | null;
      latestSampleSize: number;
      accuracyDelta: number | null;
      multiclassBrierDelta: number | null;
      logLossDelta: number | null;
      triggeredBy: Array<'ACCURACY_DROP' | 'BRIER_INCREASE' | 'LOG_LOSS_INCREASE'>;
    };
  };
};
type CalibrationPayload = {
  walkForward: {
    methodology: string;
    minimumSampleSize: number;
    stock: WalkForwardAssetReport;
    option: WalkForwardAssetReport;
  };
  integrity: { valid: boolean; headMatches: boolean; length: number; headHash: string };
  stock: AssetReport;
  option: AssetReport;
  readOnly: true;
};

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
const fixed = (value: number | null | undefined, digits = 3) =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</div>
      <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-white">{value}</div>
      {detail && <div className="mt-1 text-[10px] text-zinc-500">{detail}</div>}
    </div>
  );
}

function ReliabilityChart({ rows }: { rows: CalibrationMetrics['reliability'] }) {
  if (!rows.length) {
    return <div className="text-xs text-zinc-500 py-8 text-center">No labeled predictions in reliability buckets.</div>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[10px] text-zinc-500">
        <span><i className="inline-block w-2 h-2 rounded-sm bg-indigo-400 mr-1" />Predicted positive</span>
        <span><i className="inline-block w-2 h-2 rounded-sm bg-emerald-400 mr-1" />Observed positive</span>
      </div>
      {rows.map((row) => (
        <div key={row.bucket} className="grid grid-cols-[58px_1fr_36px] gap-3 items-center text-[11px]">
          <span className="font-mono text-zinc-400">{row.bucket}</span>
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.meanPredictedPositive * 100))}%` }} />
            </div>
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.observedPositiveRate * 100))}%` }} />
            </div>
          </div>
          <span className="text-right font-mono text-zinc-500">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

function formatInterval(interval: WilsonInterval): string {
  return interval ? `${(interval.lower * 100).toFixed(1)}–${(interval.upper * 100).toFixed(1)}%` : '—';
}

function WalkForwardPanel({ report, minimumSampleSize }: { report: WalkForwardAssetReport | undefined; minimumSampleSize: number }) {
  if (!report) return null;
  if (!report.available || !report.aggregate) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-semibold text-white">Walk-forward evaluation</h3>
        <p className="mt-2 text-xs text-zinc-400">{report.reason || 'Insufficient chronology to construct walk-forward folds.'}</p>
        <p className="mt-1 text-[10px] text-zinc-500">{report.distinctTimestamps} distinct prediction timestamps available.</p>
      </section>
    );
  }
  const aggregate = report.aggregate;
  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Walk-forward test stability</h3>
          <span className="text-[10px] text-zinc-500">{aggregate.foldCount} chronological folds · N={aggregate.testSampleSize}</span>
        </div>
        {aggregate.belowMinimumSample && <p className="mt-2 text-[11px] text-amber-300">Thin test sample: below configured minimum of {minimumSampleSize} observations. Interpret cautiously.</p>}
        <div className={`mt-3 rounded-lg border p-3 text-[11px] ${aggregate.degradation.status === 'POTENTIAL_DEGRADATION' ? 'border-amber-500/40 bg-amber-950/20 text-amber-200' : 'border-zinc-800 bg-zinc-950/40 text-zinc-300'}`}>
          <div className="font-semibold">Temporal degradation: {aggregate.degradation.status.replaceAll('_', ' ')}</div>
          <div className="mt-1 text-zinc-400">Latest fold {aggregate.degradation.latestFoldId || '—'} (N={aggregate.degradation.latestSampleSize}) vs prior-fold baseline (N={aggregate.degradation.baselineSampleSize}).</div>
          {aggregate.degradation.status === 'INSUFFICIENT_DATA' && <div className="mt-1 text-zinc-500">At least {minimumSampleSize} eligible observations are required in both the prior-fold baseline and latest fold.</div>}
          {aggregate.degradation.triggeredBy.length > 0 && <div className="mt-1">Signals: {aggregate.degradation.triggeredBy.join(', ').replaceAll('_', ' ')}.</div>}
          <div className="mt-1 text-zinc-500">Δ accuracy {pct(aggregate.degradation.accuracyDelta)} · Δ Brier {fixed(aggregate.degradation.multiclassBrierDelta)} · Δ log loss {fixed(aggregate.degradation.logLossDelta)}. Heuristic warning, not a statistical test.</div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 mt-3">
          <MetricCard label="Weighted test accuracy" value={pct(aggregate.weightedMeanAccuracy)} />
          <MetricCard label="Weighted multiclass Brier" value={fixed(aggregate.weightedMeanMulticlassBrierScore)} />
          <MetricCard label="Weighted log loss" value={fixed(aggregate.weightedMeanLogLoss)} />
          <MetricCard label="Accuracy fold SD" value={pct(aggregate.accuracyFoldStdDev)} />
          <MetricCard label="Brier fold SD" value={fixed(aggregate.multiclassBrierFoldStdDev)} />
        </div>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-white">Fold-by-fold chronology and maturity</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[11px]">
            <thead className="bg-zinc-950/70 text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Fold</th>
                <th className="px-3 py-2 text-right">Train assigned / eligible</th>
                <th className="px-3 py-2 text-right">Calibration eligible / purged</th>
                <th className="px-3 py-2 text-right">Test eligible / purged</th>
                <th className="px-3 py-2 text-right">Test accuracy</th>
                <th className="px-3 py-2 text-right">95% Wilson CI</th>
                <th className="px-3 py-2 text-right">Positive-rate CI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {report.folds.map((fold) => (
                <tr key={fold.foldId} className="text-zinc-300">
                  <td className="px-3 py-3 font-semibold">{fold.foldId}</td>
                  <td className="px-3 py-3 text-right font-mono">{fold.train.assignedSampleSize} / {fold.train.eligibleSampleSize}</td>
                  <td className="px-3 py-3 text-right font-mono">{fold.calibration.eligibleSampleSize} / {fold.calibration.purgedSampleSize}</td>
                  <td className="px-3 py-3 text-right font-mono">{fold.test.eligibleSampleSize} / {fold.test.purgedSampleSize}</td>
                  <td className="px-3 py-3 text-right font-mono">{pct(fold.test.calibration?.accuracy)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatInterval(fold.test.uncertainty?.accuracy ?? null)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatInterval(fold.test.uncertainty?.positiveOutcomeRate ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500">Expanding-window chronological evaluation; training metrics are intentionally omitted. Calibration/test labels are included only when observable by each fold boundary. Wilson intervals describe proportion uncertainty, not expected-return bounds or proof of edge.</p>
    </section>
  );
}

function CohortTable({ title, cohorts }: { title: string; cohorts: Cohort[] }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 text-sm font-semibold text-white">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead className="text-zinc-500 bg-zinc-950/70">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Cohort</th>
              <th className="text-right px-3 py-2 font-medium">N</th>
              <th className="text-right px-3 py-2 font-medium">Accuracy</th>
              <th className="text-right px-3 py-2 font-medium">Multi Brier</th>
              <th className="text-right px-4 py-2 font-medium">Log loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {cohorts.map((cohort) => (
              <tr key={cohort.key} className="text-zinc-300">
                <td className="px-4 py-3 font-medium">
                  {cohort.key}
                  {cohort.belowMinimumSample && <span className="ml-2 text-[9px] text-amber-400">THIN SAMPLE</span>}
                </td>
                <td className="px-3 py-3 text-right font-mono">{cohort.report.sampleSize}</td>
                <td className="px-3 py-3 text-right font-mono">{pct(cohort.report.accuracy)}</td>
                <td className="px-3 py-3 text-right font-mono">{fixed(cohort.report.multiclassBrierScore)}</td>
                <td className="px-4 py-3 text-right font-mono">{fixed(cohort.report.logLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const PredictionCalibrationDashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [assetClass, setAssetClass] = useState<AssetClass>('STOCK');
  const [minimumSampleSize, setMinimumSampleSize] = useState(30);
  const [payload, setPayload] = useState<CalibrationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadReport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/research/prediction-calibration?minimumSampleSize=${minimumSampleSize}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `Calibration request failed (HTTP ${response.status}).`);
      if (!body?.integrity?.valid || !body?.integrity?.headMatches) {
        throw new Error('The journal integrity status is not verified. Metrics are withheld.');
      }
      setPayload(body as CalibrationPayload);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load calibration report.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [user, minimumSampleSize]);

  useEffect(() => {
    if (user) void loadReport();
    else {
      setPayload(null);
      setError(null);
    }
  }, [user, loadReport]);

  const report = useMemo(() => payload?.[assetClass.toLowerCase() as 'stock' | 'option'], [payload, assetClass]);
  
  if (authLoading) {
    return <div className="p-8 text-sm text-zinc-400">Checking account session…</div>;
  }
  if (!user) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <ShieldCheck className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white">Sign in to view calibration</h2>
        <p className="text-sm text-zinc-400 mt-2">This report is private to the authenticated account and is read-only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Prediction Calibration</h2>
            <span className="text-[9px] px-2 py-1 rounded-full border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">READ ONLY</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Historical forecast quality, split by asset class. No trading or bot controls.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {(['STOCK', 'OPTION'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setAssetClass(item)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${assetClass === item ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {item}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-zinc-400">
            Min N
            <input aria-label="Minimum cohort sample size" type="number" min={1} max={10000} step={1}
              value={minimumSampleSize} onChange={(event) => setMinimumSampleSize(Math.max(1, Math.min(10000, Math.trunc(Number(event.target.value) || 1))))}
              className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-white font-mono" />
          </label>
          <button type="button" onClick={() => void loadReport()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</div>
      )}
      {loading && !payload && <div className="text-sm text-zinc-400 py-8 text-center">Loading integrity-verified report…</div>}

      {payload && report && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3 text-[11px]">
            <span className="inline-flex items-center gap-2 text-emerald-300"><CheckCircle2 className="w-4 h-4" /> Hash-chain integrity verified</span>
            <span className="font-mono text-zinc-400">{payload.integrity.length} events · head {payload.integrity.headHash.slice(0, 12)}…</span>
            {updatedAt && <span className="text-zinc-500">Updated {updatedAt.toLocaleTimeString()}</span>}
          </div>

          {report.overall.sampleSize === 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 inline mr-2" />No labeled {assetClass.toLowerCase()} predictions yet. Calibration metrics will appear after eligible outcomes are recorded.
            </div>
          )}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard label="Labeled predictions" value={String(report.overall.sampleSize)} detail={`Minimum cohort threshold: ${minimumSampleSize}`} />
            <MetricCard label="Accuracy" value={pct(report.overall.accuracy)} detail="Argmax class vs realized class" />
            <MetricCard label="Multiclass Brier" value={fixed(report.overall.multiclassBrierScore)} detail="Lower is better · 0 is ideal" />
            <MetricCard label="Log loss" value={fixed(report.overall.logLoss)} detail="Lower is better · penalizes overconfidence" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-white mb-1">Positive-class reliability</h3>
              <p className="text-[10px] text-zinc-500 mb-4">Predicted probability vs realized positive rate; labels show sample count.</p>
              <ReliabilityChart rows={report.overall.reliability} />
            </section>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Additional diagnostics</h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Positive Brier" value={fixed(report.overall.brierScore)} />
                <MetricCard label="Mean confidence" value={pct(report.overall.meanConfidence)} />
                {report.assetClass === 'STOCK' && report.benchmark && <>
                  <MetricCard label="Benchmark coverage" value={pct(report.benchmark.coverage)} detail={`${report.benchmark.sampleSize} benchmark-labeled rows`} />
                  <MetricCard label="Mean excess return" value={report.benchmark.meanExcessReturnPct === null ? '—' : `${report.benchmark.meanExcessReturnPct.toFixed(2)}%`} />
                  <MetricCard label="Positive excess rate" value={pct(report.benchmark.positiveExcessRate)} />
                </>}
              </div>
              {report.assetClass === 'OPTION' && (
                <p className="mt-3 text-[10px] text-zinc-500">Options cohorts are evaluated separately by exit method; no stock benchmark is applied.</p>
              )}
            </section>
          </div>

          <CohortTable title={`${assetClass === 'OPTION' ? 'Option' : 'Stock'} forecast-horizon cohorts`} cohorts={report.horizonCohorts} />
          <WalkForwardPanel report={payload.walkForward?.[assetClass.toLowerCase() as 'stock' | 'option']} minimumSampleSize={minimumSampleSize} />
          {report.assetClass === 'OPTION' && <CohortTable title="Option exit-method cohorts" cohorts={report.exitMethodCohorts || []} />}
          <p className="text-[10px] leading-relaxed text-zinc-500">
            Interpretation: cohort minimums are operational thin-sample warnings, not significance tests. Calibration scores describe historical probability quality; they do not establish future returns, profitability, or an execution edge. This dashboard does not modify predictions, outcomes, portfolios, broker accounts, or either autotrading bot.
          </p>
        </>
      )}
    </div>
  );
};
