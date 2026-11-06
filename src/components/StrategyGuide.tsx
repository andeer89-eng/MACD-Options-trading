import React, { useState } from 'react';
import {
  BookOpen,
  Award,
  TrendingDown,
  TrendingUp,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';

export const StrategyGuide: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'pillars' | 'triple-setup' | 'execution' | 'scaling'>(
    'triple-setup'
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
              <Award className="w-3.5 h-3.5" />
              <span>4-Time World Cup Championship Winner</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              David Trullàs Trading Rules & MACD Triple Divergence
            </h1>
            <p className="mt-2 text-sm sm:text-base text-zinc-400 max-w-3xl leading-relaxed">
              Spanish master trader David Trullàs (author and founder of <span className="text-zinc-200">Live in Trading</span>) gained global acclaim for winning the prestigious World Cup Championship of Day Trading Futures. He relies not on complex modern Order Flow or SMC hype, but on a rigorous discretionary system of <span className="text-emerald-400 font-medium">4 Classical Technical Pillars</span> centered around <span className="text-emerald-400 font-medium">MACD Triple Divergences</span>.
            </p>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-zinc-800/80">
          <button
            onClick={() => setActiveSubTab('triple-setup')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeSubTab === 'triple-setup'
                ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/20'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            1. MACD Triple Divergence Setup
          </button>
          <button
            onClick={() => setActiveSubTab('pillars')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeSubTab === 'pillars'
                ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/20'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            2. The 4 Analytical Pillars
          </button>
          <button
            onClick={() => setActiveSubTab('execution')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeSubTab === 'execution'
                ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/20'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            3. Fibonacci Entry & Stop Loss Rules
          </button>
          <button
            onClick={() => setActiveSubTab('scaling')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeSubTab === 'scaling'
                ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/20'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            4. Trullàs 3-Tranche Scaling & Sizing
          </button>
        </div>
      </div>

      {/* SECTION 1: TRIPLE DIVERGENCE SETUP */}
      {activeSubTab === 'triple-setup' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bullish Triple Divergence */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <TrendingUp className="w-5 h-5" />
                  <h3 className="font-bold text-base text-white">Bullish Triple Divergence (Reversal)</h3>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Exhaustion Long
                </span>
              </div>

              {/* Graphic Schema */}
              <div className="my-5 bg-zinc-950 p-4 rounded-lg border border-zinc-800/80 font-mono text-xs">
                <div className="text-zinc-500 mb-1">// Price Action: 3 Successive Lower Lows</div>
                <div className="text-zinc-300">
                  P1: $100.00 ↘ P2: $95.00 ↘ <span className="text-emerald-400 font-bold">P3: $90.00</span> (Lowest Low)
                </div>
                <div className="border-t border-zinc-900 my-3"></div>
                <div className="text-zinc-500 mb-1">// MACD (12,26,9): 3 Successive Higher Lows!</div>
                <div className="text-zinc-300">
                  M1: -2.40 ↗ M2: -1.50 ↗ <span className="text-emerald-400 font-bold">M3: -0.40</span> (Higher Lows)
                </div>
                <div className="border-t border-zinc-900 my-3"></div>
                <div className="text-zinc-500 mb-1">// Volume & RSI Behavior</div>
                <div className="text-emerald-300">
                  Volume: 1.5M ↘ 1.0M ↘ 0.4M (Selling Dry-up) • RSI: 26 ↗ 32 ↗ 41
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-zinc-300">
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Why double divergences fail:</strong> In strong downtrends, the market often traps traders on the first divergence (P1 → P2). Trullàs waits for the 3rd push (P3).
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">The Third Wave Exhaustion:</strong> The 3rd low represents capitulation without follow-through selling, confirmed by the MACD histogram failing to expand.
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Institutional Logic:</strong> Big players absorb the liquidity below P2, driving price briefly to P3 before triggering short squeezes.
                  </span>
                </li>
              </ul>
            </div>

            {/* Bearish Triple Divergence */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div className="flex items-center space-x-2 text-rose-400">
                  <TrendingDown className="w-5 h-5" />
                  <h3 className="font-bold text-base text-white">Bearish Triple Divergence (Reversal)</h3>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Exhaustion Short
                </span>
              </div>

              {/* Graphic Schema */}
              <div className="my-5 bg-zinc-950 p-4 rounded-lg border border-zinc-800/80 font-mono text-xs">
                <div className="text-zinc-500 mb-1">// Price Action: 3 Successive Higher Highs</div>
                <div className="text-zinc-300">
                  P1: $180.00 ↗ P2: $190.00 ↗ <span className="text-rose-400 font-bold">P3: $200.00</span> (Highest High)
                </div>
                <div className="border-t border-zinc-900 my-3"></div>
                <div className="text-zinc-500 mb-1">// MACD (12,26,9): 3 Successive Lower Highs!</div>
                <div className="text-zinc-300">
                  M1: +3.20 ↘ M2: +1.80 ↘ <span className="text-rose-400 font-bold">M3: +0.60</span> (Lower Highs)
                </div>
                <div className="border-t border-zinc-900 my-3"></div>
                <div className="text-zinc-500 mb-1">// Volume & RSI Behavior</div>
                <div className="text-rose-300">
                  Volume: 2.2M ↘ 1.4M ↘ 0.7M (Buying Exhaustion) • RSI: 76 ↘ 68 ↘ 59
                </div>
              </div>

              <ul className="space-y-2.5 text-xs text-zinc-300">
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Late buyer FOMO trap:</strong> Retail participants buy the breakout of P2, but momentum (MACD) has already collapsed.
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">Volume decay confirms weakness:</strong> Noticeable dry-up on the 3rd peak indicates smart money is no longer supporting higher prices.
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">High R:R Asymmetry:</strong> Entering after Peak 3 allows a razor-thin stop-loss just above P3 with massive downside potential.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Regular vs Hidden Divergences Callout */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400" />
              Regular Divergences (Reversal) vs. Hidden Divergences (Trend Continuation)
            </h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
              David Trullàs explicitly teaches both types: <strong className="text-zinc-200">Regular Divergences</strong> signal structural trend exhaustions (when price makes an extreme that indicators refuse to validate), whereas <strong className="text-zinc-200">Hidden Divergences</strong> signal healthy pullbacks within an established trend (e.g., price makes a higher low, but MACD resets deeply into oversold territory, offering continuation entries).
            </p>
          </div>
        </div>
      )}

      {/* SECTION 2: 4 PILLARS */}
      {activeSubTab === 'pillars' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pillar 1 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h3 className="font-bold text-white text-base">MACD (12, 26, 9)</h3>
                <p className="text-xs text-zinc-400">Moving Average Convergence Divergence</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Trullàs uses standard 12, 26, 9 settings. The MACD line represents medium-term momentum velocity. Crucially, he monitors the <strong className="text-white">MACD Histogram</strong> to identify the exact candle where loss of acceleration shifts into counter-impulse, and awaits signal line crossovers to validate swing changes.
            </p>
            <div className="mt-4 p-3 bg-zinc-950 rounded border border-zinc-800 text-[11px] text-zinc-400 font-mono">
              Key Rule: Must show 3 distinct peaks or troughs separated by zero-line touches or distinct histogram valleys.
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h3 className="font-bold text-white text-base">RSI (14 Period)</h3>
                <p className="text-xs text-zinc-400">Relative Strength Index</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              RSI serves as the second independent momentum validator. While MACD is unbounded, RSI is bounded (0 to 100). Trullàs checks that during Point 1 and 2, RSI was in extreme zones (&gt;70 for tops, &lt;30 for bottoms), while by Point 3 RSI has moderated, failing to reach extreme territory.
            </p>
            <div className="mt-4 p-3 bg-zinc-950 rounded border border-zinc-800 text-[11px] text-zinc-400 font-mono">
              Key Rule: Point 3 RSI must not confirm the new extreme price.
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Volume Exhaustion</h3>
                <p className="text-xs text-zinc-400">Transaction Liquidity & Climax Analysis</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Price cannot sustain new highs or lows without expanding volume. A classic Trullàs setup features a high volume spike at Point 1 or 2, followed by a noticeable drop in volume at Point 3. This &quot;dry-up&quot; proves that participants have stopped chasing the trend.
            </p>
            <div className="mt-4 p-3 bg-zinc-950 rounded border border-zinc-800 text-[11px] text-zinc-400 font-mono">
              Key Rule: Volume(P3) &lt; Volume(P1) and Volume(P3) &lt; 20-period Volume MA.
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Fibonacci Levels</h3>
                <p className="text-xs text-zinc-400">Retracements & Trigger Steps</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Trullàs never enters blindly at the exact extreme without structure. He draws a Fibonacci grid over the divergence wave. The <strong className="text-white">23.6% retracement</strong> serves as the breakout trigger, while <strong className="text-white">38.2% and 61.8%</strong> act as institutional target zones.
            </p>
            <div className="mt-4 p-3 bg-zinc-950 rounded border border-zinc-800 text-[11px] text-zinc-400 font-mono">
              Key Rule: Entry triggered on break of 23.6% Fib; TP1 at 38.2%, TP2 at 61.8%.
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: FIBONACCI & EXECUTION */}
      {activeSubTab === 'execution' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            Precise Entry, Stop Loss & Take Profit Geometry
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
              <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">
                1. Entry Trigger
              </div>
              <div className="text-sm font-bold text-white mb-2">23.6% Fibonacci or Neckline Break</div>
              <p className="text-xs text-zinc-400">
                Wait for candle close penetrating above the 23.6% retracement (for longs) or below 23.6% (for shorts). Alternatively, a trendline connecting the intermediate swing peaks/troughs.
              </p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
              <div className="text-xs text-rose-400 font-semibold uppercase tracking-wider mb-1">
                2. Stop-Loss Placement
              </div>
              <div className="text-sm font-bold text-white mb-2">0.5% - 1.0% Beyond Point #3</div>
              <p className="text-xs text-zinc-400">
                Stop loss is set strictly just beyond the extreme wick of Point 3. If price violates Point 3, the triple divergence thesis is invalidated immediately. Minimum account risk.
              </p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
              <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">
                3. Target Geometry
              </div>
              <div className="text-sm font-bold text-white mb-2">TP1 (38.2%) &bull; TP2 (61.8%) &bull; TP3 (100%)</div>
              <p className="text-xs text-zinc-400">
                Take partial profits at the 38.2% level and move stop to Breakeven. Target the 61.8% Golden Ratio for bulk of trade, leaving runners for a full retest of Point 1.
              </p>
            </div>
          </div>

          <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-300">Fibonacci Retracement Ladder Applied to Setup</span>
              <span className="text-[11px] text-zinc-500 font-mono">Trullàs Golden Ratio Framework</span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center py-1 px-3 rounded bg-zinc-900 border-l-4 border-rose-500">
                <span className="text-zinc-300">100.0% Structural Origin (TP3)</span>
                <span className="text-zinc-400">Retest of Point #1 / Prior Major Swing</span>
              </div>
              <div className="flex justify-between items-center py-1 px-3 rounded bg-zinc-900 border-l-4 border-amber-500">
                <span className="text-amber-400 font-semibold">61.8% Golden Ratio Pocket (TP2)</span>
                <span className="text-zinc-400">Primary Take-Profit Zone (Close 50% Position)</span>
              </div>
              <div className="flex justify-between items-center py-1 px-3 rounded bg-zinc-900 border-l-4 border-blue-500">
                <span className="text-blue-400 font-semibold">38.2% First Reaction Target (TP1)</span>
                <span className="text-zinc-400">Scale Out 33% & Move Stop to Break-Even (Risk-Free)</span>
              </div>
              <div className="flex justify-between items-center py-1 px-3 rounded bg-zinc-900 border-l-4 border-emerald-500">
                <span className="text-emerald-400 font-semibold">23.6% Trigger Level (ENTRY)</span>
                <span className="text-zinc-400">Confirmation of Momentum Breakout</span>
              </div>
              <div className="flex justify-between items-center py-1 px-3 rounded bg-zinc-900 border-l-4 border-zinc-600">
                <span className="text-zinc-500">0.0% Extreme Peak / Trough #3</span>
                <span className="text-rose-400">Hard Invalidation Stop Loss Zone</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: SCALING & SIZING */}
      {activeSubTab === 'scaling' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">David Trullàs 3-Tranche Scaling Methodology</h3>
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            A key secret to Trullàs&apos; multi-year victory in the World Cup Championship of Futures Trading is his <strong className="text-white">anti-all-in position building</strong>. Instead of committing 100% of the position on a single tick, he splits risk into 3 structural tranches:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 relative">
              <span className="text-2xl font-black text-emerald-500/30 absolute top-3 right-4">01</span>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Tranche 1 &bull; 33%</div>
              <h4 className="text-sm font-bold text-white mt-1">Breakout of 23.6% Fib</h4>
              <p className="text-xs text-zinc-400 mt-2">
                Enter initial 1/3 position as the price breaks the 23.6% Fibonacci retracement or the micro-trendline connecting troughs 1, 2, and 3. Stop loss placed tightly below trough 3.
              </p>
            </div>

            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 relative">
              <span className="text-2xl font-black text-emerald-500/30 absolute top-3 right-4">02</span>
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Tranche 2 &bull; 33%</div>
              <h4 className="text-sm font-bold text-white mt-1">Retest Pullback</h4>
              <p className="text-xs text-zinc-400 mt-2">
                Add second 1/3 position when price pulls back to retest the broken trigger level and prints a rejection candle (e.g., hammer or pin bar) holding well above Point 3.
              </p>
            </div>

            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 relative">
              <span className="text-2xl font-black text-emerald-500/30 absolute top-3 right-4">03</span>
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Tranche 3 &bull; 34%</div>
              <h4 className="text-sm font-bold text-white mt-1">Zero-Line MACD Expansion</h4>
              <p className="text-xs text-zinc-400 mt-2">
                Add final tranche once MACD crosses the zero line or hits the 38.2% Fib milestone. At this moment, stop loss on all tranches is trailed to break-even or in-the-money!
              </p>
            </div>
          </div>

          <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-start space-x-3 text-xs text-emerald-200">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-emerald-300">Risk Management Axiom:</strong> Total risk across all tranches should never exceed 1% - 2% of total trading account equity. The average Risk/Reward Ratio on a confirmed Triple Divergence setup typically ranges from <span className="font-bold underline">1:2.5 to 1:5.0</span>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
