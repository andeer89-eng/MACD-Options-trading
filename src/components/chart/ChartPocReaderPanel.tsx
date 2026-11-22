import React from 'react';
import { BarChart3, Target, ShieldAlert, Sparkles, Compass } from 'lucide-react';
import type { ChartPocReading } from '../../utils/volumeProfileEngine';

interface ChartPocReaderPanelProps {
  reading: ChartPocReading | null;
}

export const ChartPocReaderPanel: React.FC<ChartPocReaderPanelProps> = ({ reading }) => {
  if (!reading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 shadow-xl">
        <div className="flex items-center gap-2 font-bold text-white mb-1">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <span>CHART &amp; POC READER</span>
        </div>
        <p className="text-zinc-500">Loading visible-range Volume Profile &amp; POC structure...</p>
      </div>
    );
  }

  const biasColors =
    reading.bias === 'BULLISH'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
      : reading.bias === 'BEARISH'
        ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/35';

  // Spot position inside [VAL, VAH] scale (clamped 4..96% for marker visibility)
  const span = Math.max(0.01, reading.vah - reading.val);
  const spotPct = Math.max(3, Math.min(97, ((reading.spotPrice - reading.val) / span) * 100));
  const pocPct = Math.max(8, Math.min(92, ((reading.poc - reading.val) / span) * 100));

  return (
    <div
      data-testid="chart-poc-reader-panel"
      className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-white tracking-wide truncate">
            CHART &amp; POC READER
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono shrink-0 ${biasColors}`}>
          {reading.bias}
        </span>
      </div>

      {/* Archetype & Value Area Position */}
      <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
          <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{reading.archetype}</span>
        </div>
        <div className="text-[10px] text-zinc-400">{reading.vaPositionLabel}</div>
      </div>

      {/* Key Value Area Telemetry (VAL / POC / VAH) */}
      <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] tabular-nums">
        <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
          <span className="text-[9px] text-sky-400 block uppercase">VAL (70%)</span>
          <strong className="text-zinc-100">${reading.val.toFixed(2)}</strong>
        </div>
        <div className="p-2 rounded bg-amber-950/30 border border-amber-500/40">
          <span className="text-[9px] text-amber-400 block uppercase">POC</span>
          <strong className="text-amber-300">${reading.poc.toFixed(2)}</strong>
        </div>
        <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
          <span className="text-[9px] text-sky-400 block uppercase">VAH (70%)</span>
          <strong className="text-zinc-100">${reading.vah.toFixed(2)}</strong>
        </div>
      </div>

      {/* Visual Value Area Slider Gauge */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 tabular-nums">
          <span>Spot vs Value Area</span>
          <span className={reading.pocDistancePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {reading.pocDistancePct >= 0 ? '+' : ''}
            {reading.pocDistancePct}% vs POC
          </span>
        </div>
        <div className="relative h-2.5 bg-zinc-950 rounded-full border border-zinc-800 overflow-hidden">
          <div className="absolute inset-y-0 left-0 right-0 bg-sky-500/15"></div>
          {/* POC Marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
            style={{ left: `${pocPct}%` }}
            title={`POC: $${reading.poc.toFixed(2)}`}
          />
          {/* Spot Marker */}
          <div
            className="absolute top-0.5 bottom-0.5 w-2 rounded-full bg-emerald-400 shadow"
            style={{ left: `calc(${spotPct}% - 4px)` }}
            title={`Spot: $${reading.spotPrice.toFixed(2)}`}
          />
        </div>
      </div>

      {/* HVN / LVN / Magnet / Invalidation */}
      <div className="space-y-1.5 text-[11px] font-mono tabular-nums">
        <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
          <span className="text-zinc-400 flex items-center gap-1 font-sans">
            <Target className="w-3 h-3 text-emerald-400" />
            <span>Primary Magnet:</span>
          </span>
          <span className="text-emerald-300 font-bold">
            ${reading.primaryMagnet.price.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
          <span className="text-zinc-400 flex items-center gap-1 font-sans">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>Invalidation:</span>
          </span>
          <span className="text-rose-300 font-bold">
            ${reading.invalidation.price.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
          <span className="text-zinc-400 font-sans">HVN Support / Res:</span>
          <span className="text-zinc-200">
            {reading.nearestHvnSupport ? `$${reading.nearestHvnSupport.toFixed(2)}` : '—'} /{' '}
            {reading.nearestHvnResistance ? `$${reading.nearestHvnResistance.toFixed(2)}` : '—'}
          </span>
        </div>
        {reading.nearestLvnVacuum !== null && (
          <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
            <span className="text-zinc-400 font-sans">LVN Vacuum Zone:</span>
            <span className="text-indigo-300 font-semibold">
              ${reading.nearestLvnVacuum.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Synthesized Actionable Chart Read */}
      <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Structural Read ({reading.symbol} · {reading.timeframe})</span>
        </div>
        <ul className="space-y-1 text-[11px] text-zinc-300 leading-relaxed">
          {reading.thesisBullets.map((line, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="text-amber-400 shrink-0">&bull;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
