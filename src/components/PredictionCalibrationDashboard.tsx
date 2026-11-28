import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';
import { CalibrationMetrics, CalibrationPayload, CalibrationCohort as Cohort, CalibrationAssetReport as AssetReport,
  WalkForwardAssetReport, WilsonInterval, parseCalibrationPayload, selectCalibrationReport } from '../utils/predictionCalibrationView';

type AssetClass = 'STOCK' | 'OPTION';
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

function TemporalDegradationPanel({ assessment }: { assessment: NonNullable<NonNullable<WalkForwardAssetReport['aggregate']>['degradation']> }) {
  const statusLabel = assessment.status === 'POTENTIAL_DEGRADATION' ? 'Potential degradation' : assessment.status === 'NO_CLEAR_DEGRADATION' ? 'No clear degradation' : 'Insufficient data';
  const delta = (value: number | null) => value === null ? '—' : String((value * 100).toFixed(1)) + ' pp';
  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-white">Temporal degradation monitor</h4>
        <span className={assessment.status === 'POTENTIAL_DEGRADATION' ? 'text-[10px] font-semibold text-amber-300' : 'text-[10px] text-zinc-400'}>{statusLabel}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 xl:grid-cols-4 gap-2 text-[10px]">
        <div><span className="text-zinc-500">Prior-fold baseline</span><div className="mt-1 font-mono text-zinc-200">N={assessment.baselineSampleSize} · {assessment.baselineFoldCount} folds</div></div>
        <div><span className="text-zinc-500">Latest fold</span><div className="mt-1 font-mono text-zinc-200">{assessment.latestFoldId || '—'} · N={assessment.latestSampleSize}</div></div>
        <div><span className="text-zinc-500">Accuracy Δ</span><div className="mt-1 font-mono text-zinc-200">{delta(assessment.accuracyDelta)}</div></div>
        <div><span className="text-zinc-500">Multiclass Brier Δ</span><div className="mt-1 font-mono text-zinc-200">{assessment.multiclassBrierDelta === null ? '—' : assessment.multiclassBrierDelta.toFixed(3)}</div></div>
        <div><span className="text-zinc-500">Log-loss Δ</span><div className="mt-1 font-mono text-zinc-200">{assessment.logLossDelta === null ? '—' : assessment.logLossDelta.toFixed(3)}</div></div>
      </div>
      {assessment.status === 'POTENTIAL_DEGRADATION' && <p className="mt-2 text-[10px] text-amber-200">Triggered: {assessment.triggeredBy.map(value => value.replace(/_/g, ' ').toLowerCase()).join(', ') || 'threshold review required'}.</p>}
      {assessment.status === 'INSUFFICIENT_DATA' && <p className="mt-2 text-[10px] text-zinc-500">Both the prior-fold baseline and latest fold must meet the configured minimum sample size before a warning is emitted.</p>}
      <p className="mt-2 text-[10px] text-zinc-500">Operational heuristic only—not a significance test, causal diagnosis, or proof that a strategy has stopped working. No risk limits or autotrading controls are changed.</p>
    </div>
  );
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
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 mt-3">
          <MetricCard label="Weighted test accuracy" value={pct(aggregate.weightedMeanAccuracy)} />
          <MetricCard label="Weighted multiclass Brier" value={fixed(aggregate.weightedMeanMulticlassBrierScore)} />
          <MetricCard label="Weighted log loss" value={fixed(aggregate.weightedMeanLogLoss)} />
          <MetricCard label="Accuracy fold SD" value={pct(aggregate.accuracyFoldStdDev)} />
          <MetricCard label="Brier fold SD" value={fixed(aggregate.multiclassBrierFoldStdDev)} />
        </div>
        <TemporalDegradationPanel assessment={aggregate.degradation} />
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


type PendingPrediction = {
  predictionId: string; assetClass: 'STOCK' | 'OPTION'; symbol: string; contractId?: string;
  createdAt: number; targetAt: number; disposition: string; confidence: number;
  probabilities: { positive: number; neutral: number; negative: number };
  origin: { kind: string } | null;
};

function PendingPredictionReviewQueue() {
  const { user } = useAuth();
  const [assetClass, setAssetClass] = useState<'STOCK' | 'OPTION'>('STOCK');
  const [rows, setRows] = useState<PendingPrediction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PendingPrediction | null>(null);
  const [outcome, setOutcome] = useState<'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'>('POSITIVE');
  const [realizedAtInput, setRealizedAtInput] = useState(() => {
    const local = new Date();
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 16);
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [exitMethod, setExitMethod] = useState<'CLOSED' | 'MARK_TO_MARKET' | 'EXPIRED'>('CLOSED');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pageSize = 25;
  const load = useCallback(async (nextOffset = 0) => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/research/predictions/pending?assetClass=${assetClass}&limit=${pageSize}&offset=${nextOffset}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Queue request failed (HTTP ${response.status}).`);
      if (body?.integrity?.valid !== true || body?.integrity?.headMatches !== true || !Array.isArray(body.predictions)) throw new Error('Journal integrity is unverified; rows withheld.');
      setRows(body.predictions); setTotal(body.total); setOffset(nextOffset); setSelected(null);
    } catch (e) { setRows([]); setTotal(0); setError(e instanceof Error ? e.message : 'Queue unavailable.'); }
    finally { setLoading(false); }
  }, [user, assetClass]);
  useEffect(() => { void load(0); }, [load]);
  const setField = (key: string, value: string) => setFields(prev => ({ ...prev, [key]: value }));
  const submit = async () => {
    if (!user || !selected) return;
    const required = assetClass === 'STOCK' ? ['totalReturnPct'] : ['contractReturnPct','underlyingReturnPct','entryPremium','exitValue'];
    const numeric: Record<string, number> = {};
    for (const key of required) {
      const n = Number(fields[key]);
      if (fields[key]?.trim() === '' || !Number.isFinite(n)) { setError(`Enter a valid ${key}.`); return; }
      numeric[key] = n;
    }
    if (assetClass === 'STOCK' && fields.benchmarkReturnPct?.trim()) {
      const n = Number(fields.benchmarkReturnPct);
      if (!Number.isFinite(n)) { setError('Enter a valid benchmark return.'); return; }
      numeric.benchmarkReturnPct = n;
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      const realizedAt = Date.parse(realizedAtInput);
      const observedAt = Date.now();
      if (!Number.isSafeInteger(realizedAt) || realizedAt > observedAt) { setError('Realized-at time must be a valid date/time no later than now.'); return; }
      const token = await user.getIdToken();
      const payload = { assetClass, realizedAt, observedAt, outcome, labelSource: 'manual-review',
        ...numeric, ...(assetClass === 'OPTION' ? { exitMethod } : {}) };
      const response = await fetch(`/api/research/predictions/${encodeURIComponent(selected.predictionId)}/outcome`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Outcome label failed (HTTP ${response.status}).`);
      setNotice(`Outcome recorded for ${selected.predictionId}.`); setFields({}); await load(offset);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to label outcome.'); }
    finally { setSaving(false); }
  };
  const matured = (row: PendingPrediction) => row.targetAt <= Date.now();
  const input = (key: string, label: string, optional = false) => (
    <label key={key} className="text-[10px] text-zinc-400">{label}{optional ? ' (optional)' : ''}
      <input type="number" step="any" value={fields[key] || ''} onChange={e => setField(key,e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-white" />
    </label>
  );
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-white">Pending outcome review</h3>
          <p className="mt-1 text-[10px] text-zinc-500">Manual labeling of integrity-verified predictions. No bot or order controls.</p></div>
        <div className="flex gap-2">
          {(['STOCK','OPTION'] as const).map(a => <button key={a} onClick={() => setAssetClass(a)} className={`rounded-lg px-3 py-2 text-[10px] ${a===assetClass?'bg-indigo-600 text-white':'bg-zinc-800 text-zinc-400'}`}>{a}</button>)}
          <button onClick={() => void load(offset)} disabled={loading} className="rounded-lg border border-zinc-700 px-3 py-2 text-[10px] text-white">{loading?'Loading…':'Refresh'}</button>
        </div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs text-emerald-200">{notice}</div>}
      <div className="text-[10px] text-zinc-500">{total} pending {assetClass.toLowerCase()} predictions</div>
      {rows.length===0 && !loading && <p className="py-5 text-center text-xs text-zinc-500">No pending predictions on this page.</p>}
      <div className="space-y-2">{rows.map(row => <button key={row.predictionId} onClick={() => {setSelected(row);setError(null);}}
        className={`w-full rounded-lg border p-3 text-left ${selected?.predictionId===row.predictionId?'border-indigo-400 bg-indigo-950/20':'border-zinc-800 bg-zinc-950/50'}`}>
        <div className="flex flex-wrap justify-between gap-2"><b className="text-xs text-white">{row.symbol} {row.contractId||''}</b>
          <span className={`text-[9px] ${matured(row)?'text-emerald-300':'text-amber-300'}`}>{matured(row)?'Horizon reached':'Awaiting target date'}</span></div>
        <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-zinc-400"><span>Target {new Date(row.targetAt).toLocaleDateString()}</span>
          <span>Confidence {(row.confidence*100).toFixed(1)}%</span><span>P+ {(row.probabilities.positive*100).toFixed(1)}%</span>
          <span>P0 {(row.probabilities.neutral*100).toFixed(1)}%</span><span>P− {(row.probabilities.negative*100).toFixed(1)}%</span></div>
        <div className="mt-1 text-[9px] text-zinc-600">{row.predictionId} · {row.disposition} · {row.origin?.kind||'unknown'}</div>
      </button>)}</div>
      <div className="flex justify-between"><button disabled={loading||offset===0} onClick={()=>void load(Math.max(0,offset-pageSize))} className="text-[10px] text-zinc-400 disabled:opacity-30">Previous</button>
        <button disabled={loading||offset+pageSize>=total} onClick={()=>void load(offset+pageSize)} className="text-[10px] text-zinc-400 disabled:opacity-30">Next</button></div>
      {selected && <div className="rounded-xl border border-zinc-700 bg-zinc-950/70 p-4 space-y-3">
        <div className="text-xs font-semibold text-white">Label outcome · {selected.symbol}</div>
        {!matured(selected) && <p className="text-[10px] text-amber-300">Target time has not been reached. Server-side maturity validation will reject premature labels.</p>}
        <label className="block text-[10px] text-zinc-400">When was the outcome realized?
          <input type="datetime-local" value={realizedAtInput} onChange={e=>setRealizedAtInput(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-white" />
        </label>
        <label className="block text-[10px] text-zinc-400">Realized class<select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)} className="mt-1 block w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-white">
          <option>POSITIVE</option><option>NEUTRAL</option><option>NEGATIVE</option></select></label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{assetClass==='STOCK' ?
          <>{input('totalReturnPct','Total return (%)')}{input('benchmarkReturnPct','Benchmark return (%)',true)}</> :
          <>{input('contractReturnPct','Contract return (%)')}{input('underlyingReturnPct','Underlying return (%)')}{input('entryPremium','Entry premium')}{input('exitValue','Exit value')}
            <label className="text-[10px] text-zinc-400">Exit method<select value={exitMethod} onChange={e=>setExitMethod(e.target.value as typeof exitMethod)} className="mt-1 block w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-white">
              <option value="CLOSED">Closed</option><option value="MARK_TO_MARKET">Mark to market</option><option value="EXPIRED">Expired</option></select></label></>}</div>
        <button onClick={()=>void submit()} disabled={saving||loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving?'Saving…':'Record immutable outcome'}</button>
        <p className="text-[9px] text-zinc-600">Append-only immutable label. Verify realized values manually; no broker execution import.</p>
      </div>}
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
      const parsed = parseCalibrationPayload(body);
      if (!parsed) throw new Error('The calibration API returned an invalid, incomplete, or unverified report. Metrics are withheld.');
      setPayload(parsed);
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

  const report = useMemo(() => payload ? selectCalibrationReport(payload, assetClass) : null, [payload, assetClass]);
  
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

      <PendingPredictionReviewQueue />

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
          <CohortTable title={`${assetClass === 'OPTION' ? 'Option' : 'Stock'} prediction-origin cohorts`} cohorts={report.originCohorts} />
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
