import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  MarketHealthDailyPoint,
  MarketHealthReport,
  MarketHealthSnapshotPoint,
  SentimentLabel,
} from '../utils/marketHealthEngine';

interface MarketHealthGaugePanelProps {
  report: MarketHealthReport | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function getScoreTextColor(score: number): string {
  if (score <= 24) return 'text-rose-400';
  if (score <= 44) return 'text-orange-400';
  if (score <= 55) return 'text-amber-300';
  if (score <= 74) return 'text-lime-400';
  return 'text-emerald-400';
}

function getScoreCircleStyle(score: number): string {
  if (score <= 24) return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  if (score <= 44) return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
  if (score <= 55) return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  if (score <= 74) return 'bg-lime-500/20 text-lime-300 border-lime-500/40';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function formatSignedBillions(val: number): string {
  const abs = Math.abs(val).toFixed(1);
  return val < 0 ? `-$${abs}B` : `+$${abs}B`;
}

const FearGreedGaugeSvg: React.FC<{ score: number; label: SentimentLabel }> = ({ score, label }) => {
  const clamped = Math.max(0, Math.min(100, score));
  // Gauge runs from 180 deg (left, 0) through 270 deg (top, 50) to 360 deg (right, 100)
  const cx = 130;
  const cy = 122;
  const r = 92;

  const segments = [
    { from: 180, to: 223, color: '#e11d48' }, // 0-24 Extreme Fear
    { from: 225, to: 259, color: '#f97316' }, // 25-44 Fear
    { from: 261, to: 279, color: '#eab308' }, // 45-55 Neutral
    { from: 281, to: 314, color: '#84cc16' }, // 56-74 Greed
    { from: 316, to: 360, color: '#10b981' }, // 75-100 Extreme Greed
  ];

  const needleAngle = 180 + (clamped / 100) * 180;
  const tip = polarToCartesian(cx, cy, r - 18, needleAngle);
  const baseL = polarToCartesian(cx, cy, 7, needleAngle - 90);
  const baseR = polarToCartesian(cx, cy, 7, needleAngle + 90);

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 260 164"
        className="w-full max-w-[260px] overflow-visible"
        role="img"
        aria-label={`Market Fear and Greed Index: ${clamped} out of 100 (${label})`}
      >
        {/* Background track */}
        <path
          d={describeArc(cx, cy, r, 180, 360)}
          fill="none"
          stroke="#27272a"
          strokeWidth="18"
          strokeLinecap="butt"
        />
        {/* 5 Zone Arcs */}
        {segments.map((seg, idx) => (
          <path
            key={idx}
            d={describeArc(cx, cy, r, seg.from, seg.to)}
            fill="none"
            stroke={seg.color}
            strokeWidth="18"
            strokeOpacity={0.88}
          />
        ))}
        {/* Scale ticks */}
        <text x="10" y="132" fill="#71717a" fontSize="10" fontFamily="monospace">
          0
        </text>
        <text x="123" y="15" fill="#71717a" fontSize="10" fontFamily="monospace">
          50
        </text>
        <text x="234" y="132" fill="#71717a" fontSize="10" fontFamily="monospace">
          100
        </text>
        <text x="6" y="156" fill="#fb7185" fontSize="9.5" fontWeight="600">
          Extreme Fear
        </text>
        <text x="184" y="156" fill="#34d399" fontSize="9.5" fontWeight="600">
          Extreme Greed
        </text>

        {/* Needle */}
        <polygon
          points={`${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${baseL.x.toFixed(1)},${baseL.y.toFixed(1)} ${baseR.x.toFixed(1)},${baseR.y.toFixed(1)}`}
          fill="#f4f4f5"
        />
        <circle cx={cx} cy={cy} r="9" fill="#18181b" stroke="#f4f4f5" strokeWidth="2.5" />
      </svg>

      <div className="mt-1 flex items-baseline gap-2.5">
        <span
          data-testid="market-health-score"
          className={`text-3xl font-bold font-mono tabular-nums ${getScoreTextColor(clamped)}`}
        >
          {clamped}
        </span>
        <span className="text-sm font-semibold text-zinc-100">{label}</span>
      </div>
    </div>
  );
};

const SnapshotRow: React.FC<{ title: string; snap: MarketHealthSnapshotPoint | null }> = ({
  title,
  snap,
}) => (
  <div className="flex items-center justify-between py-2 border-b border-zinc-800/80 last:border-b-0">
    <div>
      <div className="text-xs text-zinc-400">{title}</div>
      <div className={`text-xs font-semibold ${snap ? getScoreTextColor(snap.score) : 'text-zinc-500'}`}>
        {snap ? snap.label : 'Unavailable'}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {snap && snap.vix !== null && (
        <span className="text-[11px] font-mono tabular-nums text-zinc-400">
          VIX {snap.vix.toFixed(1)}
        </span>
      )}
      <span
        className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold font-mono tabular-nums ${
          snap ? getScoreCircleStyle(snap.score) : 'bg-zinc-900 text-zinc-500 border-zinc-800'
        }`}
      >
        {snap ? snap.score : '—'}
      </span>
    </div>
  </div>
);

export const MarketHealthGaugePanel: React.FC<MarketHealthGaugePanelProps> = ({
  report,
  loading,
  error,
  onRefresh,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (loading && !report) {
    return (
      <section
        data-testid="market-health-panel"
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="h-5 w-64 bg-zinc-800 rounded animate-pulse" />
          <div className="h-7 w-24 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-44 bg-zinc-950/70 rounded-lg animate-pulse" />
          <div className="h-44 bg-zinc-950/70 rounded-lg animate-pulse" />
          <div className="h-44 bg-zinc-950/70 rounded-lg animate-pulse" />
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section
        data-testid="market-health-panel"
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-white">Market Health & 1-Month Sentiment Feed</h2>
            <p className="text-xs text-zinc-400 mt-1">
              {error || 'Live SPY, ^VIX, and sector dollar volume feeds are temporarily unavailable.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Feed</span>
        </button>
      </section>
    );
  }

  const { current, snapshots, history1M } = report;
  const activePoint: MarketHealthDailyPoint =
    hoveredIdx !== null && history1M[hoveredIdx]
      ? history1M[hoveredIdx]
      : history1M[history1M.length - 1];

  const total1MVol = current.buyingVolume1MBillions + current.sellingVolume1MBillions;
  const buy1MPct = total1MVol > 0 ? Math.round((current.buyingVolume1MBillions / total1MVol) * 100) : 50;
  const sell1MPct = 100 - buy1MPct;

  const safetyMeta =
    current.safetyStatus === 'SAFE_RISK_ON'
      ? {
          title: 'Safe to Enter (1.0x Size)',
          cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
          Icon: ShieldCheck,
        }
      : current.safetyStatus === 'CAUTIOUS'
      ? {
          title: 'Cautious Regime (0.5x Size)',
          cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
          Icon: AlertTriangle,
        }
      : {
          title: 'Crash Defense (New Entries Halted)',
          cls: 'text-rose-300 bg-rose-500/15 border-rose-500/40',
          Icon: ShieldAlert,
        };
  const SafetyIcon = safetyMeta.Icon;

  // Chart dimensions for 1-Month Sentiment + VIX and 1-Month Net Volume Flow
  const chartW = 460;
  const chartH = 128;
  const padX = 30;
  const padR = 38;
  const padY = 14;
  const innerW = chartW - padX - padR;
  const innerH = chartH - padY * 2;

  const vixValues = history1M.map((d) => d.vix).filter((v): v is number => v !== null);
  const vixMin = vixValues.length > 0 ? Math.max(8, Math.min(...vixValues) - 2) : 10;
  const vixMax = vixValues.length > 0 ? Math.max(vixMin + 8, Math.max(...vixValues) + 2) : 35;

  const scorePoints = history1M
    .map((d, i) => {
      const x = padX + (history1M.length > 1 ? (i / (history1M.length - 1)) * innerW : innerW / 2);
      const y = padY + (1 - d.sentimentScore / 100) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const vixPoints = history1M
    .map((d, i) => {
      if (d.vix === null) return null;
      const x = padX + (history1M.length > 1 ? (i / (history1M.length - 1)) * innerW : innerW / 2);
      const norm = (d.vix - vixMin) / Math.max(1, vixMax - vixMin);
      const y = padY + (1 - norm) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((p): p is string => p !== null)
    .join(' ');

  const maxAbsNetFlow = Math.max(
    1,
    ...history1M.map((d) => Math.abs(d.netFlowBillions))
  );
  const midY = padY + innerH / 2;

  return (
    <section
      data-testid="market-health-panel"
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Market Health &amp; Fear/Greed Index
            </h2>
            <span className="text-xs text-zinc-400">·</span>
            <span className="text-xs text-zinc-400 font-mono tabular-nums">
              As of {report.asOf} · {report.history1YCount} trading days analyzed
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real SPY trend, CBOE ^VIX term structure, sector breadth, and 1-month institutional dollar volume (buying vs selling) wired directly into Auto-Trading risk gates.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div
            data-testid="market-safety-badge"
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${safetyMeta.cls}`}
          >
            <SafetyIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{safetyMeta.title}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh Market Health"
            className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top 3-Column Section: Gauge + Historical Snapshots + VIX & Auto-Trade Guard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Col 1: Semicircular Fear & Greed Gauge */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center py-2">
          <FearGreedGaugeSvg score={current.score} label={current.label} />
          <div className="mt-3 text-[11px] text-zinc-400 font-mono tabular-nums text-center">
            SPY ${current.spyPrice.toFixed(2)} ({current.spyChangePct >= 0 ? '+' : ''}
            {current.spyChangePct.toFixed(2)}% 1D · {current.spy5dReturnPct >= 0 ? '+' : ''}
            {current.spy5dReturnPct.toFixed(2)}% 5D)
          </div>
        </div>

        {/* Col 2: Historical Snapshots (Previous Close, 1W, 1M, 1Y) matching screenshot */}
        <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-x border-zinc-800 pt-4 lg:pt-0 lg:px-6">
          <div className="text-xs font-semibold text-zinc-300 mb-2">Historical Sentiment Trajectory</div>
          <SnapshotRow title="Previous Close" snap={snapshots.previousClose} />
          <SnapshotRow title="1 Week Ago" snap={snapshots.oneWeekAgo} />
          <SnapshotRow title="1 Month Ago" snap={snapshots.oneMonthAgo} />
          <SnapshotRow title="1 Year Ago" snap={snapshots.oneYearAgo} />
        </div>

        {/* Col 3: VIX Regime, 4 Sub-Components & Auto-Trading Guard */}
        <div className="lg:col-span-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="py-1.5 border-b border-zinc-800/80">
              <div className="text-zinc-400">CBOE ^VIX Spot</div>
              <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
                {current.vix !== null ? current.vix.toFixed(2) : 'N/A'}
                {current.vix3m !== null && (
                  <span className="text-[11px] font-normal text-zinc-400 ml-1.5">
                    / 3M {current.vix3m.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                Curve: <span className={current.vixTermStructure === 'BACKWARDATION' ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'}>{current.vixTermStructure}</span>
              </div>
            </div>

            <div className="py-1.5 border-b border-zinc-800/80">
              <div className="text-zinc-400">1M Net Volume Flow</div>
              <div
                className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                  current.netVolume1MBillions >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatSignedBillions(current.netVolume1MBillions)}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                Buy {buy1MPct}% / Sell {sell1MPct}% ({current.buySellRatio1M.toFixed(2)}x)
              </div>
            </div>
          </div>

          {/* 1-Month Buy vs Sell Volume Dominance Split Bar */}
          <div className="space-y-1">
            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${buy1MPct}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${sell1MPct}%` }} />
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            {[
              { label: 'SPY Trend & Momentum (25%)', val: current.momentumScore },
              { label: 'VIX & Term Structure (25%)', val: current.vixScore },
              { label: 'Net Buying vs Selling Vol (25%)', val: current.volumeScore },
              { label: 'Sector Breadth & Safe-Haven (25%)', val: current.breadthScore },
            ].map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">{row.label}</span>
                  <span className="font-mono tabular-nums font-semibold text-zinc-200">{row.val}/100</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      row.val >= 55 ? 'bg-emerald-500' : row.val >= 35 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${row.val}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-zinc-400 pt-1">
            <span className="text-zinc-200 font-semibold">Auto-Trader Rule: </span>
            {current.reasons.join(' · ')}
          </div>
        </div>
      </div>

      {/* Bottom 2-Column 1-Month History Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-zinc-800">
        {/* Chart 1: 1-Month Sentiment Score (0-100) + VIX */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="font-semibold text-zinc-200">
              1-Month Sentiment &amp; ^VIX Trajectory ({history1M.length} sessions)
            </div>
            <div className="font-mono tabular-nums text-[11px] text-zinc-400">
              {activePoint.date} · Score{' '}
              <span className={getScoreTextColor(activePoint.sentimentScore)}>
                {activePoint.sentimentScore}
              </span>{' '}
              · VIX {activePoint.vix !== null ? activePoint.vix.toFixed(1) : '—'}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-2">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36">
              {/* Extreme Fear danger zone (< 32) */}
              <rect
                x={padX}
                y={padY + (1 - 32 / 100) * innerH}
                width={innerW}
                height={(32 / 100) * innerH}
                fill="#e11d48"
                fillOpacity="0.09"
              />
              {/* 50 Neutral line */}
              <line
                x1={padX}
                y1={padY + innerH * 0.5}
                x2={padX + innerW}
                y2={padY + innerH * 0.5}
                stroke="#3f3f46"
                strokeDasharray="3 3"
              />
              {/* 32 Crash Defense threshold */}
              <line
                x1={padX}
                y1={padY + (1 - 32 / 100) * innerH}
                x2={padX + innerW}
                y2={padY + (1 - 32 / 100) * innerH}
                stroke="#fb7185"
                strokeOpacity="0.45"
                strokeDasharray="2 3"
              />

              {/* Sentiment polyline */}
              {scorePoints && (
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.2"
                  points={scorePoints}
                />
              )}

              {/* VIX dashed overlay */}
              {vixPoints && (
                <polyline
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="1.6"
                  strokeDasharray="4 3"
                  points={vixPoints}
                />
              )}

              {/* Interactive hover bands */}
              {history1M.map((pt, i) => {
                const x =
                  padX + (history1M.length > 1 ? (i / (history1M.length - 1)) * innerW : innerW / 2);
                const bandW = innerW / Math.max(1, history1M.length);
                const yScore = padY + (1 - pt.sentimentScore / 100) * innerH;
                return (
                  <g
                    key={pt.date}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-crosshair"
                  >
                    <rect
                      x={x - bandW / 2}
                      y={padY}
                      width={bandW}
                      height={innerH}
                      fill="transparent"
                    />
                    {hoveredIdx === i && (
                      <>
                        <line x1={x} y1={padY} x2={x} y2={padY + innerH} stroke="#52525b" />
                        <circle cx={x} cy={yScore} r="4" fill="#10b981" stroke="#09090b" strokeWidth="1.5" />
                      </>
                    )}
                  </g>
                );
              })}

              <text x="4" y={padY + 6} fill="#71717a" fontSize="9" fontFamily="monospace">
                100
              </text>
              <text x="8" y={padY + innerH * 0.5 + 3} fill="#71717a" fontSize="9" fontFamily="monospace">
                50
              </text>
              <text x="12" y={padY + innerH} fill="#fb7185" fontSize="9" fontFamily="monospace">
                0
              </text>
              <text x={padX + innerW + 5} y={padY + 6} fill="#fbbf24" fontSize="8.5" fontFamily="monospace">
                {vixMax.toFixed(0)}v
              </text>
              <text x={padX + innerW + 5} y={padY + innerH} fill="#fbbf24" fontSize="8.5" fontFamily="monospace">
                {vixMin.toFixed(0)}v
              </text>
            </svg>
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-2 pt-1">
              <span>{history1M[0]?.date}</span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400">— Health Score (0-100)</span>
                <span className="text-amber-400">-- ^VIX Index</span>
              </div>
              <span>{history1M[history1M.length - 1]?.date}</span>
            </div>
          </div>
        </div>

        {/* Chart 2: 1-Month Net Buying vs Net Selling Dollar Volume Flow */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="font-semibold text-zinc-200 inline-flex items-center gap-1.5">
              {activePoint.netFlowBillions >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              )}
              <span>1-Month Net Buying vs Selling Volume ($B)</span>
            </div>
            <div className="font-mono tabular-nums text-[11px] text-zinc-400">
              Buy ${activePoint.buyingVolumeBillions.toFixed(1)}B / Sell $
              {activePoint.sellingVolumeBillions.toFixed(1)}B · Net{' '}
              <span className={activePoint.netFlowBillions >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {formatSignedBillions(activePoint.netFlowBillions)}
              </span>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-2">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36">
              <line x1={padX} y1={midY} x2={padX + innerW} y2={midY} stroke="#3f3f46" />
              {history1M.map((pt, i) => {
                const step = innerW / Math.max(1, history1M.length);
                const barW = Math.max(4, step * 0.68);
                const x = padX + i * step + (step - barW) / 2;
                const h = (Math.abs(pt.netFlowBillions) / maxAbsNetFlow) * (innerH / 2 - 4);
                const isPos = pt.netFlowBillions >= 0;
                const y = isPos ? midY - h : midY;
                return (
                  <g
                    key={pt.date}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-crosshair"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(2, h)}
                      rx="1.5"
                      fill={isPos ? '#10b981' : '#f43f5e'}
                      fillOpacity={hoveredIdx === i ? 1 : 0.82}
                    />
                  </g>
                );
              })}
              <text x="4" y={padY + 6} fill="#34d399" fontSize="9" fontFamily="monospace">
                +$B
              </text>
              <text x="6" y={midY + 3} fill="#71717a" fontSize="9" fontFamily="monospace">
                0
              </text>
              <text x="4" y={padY + innerH} fill="#fb7185" fontSize="9" fontFamily="monospace">
                -$B
              </text>
            </svg>
            <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-zinc-400 px-2 pt-1">
              <span>1M Buy: ${current.buyingVolume1MBillions.toFixed(1)}B</span>
              <span>1M Sell: ${current.sellingVolume1MBillions.toFixed(1)}B</span>
              <span className={current.netVolume1MBillions >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                1M Net: {formatSignedBillions(current.netVolume1MBillions)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Timeframe Structural Context (Institutional Buy Zone · LVN Volume Gap · Volume Spike Sentiment) */}
      {(report.structuralContext?.spy || report.structuralContext?.qqq) && (
        <div
          data-testid="market-structural-context-strip"
          className="pt-4 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          {[report.structuralContext?.spy, report.structuralContext?.qqq]
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((ctx) => {
              const regimeColor =
                ctx.regime === 'AT_INSTITUTIONAL_BUY_ZONE'
                  ? 'text-sky-300 bg-sky-500/15 border-sky-500/35'
                  : ctx.regime === 'IN_VOLUME_GAP'
                    ? 'text-amber-300 bg-amber-500/15 border-amber-500/35'
                    : ctx.regime === 'BELOW_STRUCTURAL_SUPPORT'
                      ? 'text-rose-300 bg-rose-500/15 border-rose-500/35'
                      : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35';
              const regimeLabel =
                ctx.regime === 'AT_INSTITUTIONAL_BUY_ZONE'
                  ? 'INSTITUTIONAL BUY ZONE'
                  : ctx.regime === 'IN_VOLUME_GAP'
                    ? 'IN VOLUME GAP (LVN)'
                    : ctx.regime === 'BELOW_STRUCTURAL_SUPPORT'
                      ? 'BELOW SUPPORT'
                      : 'VALUE TREND';
              return (
                <div
                  key={ctx.symbol}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 flex flex-col gap-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-white">{ctx.symbol}</span>
                      <span className="text-zinc-400 tabular-nums">${ctx.spotPrice.toFixed(2)}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${regimeColor}`}>
                      {regimeLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-zinc-400">
                    <span>
                      Buy Zone:{' '}
                      <strong className="text-sky-300">
                        {ctx.institutionalBuyZone
                          ? `$${ctx.institutionalBuyZone.low.toFixed(2)}–$${ctx.institutionalBuyZone.high.toFixed(2)}`
                          : '—'}
                      </strong>
                    </span>
                    <span>
                      Vol Sent:{' '}
                      <strong className={ctx.mtfVolumeSentiment >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {ctx.mtfVolumeSentiment > 0 ? '+' : ''}
                        {ctx.mtfVolumeSentiment}/10 ({ctx.volumeSentimentLabel})
                      </strong>
                      {ctx.isChurnAbsorption ? ' · CHURN' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
};
