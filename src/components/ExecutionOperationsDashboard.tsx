import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Bell, CheckCircle2, Clock3, Database, RefreshCw,
  ShieldCheck, TrendingUp, Wallet, Wifi, Download, Search, FileCheck2,
} from 'lucide-react';
import { auth } from '../lib/firebase';

type AlertRow = {
  alertId: string; type: string; severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string; message: string; status: string; source: string;
  firstSeenAt?: string; lastSeenAt?: string; occurrenceCount?: number;
  evidence?: Record<string, unknown>;
};
type DashboardState = {
  overview?: any;
  alerts: AlertRow[];
  worker?: any;
  reconciliation?: any;
  loadedAt?: string;
  runs: any[];
  integrityAudits: any[];
  ledger?: { clientOrderId: string; events: any[]; verification: any };
};

const fmtMoney = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '—';
};
const fmtDate = (value?: string) => value ? new Date(value).toLocaleString() : '—';
const severityClass = (severity: string) => severity === 'CRITICAL'
  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  : severity === 'WARNING' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  : 'border-sky-500/40 bg-sky-500/10 text-sky-300';

export const ExecutionOperationsDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardState>({ alerts: [], runs: [], integrityAudits: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [orderLookup, setOrderLookup] = useState('');
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [runFilter, setRunFilter] = useState('');
  const [integrityRunning, setIntegrityRunning] = useState(false);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in is required to view Alpaca execution operations.');
    const token = await user.getIdToken();
    const response = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (HTTP ${response.status}).`);
    return body;
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const [overview, alerts, worker, runHistory, integrityHistory] = await Promise.all([
        api('/api/alpaca/overview'),
        api('/api/alpaca/reconciliation/alerts?limit=200'),
        api('/api/alpaca/reconciliation/worker-status'),
        api('/api/alpaca/reconciliation/runs?limit=50'),
        api('/api/alpaca/reconciliation/integrity-audits?limit=20'),
      ]);
      setData(prev => ({
        ...prev,
        overview,
        alerts: Array.isArray(alerts.alerts) ? alerts.alerts : [],
        worker,
        runs: Array.isArray(runHistory.runs) ? runHistory.runs : [],
        integrityAudits: Array.isArray(integrityHistory.audits) ? integrityHistory.audits : [],
        loadedAt: new Date().toISOString(),
      }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load execution operations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const runPositionReconciliation = async () => {
    setReconciling(true);
    try {
      const result = await api('/api/alpaca/reconciliation/positions');
      setData(prev => ({ ...prev, reconciliation: result }));
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Position reconciliation failed.');
    } finally {
      setReconciling(false);
    }
  };


  const runAccountIntegrityAudit = async () => {
    setIntegrityRunning(true);
    try {
      const result = await api('/api/alpaca/reconciliation/integrity-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxOrders: 5000 }) });
      setData(prev => ({ ...prev, integrityAudits: [result, ...prev.integrityAudits.filter(item => item.auditId !== result.auditId)].slice(0, 20) }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account integrity audit failed.');
    } finally {
      setIntegrityRunning(false);
    }
  };

  const loadLedgerHistory = async (clientOrderId?: string) => {
    const id = (clientOrderId ?? orderLookup).trim();
    if (!id) { setError('Enter a client_order_id to inspect its immutable ledger history.'); return; }
    setLoadingLedger(true);
    try {
      const result = await api('/api/alpaca/orders/' + encodeURIComponent(id) + '/ledger');
      setData(prev => ({ ...prev, ledger: result }));
      setError(null);
    } catch (e) {
      setData(prev => ({ ...prev, ledger: undefined }));
      setError(e instanceof Error ? e.message : 'Ledger history could not be loaded.');
    } finally { setLoadingLedger(false); }
  };

  const downloadAudit = (format: 'json' | 'csv') => {
    const payload = { exportedAt: new Date().toISOString(), mode: 'PAPER', runs: data.runs, integrityAudits: data.integrityAudits, ledger: data.ledger || null };
    let content: string;
    let mime: string;
    if (format === 'json') {
      content = JSON.stringify(payload, null, 2);
      mime = 'application/json';
    } else {
      const events = data.ledger?.events || [];
      const columns = ['sequence', 'occurredAt', 'eventType', 'symbol', 'clientOrderId', 'brokerOrderId', 'payload', 'prevHash', 'entryHash'];
      const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
      content = [columns.join(','), ...events.map((event: any) => columns.map(key =>
        quote(key === 'payload' ? JSON.stringify(event[key] || {}) : event[key])).join(','))].join('\n');
      mime = 'text/csv;charset=utf-8';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'execution-audit-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + format;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const alerts = data.alerts.filter(alert => showResolved || alert.status === 'ACTIVE');
  const activeCount = data.alerts.filter(alert => alert.status === 'ACTIVE').length;
  const overview = data.overview || {};
  const account = overview.account || {};
  const positions = Array.isArray(overview.positions) ? overview.positions : [];
  const orders = Array.isArray(overview.orders) ? overview.orders : [];
  const fills = Array.isArray(overview.fills) ? overview.fills : [];
  const worker = data.worker?.worker || {};
  const lastRun = worker.lastRun;

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-16">
      <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 mb-2">
              <ShieldCheck className="w-4 h-4" /> BROKER OPERATIONS · PAPER MODE
            </div>
            <h1 className="text-2xl font-bold text-white">Execution Operations</h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Read-only account, order, fill, ledger and reconciliation visibility. Position reconciliation is an explicit on-demand audit action.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load(true)} disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={runPositionReconciliation} disabled={reconciling || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              <Activity className={`w-4 h-4 ${reconciling ? 'animate-pulse' : ''}`} /> {reconciling ? 'Reconciling…' : 'Run position audit'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-500">
          <span>Last refreshed: {fmtDate(data.loadedAt)}</span>
          <span>Broker mode: {overview.mode || 'PAPER'}</span>
          <span>Ledger: {data.worker?.ledgerConfigured ? 'Configured' : 'Unavailable / not configured'}</span>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
      {loading && <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">Loading authenticated broker operations…</div>}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Account equity', value: fmtMoney(account.equity), icon: Wallet },
          { label: 'Open positions', value: String(positions.length), icon: TrendingUp },
          { label: 'Active alerts', value: String(activeCount), icon: Bell },
          { label: 'Tracked orders', value: String(orders.length), icon: Database },
        ].map(item => {
          const Icon = item.icon;
          return <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400"><Icon className="w-4 h-4 text-emerald-400" />{item.label}</div>
            <div className="mt-3 text-2xl font-bold tabular-nums text-white">{item.value}</div>
          </div>;
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white flex items-center gap-2"><Bell className="w-4 h-4 text-amber-300" /> Operational alerts</h2>
            <button onClick={() => setShowResolved(v => !v)} className="text-xs text-emerald-300 hover:text-emerald-200">
              {showResolved ? 'Active only' : 'Include resolved'}
            </button>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {alerts.length === 0 && <p className="text-sm text-zinc-500 py-6 text-center">No alerts in this view.</p>}
            {alerts.map(alert => <article key={alert.alertId} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-sm text-zinc-100">{alert.title}</div>
                <div className="flex gap-1.5">
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span>
                  <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">{alert.status}</span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mt-1.5">{alert.message}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 text-[10px] text-zinc-500">
                <span>{alert.type}</span><span>Seen {alert.occurrenceCount || 1}×</span><span>Last: {fmtDate(alert.lastSeenAt)}</span>
              </div>
            </article>)}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-300" /> Reconciliation worker</h2>
          <div className="flex items-center gap-2 text-sm">
            {worker.running ? <RefreshCw className="w-4 h-4 text-amber-300 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
            <span className="text-zinc-200">{worker.running ? 'Run in progress' : 'Idle'}</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-zinc-500">Interval</span><span className="text-zinc-300">{worker.intervalMs ? `${Math.round(worker.intervalMs / 1000)}s` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Last status</span><span className="text-zinc-300">{lastRun?.status || 'No run recorded'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Reconciled</span><span className="text-zinc-300">{lastRun?.reconciled ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Failed</span><span className="text-zinc-300">{lastRun?.failed ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Completed</span><span className="text-zinc-300">{fmtDate(lastRun?.completedAt)}</span></div>
          </div>
          <div className="border-t border-zinc-800 pt-3 text-[11px] text-zinc-500 flex items-start gap-2">
            <Clock3 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Worker status is process-local; after a server restart its last in-memory run may be empty.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">Broker positions</h2>
          <span className="text-[10px] text-zinc-500">Alpaca snapshot · {fmtDate(overview.fetchedAt)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead><tr className="text-left text-zinc-500 border-b border-zinc-800"><th className="py-2">Symbol</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Market value</th><th className="text-right">Unrealized P/L</th></tr></thead>
            <tbody>{positions.slice(0, 100).map((p: any, i: number) => <tr key={p.asset_id || p.symbol || i} className="border-b border-zinc-800/70 text-zinc-300">
              <td className="py-2.5 font-semibold text-white">{p.symbol}</td><td>{p.side || '—'}</td><td className="text-right tabular-nums">{p.qty}</td><td className="text-right tabular-nums">{fmtMoney(p.market_value)}</td><td className="text-right tabular-nums">{fmtMoney(p.unrealized_pl)}</td>
            </tr>)}</tbody>
          </table>
          {positions.length === 0 && <p className="py-5 text-center text-xs text-zinc-500">No positions returned, or broker overview is unavailable.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-white">Recent broker activity</h2><span className="text-[10px] text-zinc-500">{fills.length} fills · {orders.length} orders returned</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead><tr className="text-left text-zinc-500 border-b border-zinc-800"><th className="py-2">Symbol / order</th><th>Side</th><th>Status</th><th className="text-right">Filled qty</th><th className="text-right">Avg. price</th></tr></thead>
            <tbody>{orders.slice(0, 12).map((o: any, i: number) => <tr key={o.id || i} className="border-b border-zinc-800/70 text-zinc-300">
              <td className="py-2.5"><div className="text-white font-medium">{o.symbol || '—'}</div><div className="text-[10px] text-zinc-500 font-mono">{o.client_order_id || o.id || ''}</div></td>
              <td>{o.side || '—'}</td><td>{o.status || '—'}</td><td className="text-right tabular-nums">{o.filled_qty ?? '—'}</td><td className="text-right tabular-nums">{fmtMoney(o.filled_avg_price)}</td>
            </tr>)}</tbody>
          </table>
          {orders.length === 0 && <p className="py-5 text-center text-xs text-zinc-500">No recent orders returned.</p>}
        </div>
      </section>

      {data.reconciliation && <section className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
        <h2 className="font-semibold text-emerald-200">Latest position audit</h2>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><div className="text-zinc-500">Matched</div><div className="text-xl font-bold text-white">{data.reconciliation.reconciliation?.summary?.ledgerNetEqualsBroker ?? 0}</div></div>
          <div><div className="text-zinc-500">Unattributed</div><div className="text-xl font-bold text-white">{data.reconciliation.reconciliation?.summary?.unattributedOrExternalActivity ?? 0}</div></div>
          <div><div className="text-zinc-500">Variance</div><div className="text-xl font-bold text-white">{data.reconciliation.reconciliation?.summary?.unexplainedVariance ?? 0}</div></div>
          <div><div className="text-zinc-500">Run ID</div><div className="mt-1 truncate font-mono text-zinc-300">{data.reconciliation.runId || '—'}</div></div>
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">A mismatch is a provenance signal, not proof of a broker defect. This audit never changes positions or orders.</p>
      </section>}


      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><h2 className="font-semibold text-white">Account-wide integrity audit</h2><p className="mt-1 text-xs text-zinc-500">Explicit read-only verification of indexed order ledgers. Maximum 5,000 orders per run; orders absent from the index are outside scope.</p></div>
          <button onClick={() => void runAccountIntegrityAudit()} disabled={integrityRunning} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{integrityRunning ? 'Auditing…' : 'Run integrity audit'}</button>
        </div>
        <div className="space-y-2">
          {data.integrityAudits.slice(0, 10).map((audit: any) => <article key={audit.auditId} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-zinc-100">{fmtDate(audit.completedAt || audit.startedAt)}</span><span className={audit.status === 'completed' && audit.coverageComplete ? 'text-[10px] font-bold text-emerald-300' : 'text-[10px] font-bold text-amber-300'}>{!audit.coverageComplete ? 'PARTIAL COVERAGE' : `${audit.status} · ${audit.integrityStatus || (audit.exceptionCount ? 'FINDINGS' : 'CLEAN')}`}</span></div>
            <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2 text-[10px] text-zinc-400">
              <span>Scanned <b className="text-zinc-200">{audit.scanned ?? 0}</b></span><span>Valid <b className="text-emerald-300">{audit.counts?.VALID ?? 0}</b></span><span>Invalid <b className="text-rose-300">{audit.counts?.INVALID ?? 0}</b></span><span>Missing <b className="text-zinc-200">{audit.counts?.MISSING_LEDGER ?? 0}</b></span><span>Unverifiable <b className="text-amber-300">{audit.counts?.UNVERIFIABLE ?? 0}</b></span><span>Index mismatch <b className="text-amber-300">{audit.counts?.INDEX_MISMATCH ?? 0}</b></span>
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">Indexed orders only · {audit.auditId}</p>
          </article>)}
          {data.integrityAudits.length === 0 && <p className="text-xs text-zinc-500">No account-wide integrity audits recorded yet.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-emerald-300" /> Audit & Traceability Center</h2>
            <p className="text-xs text-zinc-500 mt-1">Persistent reconciliation runs and verifiable per-order event history.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadAudit('json')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"><Download className="w-3.5 h-3.5" /> Export JSON</button>
            <button onClick={() => downloadAudit('csv')} disabled={!data.ledger?.events?.length} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"><Download className="w-3.5 h-3.5" /> Export events CSV</button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-medium text-zinc-200">Reconciliation run history</h3><span className="text-[10px] text-zinc-500">{data.runs.length} latest runs</span></div>
            <input value={runFilter} onChange={e => setRunFilter(e.target.value)} placeholder="Filter by run type, status or symbol…" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" />
            <div className="max-h-[340px] overflow-auto space-y-2">
              {data.runs.filter(run => !runFilter || [run.runType, run.status, run.runId, JSON.stringify(run.rows || [])].join(' ').toLowerCase().includes(runFilter.toLowerCase())).map((run: any) =>
                <article key={run.runId} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-zinc-100">{run.runType || 'ORDER_RECONCILIATION'}</span><span className={run.status === 'completed' ? 'text-[10px] uppercase font-bold text-emerald-300' : run.status === 'failed' ? 'text-[10px] uppercase font-bold text-rose-300' : 'text-[10px] uppercase font-bold text-amber-300'}>{run.status}</span></div>
                  <div className="mt-1 text-[10px] text-zinc-500">{fmtDate(run.completedAt || run.startedAt)} · {run.runId}</div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]"><span className="text-zinc-400">Scanned <b className="text-zinc-200">{run.scanned ?? '—'}</b></span><span className="text-zinc-400">OK <b className="text-zinc-200">{run.reconciled ?? '—'}</b></span><span className="text-zinc-400">Failed <b className="text-zinc-200">{run.failed ?? '—'}</b></span><span className="text-zinc-400">Errors <b className="text-zinc-200">{run.errorCount ?? '—'}</b></span></div>
                  {Array.isArray(run.rows) && run.rows.length > 0 && <div className="mt-2 text-[10px] text-zinc-500">Symbols: {run.rows.slice(0, 8).map((row: any) => row.symbol || row.clientOrderId).filter(Boolean).join(', ')}{run.rows.length > 8 ? '…' : ''}</div>}
                </article>
              )}
              {data.runs.length === 0 && <p className="py-6 text-center text-xs text-zinc-500">No persisted reconciliation runs found.</p>}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-200">Order ledger inspection</h3>
            <div className="flex gap-2">
              <input value={orderLookup} onChange={e => setOrderLookup(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void loadLedgerHistory(); }} placeholder="client_order_id" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500" />
              <button onClick={() => void loadLedgerHistory()} disabled={loadingLedger || !orderLookup.trim()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Search className="w-3.5 h-3.5" /> {loadingLedger ? 'Loading' : 'Inspect'}</button>
            </div>
            {data.ledger && <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-mono text-zinc-300">{data.ledger.clientOrderId}</span><span className={data.ledger.verification?.valid ? 'rounded-md border border-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300' : 'rounded-md border border-rose-500/40 px-2 py-1 text-[10px] font-bold text-rose-300'}>{data.ledger.verification?.valid ? 'HASH CHAIN VALID' : 'HASH CHAIN INVALID'}</span></div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400"><span>Events: <b className="text-zinc-200">{data.ledger.verification?.length ?? data.ledger.events?.length ?? 0}</b></span><span className="truncate">Head: <b className="font-mono text-zinc-300">{data.ledger.verification?.headHash || '—'}</b></span></div>
              <div className="max-h-[260px] overflow-auto space-y-1.5">
                {(data.ledger.events || []).map((event: any) => <div key={event.eventId} className="grid grid-cols-[42px_1fr_auto] items-start gap-2 border-t border-zinc-800 pt-2 text-[10px]">
                  <span className="font-mono text-zinc-500">#{event.sequence}</span><div><div className="font-semibold text-zinc-200">{event.eventType} · {event.symbol}</div><div className="text-zinc-500">{fmtDate(event.occurredAt)} · {JSON.stringify(event.payload || {})}</div><div className="font-mono text-zinc-600 break-all">SHA {event.entryHash}</div></div><span className="text-emerald-400">✓</span>
                </div>)}
              </div>
            </div>}
            {!data.ledger && <p className="rounded-lg border border-dashed border-zinc-800 p-5 text-center text-xs text-zinc-500">Enter an order's client_order_id to load its complete ledger chain and verify every event.</p>}
          </div>
        </div>
        <p className="text-[10px] text-zinc-600">Run history is bounded to the latest 50 records. CSV exports the currently inspected order's events; JSON exports the visible run history and inspected ledger. No broker mutations are available here.</p>
      </section>

      <p className="text-[10px] text-zinc-600 flex items-center gap-2"><Wifi className="w-3 h-3" /> Dashboard refresh is manual; it does not poll Alpaca continuously or initiate trading activity.</p>
    </div>
  );
};
