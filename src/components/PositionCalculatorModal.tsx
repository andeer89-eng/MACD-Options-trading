import React, { useState, useEffect } from 'react';
import {
  Layers,
  X,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  Sliders,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { DivergenceSetup } from '../utils/trullasStrategy';
import { getCompanyName } from '../data/sp500Universe';
import {
  RiskSettings,
  loadRiskSettings,
  saveRiskSettings,
  computePositionSizeFromSetup,
} from '../utils/riskSettings';

interface PositionCalculatorModalProps {
  setup: DivergenceSetup | null;
  onClose: () => void;
}

export const PositionCalculatorModal: React.FC<PositionCalculatorModalProps> = ({
  setup,
  onClose,
}) => {
  const [settings, setSettings] = useState<RiskSettings>(loadRiskSettings());
  const [showRiskConfig, setShowRiskConfig] = useState<boolean>(false);

  if (!setup) return null;

  const result = computePositionSizeFromSetup(setup, settings);

  const handleUpdateSettings = (updated: Partial<RiskSettings>) => {
    const next = { ...settings, ...updated };
    setSettings(next);
    saveRiskSettings(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative overflow-y-auto max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-lg bg-zinc-800/60 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Position Sizing & Risk Management Calculator
              </h3>
              <p className="text-xs text-zinc-400">
                <strong className="text-emerald-400 font-mono font-bold mr-1">{setup.symbol}</strong>
                <span>({getCompanyName(setup.symbol)})</span>
                <span className="mx-1.5">&bull;</span>
                <span>{setup.type.replace('_', ' ')}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowRiskConfig(!showRiskConfig)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border transition ${
              showRiskConfig
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span>Risk Settings</span>
          </button>
        </div>

        {/* RISK SETTINGS MODAL / EXPANDABLE CONFIG PANEL */}
        {showRiskConfig && (
          <div className="p-4 bg-zinc-950 border border-indigo-500/40 rounded-xl space-y-4 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center space-x-2 text-indigo-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Account Risk Configuration</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">Auto-Saved</span>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="text-zinc-400 block mb-1 font-sans">
                  Account Equity ($)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-zinc-500 text-xs">$</span>
                  <input
                    type="number"
                    value={settings.accountEquity}
                    onChange={(e) =>
                      handleUpdateSettings({ accountEquity: Number(e.target.value) })
                    }
                    className="w-full pl-6 pr-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-sans">
                  Fixed Risk Per Trade (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.25"
                    value={settings.fixedRiskPercent}
                    onChange={(e) =>
                      handleUpdateSettings({ fixedRiskPercent: Number(e.target.value) })
                    }
                    className="w-full pl-2.5 pr-6 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <span className="absolute right-2.5 top-2 text-zinc-500 text-xs">%</span>
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-sans">
                  Max Dollar Risk Cap ($)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-zinc-500 text-xs">$</span>
                  <input
                    type="number"
                    value={settings.maxRiskDollarCap}
                    onChange={(e) =>
                      handleUpdateSettings({ maxRiskDollarCap: Number(e.target.value) })
                    }
                    className="w-full pl-6 pr-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-sans">
                  Max Portfolio Leverage (x)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="4.0"
                  value={settings.maxPortfolioLeverage}
                  onChange={(e) =>
                    handleUpdateSettings({ maxPortfolioLeverage: Number(e.target.value) })
                  }
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-[11px]">
              <span className="text-zinc-400">Fixed Risk Budget:</span>
              <span className="text-emerald-400 font-bold font-mono">
                ${result.calculatedDollarRisk.toFixed(2)} ({settings.fixedRiskPercent}% of equity)
              </span>
            </div>
          </div>
        )}

        {/* SETUP STOP LOSS DISTANCE SUMMARY */}
        <div className="grid grid-cols-3 gap-3 text-xs font-mono bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
          <div>
            <span className="text-zinc-500 block text-[10px]">Trigger Entry</span>
            <span className="font-bold text-emerald-400">${result.entryPrice.toFixed(2)}</span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">Hard Stop Loss</span>
            <span className="font-bold text-rose-400">${result.stopLossPrice.toFixed(2)}</span>
          </div>

          <div>
            <span className="text-zinc-500 block text-[10px]">SL Distance</span>
            <span className="font-bold text-amber-400">
              ${result.stopLossDistance.toFixed(2)} ({result.stopLossPercent}%)
            </span>
          </div>
        </div>

        {/* RECOMMENDED POSITION SIZE CARD */}
        <div className="p-4 bg-emerald-950/20 border border-emerald-500/40 rounded-xl space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">
              Recommended Position Size
            </span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              {result.recommendedShares} UNITS
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-emerald-500/20">
            <div>
              <span className="text-zinc-400 block text-[10px]">Total Capital Value</span>
              <span className="font-bold text-white text-sm">
                ${result.totalPositionValue.toLocaleString()}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block text-[10px]">Portfolio Weight</span>
              <span className="font-bold text-white text-sm">
                {result.portfolioWeightPercent}% of Account
              </span>
            </div>
          </div>

          {result.isLeverageCapped && (
            <div className="flex items-center space-x-1.5 text-[10px] text-amber-400 pt-1 font-sans">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Position capped by Max Portfolio Leverage limit ({settings.maxPortfolioLeverage}x).</span>
            </div>
          )}
        </div>

        {/* DAVID TRULLAS 3-TRANCHE SCALING BREAKDOWN */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-300">
            David Trullàs 3-Tranche Scaling Execution:
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-center">
              <div className="text-emerald-400 font-bold text-sm">{result.tranche1Shares} units</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Tranche 1 (33%)</div>
              <div className="text-[9px] text-zinc-500">At Trigger Breakout</div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-center">
              <div className="text-blue-400 font-bold text-sm">{result.tranche2Shares} units</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Tranche 2 (33%)</div>
              <div className="text-[9px] text-zinc-500">On Retest Pullback</div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-center">
              <div className="text-amber-400 font-bold text-sm">{result.tranche3Shares} units</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Tranche 3 (34%)</div>
              <div className="text-[9px] text-zinc-500">MACD Zero Expansion</div>
            </div>
          </div>
        </div>

        {/* PROJECTED PROFITS & MAX RISK BUDGET */}
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1.5">
          <div className="flex justify-between">
            <span className="text-zinc-400">Max Risk Budget Allowed:</span>
            <span className="text-rose-400 font-bold">
              -${result.calculatedDollarRisk.toFixed(2)} (-{settings.fixedRiskPercent}%)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Target 1 Profit (38.2% Fib):</span>
            <span className="text-blue-400 font-bold">
              +${result.projectedProfitTP1.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Target 2 Profit (61.8% Golden Pocket):</span>
            <span className="text-amber-400 font-bold">
              +${result.projectedProfitTP2.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-zinc-800">
            <span className="text-emerald-300 font-semibold">Target 3 Profit (100% Retest):</span>
            <span className="text-emerald-400 font-bold">
              +${result.projectedProfitTP3.toFixed(2)}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-xl transition"
        >
          Close Calculator
        </button>
      </div>
    </div>
  );
};
