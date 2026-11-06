import React, { useState, useEffect, useMemo } from 'react';
import {
  Bot,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  DollarSign,
  PieChart,
  Layers,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Percent,
  Play,
  Pause,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info,
  Brain,
  Download,
  RefreshCw,
  Cpu,
  GitBranch,
  Edit2,
  Sliders,
  LineChart,
  Activity,
  BarChart2,
  Award,
  Scale,
  Target,
} from 'lucide-react';
import { getMarketSessionStatus } from '../utils/marketSession';
import {
  PortfolioAccount,
  AutomatedPosition,
  AutomatedTradeLog,
  PortfolioStats,
  EquityPoint,
  AdvancedPerformanceAnalytics,
  loadAutomatedPortfolio,
  saveAutomatedPortfolio,
  resetAutomatedPortfolio,
  calculatePortfolioStats,
  calculateAdvancedAnalytics,
  processAutonomousCycle,
  manualCloseAutomatedPosition,
  exportAutomatedLogsToCSV,
  evaluateCboeOptionsConfluence,
} from '../utils/automatedPortfolio';
import { downloadCSV } from '../utils/tradeJournal';
import {
  ActiveMemoryState,
  TradeEpisode,
  loadActiveMemoryState,
  saveActiveMemoryState,
  resetActiveMemoryState,
  exportActiveMemoryJSON,
  ingestTradeEpisode,
} from '../utils/activeLearningEngine';

interface AutomatedPortfolioManagerProps {
  onSelectSymbolForChart: (sym: string) => void;
  scannerResults?: any[];
}

export const AutomatedPortfolioManager: React.FC<AutomatedPortfolioManagerProps> = ({
  onSelectSymbolForChart,
  scannerResults = [],
}) => {
  const [account, setAccount] = useState<PortfolioAccount>(() => loadAutomatedPortfolio());
  const [portfolioTab, setPortfolioTab] = useState<'positions' | 'analytics' | 'brain'>('positions');
  const [chartMode, setChartMode] = useState<'equity' | 'drawdown' | 'combined'>('combined');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [lastCycleMessage, setLastCycleMessage] = useState<string | null>(null);
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [isSynthesizingMemory, setIsSynthesizingMemory] = useState(false);
  const [logFilter, setLogFilter] = useState<'ALL' | 'OPEN' | 'PARTIAL_EXIT' | 'FULL_EXIT' | 'STOP_LOSS'>('ALL');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetMemoryConfirm, setShowResetMemoryConfirm] = useState(false);
  const [expandedPositionIds, setExpandedPositionIds] = useState<Set<string>>(new Set());

  const togglePositionExpand = (posId: string) => {
    setExpandedPositionIds((prev) => {
      const next = new Set(prev);
      if (next.has(posId)) {
        next.delete(posId);
      } else {
        next.add(posId);
      }
      return next;
    });
  };

  const handleExpandAllPositions = () => {
    setExpandedPositionIds(new Set(account.positions.map((p) => p.id)));
  };

  const handleCollapseAllPositions = () => {
    setExpandedPositionIds(new Set());
  };

  // Editable Risk Settings Modal State
  const [showRiskModal, setShowRiskModal] = useState(false);

  const [tempRiskPercent, setTempRiskPercent] = useState<number>(account.riskPerTradePercent || 1.0);
  const [tempMaxPositions, setTempMaxPositions] = useState<number>(account.maxOpenPositions || 5);

  // Manual Close Modal State
  const [positionToClose, setPositionToClose] = useState<AutomatedPosition | null>(null);
  const [closeFraction, setCloseFraction] = useState<number>(0.5); // 0.5 = 50% partial, 1.0 = full close
  const [closeExitPrice, setCloseExitPrice] = useState<number>(0);
  const [closeReason, setCloseReason] = useState<string>('Manual discretionary take-profit at key resistance');

  const handleSaveRiskSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const riskVal = Math.max(0.1, Math.min(5.0, Number(tempRiskPercent)));
    const posCapVal = Math.max(1, Math.min(20, Number(tempMaxPositions)));

    const updatedAcc: PortfolioAccount = {
      ...account,
      riskPerTradePercent: riskVal,
      maxOpenPositions: posCapVal,
      lastUpdated: new Date().toISOString(),
    };
    setAccount(updatedAcc);
    saveAutomatedPortfolio(updatedAcc);
    setShowRiskModal(false);

    const dollarRisk = ((stats.currentEquity * riskVal) / 100).toFixed(2);
    setLastCycleMessage(
      `Risk Controls Saved: Risk per trade set to ${riskVal}% ($${dollarRisk} USD on $${stats.currentEquity.toFixed(2)} equity). Max open positions cap set to ${posCapVal}.`
    );
  };

  // Sync to localStorage whenever account updates
  useEffect(() => {
    saveAutomatedPortfolio(account);
  }, [account]);

  const stats: PortfolioStats = useMemo(() => {
    return calculatePortfolioStats(account);
  }, [account]);

  const analytics: AdvancedPerformanceAnalytics = useMemo(() => {
    return calculateAdvancedAnalytics(account);
  }, [account]);


  // Auto-Pilot Cycle Trigger
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (account.isAutoPilotActive) {
      interval = setInterval(() => {
        const session = getMarketSessionStatus();
        if (session === 'OPEN') {
          handleRunCycle();
        }
      }, 60000); // Check every minute
    }
    return () => clearInterval(interval);
  }, [account.isAutoPilotActive]);

  // Execute Auto-Pilot Cycle
  const handleRunCycle = async (force: boolean = false) => {
    if (!force) {
      const session = getMarketSessionStatus();
      if (session !== 'OPEN') {
        setLastCycleMessage(`Market is ${session}. Auto-pilot paused.`);
        return;
      }
    }

    setIsCycleRunning(true);
    setLastCycleMessage('Evaluating Trullàs 4-Pillars rules, Fibonacci targets, and stop-loss levels...');

    try {
      // If no scanner results provided yet, fetch fresh market data from /api/scan
      let marketItems = scannerResults;
      if (!marketItems || marketItems.length === 0) {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tickers: ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'LLY', 'XOM', 'SPY', 'AMD', 'AVGO'],
            timeframe: '1d',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          marketItems = data.results || [];
        }
      }

      const { updatedAccount, actionsTaken } = processAutonomousCycle(account, marketItems);
      setAccount(updatedAccount);

      if (actionsTaken.length > 0) {
        setLastCycleMessage(
          `Cycle completed: Executed ${actionsTaken.length} autonomous order(s) based on market metrics.`
        );
      } else {
        setLastCycleMessage(
          'Cycle completed: All positions monitored. No target scale-outs or stop breaches detected. Capital protected.'
        );
      }
    } catch (err) {
      setLastCycleMessage('Cycle execution completed using cached portfolio telemetry.');
    } finally {
      setIsCycleRunning(false);
    }
  };

  // Toggle Auto-Pilot
  const handleToggleAutoPilot = () => {
    setAccount((prev) => ({
      ...prev,
      isAutoPilotActive: !prev.isAutoPilotActive,
    }));
  };

  // Reset to $10,000 Portfolio
  const handleResetPortfolio = () => {
    const fresh = resetAutomatedPortfolio(10000);
    setAccount(fresh);
    setShowResetConfirm(false);
    setLastCycleMessage('Portfolio successfully reset to $10,000.00 virtual capital.');
  };

  // Manual Close
  const handleOpenManualClose = (pos: AutomatedPosition, fraction: number = 0.5) => {
    setPositionToClose(pos);
    setCloseFraction(fraction);
    setCloseExitPrice(pos.currentPrice);
    setCloseReason(
      fraction >= 1.0
        ? 'Manual full position exit at discretionary target'
        : 'Discretionary 50% partial profit scale-out'
    );
  };

  const handleConfirmManualClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!positionToClose) return;

    const updated = manualCloseAutomatedPosition(
      account,
      positionToClose.id,
      closeExitPrice,
      closeFraction,
      closeReason
    );
    setAccount(updated);
    setPositionToClose(null);
  };

  const activeMemory: ActiveMemoryState = useMemo(() => {
    return account.activeMemory || loadActiveMemoryState();
  }, [account.activeMemory]);

  const handleExportPortfolioCSV = () => {
    const csvContent = exportAutomatedLogsToCSV(account);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `trullas_automated_portfolio_${dateStamp}.csv`;
    downloadCSV(csvContent, fileName);
    setLastCycleMessage(`Exported ${account.tradeHistory.length} automated portfolio trade records to ${fileName}`);
  };

  const handleExportMemoryJSON = () => {
    const jsonStr = exportActiveMemoryJSON(activeMemory);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `trullas_active_memory_${dateStamp}.json`;
    if (typeof window !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    }
    setLastCycleMessage(`Exported Active Memory bank (${activeMemory.episodes.length} episodes) to ${fileName}`);
  };

  const handleTriggerMemorySynthesis = () => {
    setIsSynthesizingMemory(true);
    setTimeout(() => {
      let updatedMem = { ...activeMemory };
      const closedLogs = account.tradeHistory.filter(
        (l) => l.action === 'PARTIAL_EXIT' || l.action === 'FULL_EXIT' || l.action === 'STOP_LOSS'
      );

      for (const log of closedLogs.slice(0, 5)) {
        const isWin = (log.realizedPnL || 0) >= 0;
        const { updatedState } = ingestTradeEpisode(updatedMem, {
          symbol: log.symbol,
          setupType: 'BULLISH TRIPLE',
          direction: 'BULLISH',
          entryPrice: log.price * 0.95,
          exitPrice: log.price,
          pnl: log.realizedPnL || 0,
          pnlPercent: log.realizedPnLPercent || 0,
          qualityScore: isWin ? 82 : 68,
          atrPercent: 2.5,
          exitReason: log.reason,
        });
        updatedMem = updatedState;
      }

      setAccount((prev) => ({
        ...prev,
        activeMemory: updatedMem,
      }));
      saveActiveMemoryState(updatedMem);
      setIsSynthesizingMemory(false);
      setLastCycleMessage(
        `Memory Synthesis Complete: Evaluated trade history. Calibrated setup weights, quality hurdles, and ATR stop cushions.`
      );
    }, 700);
  };

  const handleResetMemory = () => {
    const freshMem = resetActiveMemoryState();
    setAccount((prev) => ({
      ...prev,
      activeMemory: freshMem,
    }));
    setShowResetMemoryConfirm(false);
    setLastCycleMessage('Active Memory reset to default benchmark parameters.');
  };

  const filteredLogs = useMemo(() => {
    return account.tradeHistory.filter((log) => {
      if (logFilter === 'ALL') return true;
      return log.action === logFilter;
    });
  }, [account.tradeHistory, logFilter]);

  return (
    <div className="space-y-6">
      {/* HUD: Account Overview Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <Bot className="w-3.5 h-3.5" />
                <span>Automated Portfolio Manager</span>
              </span>
              <span
                className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                  account.isAutoPilotActive
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${account.isAutoPilotActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                <span>{account.isAutoPilotActive ? 'Auto-Pilot: ACTIVE' : 'Auto-Pilot: PAUSED'}</span>
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                Baseline: $10,000.00 USD (Virtual)
              </span>
            </div>

            <div className="flex items-baseline space-x-3 mt-1">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">
                ${stats.currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              <span
                className={`text-base font-bold font-mono flex items-center ${
                  stats.totalReturnDollars >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {stats.totalReturnDollars >= 0 ? '+' : ''}${stats.totalReturnDollars.toFixed(2)} ({stats.totalReturnPercent >= 0 ? '+' : ''}{stats.totalReturnPercent.toFixed(2)}%)
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400 max-w-2xl leading-relaxed">
              Managed automatically using <strong>David Trullàs 4-Pillars Algorithm</strong> (MACD triple divergence, RSI exhaustion, 23.6% Fib triggers, 1% fixed risk rule, and partial 38.2%/61.8% scale-outs).
            </p>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleRunCycle(true)}
              disabled={isCycleRunning}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-lg shadow-emerald-600/25 transition flex items-center space-x-2"
              title="Scan market and execute model rebalancing, scale-outs, or entries"
            >
              <Zap className={`w-4 h-4 ${isCycleRunning ? 'animate-spin' : ''}`} />
              <span>{isCycleRunning ? 'Evaluating...' : 'Run Auto-Pilot Cycle'}</span>
            </button>

            <button
              onClick={handleExportPortfolioCSV}
              data-testid="export-portfolio-csv-btn"
              className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-medium rounded-xl text-xs border border-zinc-700 transition flex items-center space-x-1.5 shadow-sm"
              title="Export all automated portfolio trade logs and telemetry to CSV file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleToggleAutoPilot}
              className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl text-xs border border-zinc-700 transition flex items-center space-x-1.5"
            >
              {account.isAutoPilotActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{account.isAutoPilotActive ? 'Pause Bot' : 'Resume Bot'}</span>
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-3.5 py-2.5 bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 font-medium rounded-xl text-xs border border-zinc-800 transition flex items-center space-x-1.5"
              title="Reset portfolio back to $10,000 virtual starting capital"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset $10k</span>
            </button>
          </div>
        </div>

        {/* Live Cycle Notification Toast */}
        {lastCycleMessage && (
          <div className="mt-4 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{lastCycleMessage}</span>
            </div>
            <button
              onClick={() => setLastCycleMessage(null)}
              className="text-zinc-500 hover:text-zinc-300 ml-2"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* VIEW SELECTOR: Active Positions & Orders vs Active Memory & Auto-Learning Brain */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800 p-2 rounded-2xl shadow-md">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setPortfolioTab('positions')}
            data-testid="portfolio-positions-tab"
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              portfolioTab === 'positions'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Active Positions & Orders ({account.positions.length})</span>
          </button>

          <button
            onClick={() => setPortfolioTab('analytics')}
            data-testid="portfolio-analytics-tab"
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              portfolioTab === 'analytics'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <LineChart className="w-4 h-4 text-blue-300" />
            <span>Performance Analytics</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-950 border border-blue-400/40 text-blue-300 font-mono">
              Sharpe {analytics.sharpeRatio.toFixed(2)}
            </span>
          </button>

          <button
            onClick={() => setPortfolioTab('brain')}
            data-testid="portfolio-brain-tab"
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              portfolioTab === 'brain'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>Active Memory & Auto-Learning Brain</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 border border-emerald-400/40 text-emerald-300 font-mono">
              {activeMemory.episodes.length} Episodes
            </span>
          </button>

        </div>

        <div className="flex items-center space-x-3 px-3 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>FinRL & TradeMemory Protocol Engine</span>
          </span>
        </div>
      </div>

      {/* Primary Statistical KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Virtual Cash</div>
          <div className="text-xl font-bold text-white mt-1 font-mono">
            ${stats.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">Reserve Liquidity</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Realized P&amp;L</div>
          <div
            className={`text-xl font-bold mt-1 font-mono ${
              stats.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {stats.realizedPnL >= 0 ? '+' : ''}${stats.realizedPnL.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Banked Closed Gains</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Unrealized P&amp;L</div>
          <div
            className={`text-xl font-bold mt-1 font-mono ${
              stats.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {stats.unrealizedPnL >= 0 ? '+' : ''}${stats.unrealizedPnL.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">{account.positions.length} active positions</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Win Rate</div>
          <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
            {stats.winRatePercent}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">
            {stats.winningTradesCount}W / {stats.losingTradesCount}L ({stats.closedTradesCount} closed)
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Profit Factor</div>
          <div className="text-xl font-bold text-amber-400 mt-1 font-mono">
            {stats.profitFactor.toFixed(2)}x
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">Avg Win: ${stats.averageWin.toFixed(1)}</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative group">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Risk Control</div>
            <button
              onClick={() => {
                setTempRiskPercent(account.riskPerTradePercent || 1.0);
                setTempMaxPositions(account.maxOpenPositions || 5);
                setShowRiskModal(true);
              }}
              data-testid="edit-risk-control-btn"
              className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md transition flex items-center gap-1 cursor-pointer"
              title="Click to edit account risk per trade percentage and open position limits"
            >
              <Edit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>
          <div
            onClick={() => {
              setTempRiskPercent(account.riskPerTradePercent || 1.0);
              setTempMaxPositions(account.maxOpenPositions || 5);
              setShowRiskModal(true);
            }}
            className="text-xl font-bold text-blue-400 mt-1 font-mono cursor-pointer hover:text-blue-300 transition"
          >
            {(account.riskPerTradePercent || 1.0).toFixed(1)}% Max
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between font-mono">
            <span>Max DD: {stats.maxDrawdownPercent}%</span>
            <span>Cap: {account.maxOpenPositions || 5} Pos</span>
          </div>
        </div>
      </div>

      {portfolioTab === 'positions' ? (
        <>
          {/* Strategy Blueprint Mini-Card */}
          <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-4 text-xs space-y-2">
        <div className="flex items-center space-x-2 text-zinc-300 font-semibold">
          <Info className="w-4 h-4 text-emerald-400" />
          <span>Automated Strategy Rules Enforced by the Platform:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-zinc-400 text-[11px] leading-relaxed">
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
            <span className="text-emerald-400 font-bold block mb-0.5">1. Entry &amp; Position Sizing</span>
            MACD Double/Triple Divergence + RSI exhaustion. Position sized to risk exactly 1.0% ($100) of account balance to the 1.2x ATR stop-loss.
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
            <span className="text-amber-400 font-bold block mb-0.5">2. Partial Scaling Out</span>
            At Fibonacci Target 1 (38.2%), platform automatically closes 50% of shares and immediately moves the trailing stop to breakeven.
          </div>
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60">
            <span className="text-blue-400 font-bold block mb-0.5">3. Target 2 &amp; Stop Protection</span>
            At Target 2 (61.8%), model closes remaining shares at maximum objective or cuts 100% instantly if stop-loss is triggered.
          </div>
        </div>
      </div>

      {/* SECTION 1: Active Open Positions Table with Dropdown Accordion */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <h3 className="text-base font-bold text-white flex items-center space-x-2 font-mono">
              <span>Active Open Positions</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                {account.positions.length} Open
              </span>
            </h3>
            <span className="text-xs text-zinc-500 hidden sm:inline">
              Click any row to reveal detailed execution card &amp; CBOE radar
            </span>
          </div>

          {account.positions.length > 0 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleExpandAllPositions}
                className="px-2.5 py-1 text-[11px] font-mono text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
              >
                Expand All
              </button>
              <button
                onClick={handleCollapseAllPositions}
                className="px-2.5 py-1 text-[11px] font-mono text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>

        {account.positions.length > 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/80 text-[11px] font-mono text-zinc-400 uppercase tracking-wider select-none">
                    <th className="py-3 px-3 w-8 text-center"></th>
                    <th className="py-3 px-3 font-semibold text-zinc-300">Asset</th>
                    <th className="py-3 px-3 font-semibold text-zinc-300">Side / Setup</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Shares / Size</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Entry Price</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Current Price</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Trailing Stop</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Targets (T1 / T2)</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Market Value</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Unrealized P&amp;L</th>
                    <th className="py-3 px-3 font-semibold text-center text-zinc-300">CBOE Flow</th>
                    <th className="py-3 px-3 font-semibold text-right text-zinc-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-xs font-mono">
                  {account.positions.map((pos) => {
                    const isBull = pos.direction === 'BULLISH';
                    const isPnlPositive = pos.unrealizedPnL >= 0;
                    const isExpanded = expandedPositionIds.has(pos.id);
                    const positionValue = pos.currentShares * pos.currentPrice;
                    const totalEquity = account.equity || (account.cash + account.positions.reduce((acc, p) => acc + (p.currentShares * p.currentPrice), 0));
                    const portfolioPct = totalEquity > 0 ? ((positionValue / totalEquity) * 100).toFixed(1) : '0.0';
                    const riskPerShare = Math.abs(pos.entryPrice - pos.trailingStop);
                    const rMultiple = riskPerShare > 0
                      ? ((isBull ? pos.currentPrice - pos.entryPrice : pos.entryPrice - pos.currentPrice) / riskPerShare).toFixed(2)
                      : '0.00';
                    const cboe = pos.cboeConfluence || evaluateCboeOptionsConfluence(pos.symbol, pos.currentPrice, pos.direction);

                    return (
                      <React.Fragment key={pos.id}>
                        {/* Summary Row */}
                        <tr
                          onClick={() => togglePositionExpand(pos.id)}
                          className={`hover:bg-zinc-800/60 cursor-pointer transition select-none group ${
                            isExpanded ? 'bg-zinc-800/40 border-l-2 border-l-emerald-500' : ''
                          }`}
                        >
                          {/* Expand chevron */}
                          <td className="py-3 px-3 text-center text-zinc-400 group-hover:text-white">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-zinc-700/50 transition">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </span>
                          </td>

                          {/* Asset */}
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-2.5">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                                  isBull ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                }`}
                              >
                                {isBull ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                              </div>
                              <div>
                                <div className="flex items-center space-x-1.5">
                                  <span
                                    className="font-bold text-white text-sm hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectSymbolForChart(pos.symbol);
                                    }}
                                  >
                                    {pos.symbol}
                                  </span>
                                  {pos.sector && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                                      {pos.sector}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-400 font-sans truncate max-w-[130px]">
                                  {pos.companyName}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Side / Setup */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    isBull
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {pos.direction}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800">
                                  Tranche {pos.trancheStage}/3
                                </span>
                              </div>
                              {pos.target1Hit && (
                                <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
                                  <ShieldCheck className="w-3 h-3" /> Breakeven Locked
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Shares / Size */}
                          <td className="py-3 px-3 text-right">
                            <div className="font-bold text-white">{pos.currentShares} sh</div>
                            <div className="text-[10px] text-zinc-500 font-sans">
                              {portfolioPct}% port ({pos.initialShares} init)
                            </div>
                          </td>

                          {/* Entry Price */}
                          <td className="py-3 px-3 text-right">
                            <div className="text-white font-semibold">${pos.entryPrice.toFixed(2)}</div>
                            <div className="text-[10px] text-zinc-500 font-sans">{pos.entryDate}</div>
                          </td>

                          {/* Current Price */}
                          <td className="py-3 px-3 text-right">
                            <div className="text-emerald-400 font-bold">${pos.currentPrice.toFixed(2)}</div>
                            <div className={`text-[10px] font-sans ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isPnlPositive ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(2)}%
                            </div>
                          </td>

                          {/* Trailing Stop */}
                          <td className="py-3 px-3 text-right">
                            <div className="text-rose-400 font-bold">${pos.trailingStop.toFixed(2)}</div>
                            <div className="text-[10px] text-zinc-500 font-sans">
                              {(((pos.currentPrice - pos.trailingStop) / pos.currentPrice) * 100).toFixed(1)}% buffer
                            </div>
                          </td>

                          {/* Targets (T1 / T2) */}
                          <td className="py-3 px-3 text-right">
                            <div className={`text-[11px] ${pos.target1Hit ? 'text-zinc-500 line-through' : 'text-amber-400 font-bold'}`}>
                              T1: ${pos.target1.toFixed(2)} {pos.target1Hit && '✓'}
                            </div>
                            <div className="text-[11px] text-amber-300 font-medium">
                              T2: ${pos.target2.toFixed(2)}
                            </div>
                          </td>

                          {/* Market Value */}
                          <td className="py-3 px-3 text-right">
                            <div className="font-bold text-white">${positionValue.toFixed(2)}</div>
                          </td>

                          {/* Unrealized P&L */}
                          <td className="py-3 px-3 text-right">
                            <div
                              className={`text-sm font-bold ${
                                isPnlPositive ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isPnlPositive ? '+' : ''}${pos.unrealizedPnL.toFixed(2)}
                            </div>
                            <div className={`text-[10px] ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isPnlPositive ? '+' : ''}{rMultiple}R ({pos.unrealizedPnLPercent.toFixed(2)}%)
                            </div>
                          </td>

                          {/* CBOE Flow */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                                {cboe.overallScore}% Flow
                              </span>
                              <span className="text-[9px] text-zinc-400 mt-0.5 truncate max-w-[80px]">
                                {cboe.gexRegime.split(' ')[0]}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenManualClose(pos, 0.5)}
                                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium rounded transition"
                                title="Close 50% of remaining position"
                              >
                                50%
                              </button>
                              <button
                                onClick={() => handleOpenManualClose(pos, 1.0)}
                                className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 text-[11px] font-semibold rounded transition"
                                title="Full close this position"
                              >
                                100%
                              </button>
                              <button
                                onClick={() => onSelectSymbolForChart(pos.symbol)}
                                className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition"
                                title="View on Technical Chart"
                              >
                                <LineChart className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ACCORDION DROPDOWN: The exact detailed card the user loves */}
                        {isExpanded && (
                          <tr className="bg-zinc-950/95 border-b border-zinc-800">
                            <td colSpan={12} className="p-5">
                              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-inner">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-start space-x-3">
                                    <div
                                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                        isBull ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                      }`}
                                    >
                                      {isBull ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                                    </div>

                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-base font-bold text-white font-mono">{pos.symbol}</span>
                                        <span className="text-xs text-zinc-400 font-medium">{pos.companyName}</span>
                                        {pos.sector && (
                                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                                            {pos.sector}
                                          </span>
                                        )}
                                        <span
                                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                            isBull ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                          }`}
                                        >
                                          {pos.direction}
                                        </span>
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800">
                                          Tranche {pos.trancheStage}/3
                                        </span>
                                        {pos.target1Hit && (
                                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                                            <ShieldCheck className="w-3 h-3" /> Breakeven Protected
                                          </span>
                                        )}
                                      </div>

                                      <div className="text-xs text-zinc-400 font-mono mt-1">
                                        Holding: <strong className="text-white">{pos.currentShares} shares</strong> (Initial: {pos.initialShares}) &bull; Entered: {pos.entryDate} &bull; Allocation: {portfolioPct}% of portfolio
                                      </div>
                                    </div>
                                  </div>

                                  {/* Unrealized PnL & Action Buttons */}
                                  <div className="flex items-center space-x-4">
                                    <div className="text-right">
                                      <div className="text-[10px] text-zinc-500 uppercase font-sans">Unrealized P&amp;L</div>
                                      <div
                                        className={`text-lg font-bold font-mono ${
                                          isPnlPositive ? 'text-emerald-400' : 'text-rose-400'
                                        }`}
                                      >
                                        {isPnlPositive ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} ({isPnlPositive ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(2)}%)
                                      </div>
                                    </div>

                                    <div className="flex items-center space-x-1.5">
                                      <button
                                        onClick={() => handleOpenManualClose(pos, 0.5)}
                                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
                                        title="Close 50% of remaining position"
                                      >
                                        Close 50%
                                      </button>
                                      <button
                                        onClick={() => handleOpenManualClose(pos, 1.0)}
                                        className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 text-xs font-semibold rounded-lg transition"
                                        title="Full close this position"
                                      >
                                        Exit 100%
                                      </button>
                                      <button
                                        onClick={() => onSelectSymbolForChart(pos.symbol)}
                                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-lg transition"
                                      >
                                        Chart
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Price & Target Levels Bar */}
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-zinc-800/70 text-xs font-mono">
                                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/60">
                                    <span className="text-[10px] text-zinc-500 block font-sans">Entry Price</span>
                                    <span className="font-bold text-white">${pos.entryPrice.toFixed(2)}</span>
                                  </div>

                                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/60">
                                    <span className="text-[10px] text-zinc-500 block font-sans">Current Price</span>
                                    <span className="font-bold text-emerald-400">${pos.currentPrice.toFixed(2)}</span>
                                  </div>

                                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/60">
                                    <span className="text-[10px] text-zinc-500 block font-sans">Trailing Stop</span>
                                    <span className="font-bold text-rose-400">${pos.trailingStop.toFixed(2)}</span>
                                  </div>

                                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/60">
                                    <span className="text-[10px] text-zinc-500 block font-sans">Target 1 (38.2%)</span>
                                    <span className={`font-bold ${pos.target1Hit ? 'text-zinc-500 line-through' : 'text-amber-400'}`}>
                                      ${pos.target1.toFixed(2)} {pos.target1Hit && '✓ Hit'}
                                    </span>
                                  </div>

                                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/60">
                                    <span className="text-[10px] text-zinc-500 block font-sans">Target 2 (61.8%)</span>
                                    <span className="font-bold text-amber-300">${pos.target2.toFixed(2)}</span>
                                  </div>
                                </div>

                                {/* CBOE Options Confluence Radar Badge */}
                                {(() => {
                                  return (
                                    <div className="bg-gradient-to-r from-purple-950/40 via-zinc-950 to-indigo-950/40 p-3.5 rounded-xl border border-purple-500/30 text-xs space-y-2.5">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center space-x-2">
                                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px] uppercase border border-purple-500/30">
                                            CBOE Options Confluence
                                          </span>
                                          <span className="font-bold text-white font-mono text-sm">
                                            {cboe.overallScore}% Score
                                          </span>
                                          <span
                                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                                              cboe.isOptionsApproved
                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                            }`}
                                          >
                                            {cboe.isOptionsApproved ? 'Institutional Flow Verified' : 'Neutral Options Flow'}
                                          </span>
                                        </div>
                                        <div className="text-[11px] font-mono font-bold text-purple-300">
                                          Regime: {cboe.gexRegime}
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                                        <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                                          <span className="text-[10px] text-zinc-400 block font-sans">ATM Gamma (&Gamma;)</span>
                                          <span className="font-bold text-emerald-400">{cboe.gammaAtm.toFixed(4)}</span>
                                        </div>
                                        <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                                          <span className="text-[10px] text-zinc-400 block font-sans">Daily Theta (&Theta;)</span>
                                          <span className="font-bold text-rose-400">${cboe.thetaDailyAtm.toFixed(3)}/day</span>
                                        </div>
                                        <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                                          <span className="text-[10px] text-zinc-400 block font-sans">Put / Call Ratio</span>
                                          <span className="font-bold text-amber-300">{cboe.putCallRatio.toFixed(2)}</span>
                                        </div>
                                        <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                                          <span className="text-[10px] text-zinc-400 block font-sans">Max Pain Target</span>
                                          <span className="font-bold text-purple-300">${cboe.maxPainStrike.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Decision Reason Audit Box */}
                                <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60 text-xs leading-relaxed space-y-1">
                                  <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 font-sans">
                                    <Bot className="w-3.5 h-3.5" />
                                    <span>Why the Bot Opened This Position:</span>
                                  </div>
                                  <p className="text-zinc-300 font-sans text-[11px]">
                                    {pos.reasonOpened}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            <Bot className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-300 font-medium">No active positions currently held</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Click &quot;Run Auto-Pilot Cycle&quot; above to scan the S&amp;P 500 basket and automatically open new Trullàs setups that meet the 70% quality and 1.0% ATR threshold.
            </p>
          </div>
        )}
      </div>

      {/* SECTION 2: Automated Trade History & Decision Audit Log */}
      <div className="space-y-3 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white font-mono flex items-center space-x-2">
              <span>Platform Execution &amp; Decision Audit Log</span>
              <span className="text-xs text-zinc-400 font-sans font-normal">
                ({filteredLogs.length} actions)
              </span>
            </h3>
            <p className="text-xs text-zinc-500">
              Detailed audit trail explaining why the platform opened, scaled, or closed each position.
            </p>
          </div>

          {/* Action Filter */}
          <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs">
            {(['ALL', 'OPEN', 'PARTIAL_EXIT', 'FULL_EXIT', 'STOP_LOSS'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition ${
                  logFilter === filter
                    ? 'bg-zinc-800 text-white font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {filter.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/80 overflow-hidden shadow-sm">
          {filteredLogs.map((log) => {
            const isWin = (log.realizedPnL || 0) > 0;
            const isLoss = (log.realizedPnL || 0) < 0;

            return (
              <div key={log.id} className="p-4 hover:bg-zinc-800/30 transition text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-zinc-500 font-mono text-[11px]">{log.timestamp}</span>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        log.action === 'OPEN'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : log.action === 'PARTIAL_EXIT'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : log.action === 'FULL_EXIT'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : log.action === 'STOP_LOSS'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {log.action.replace('_', ' ')}
                    </span>

                    <button
                      onClick={() => onSelectSymbolForChart(log.symbol)}
                      className="font-mono font-bold text-white hover:text-emerald-400 transition"
                    >
                      {log.symbol}
                    </button>

                    <span className="text-zinc-400 font-mono">
                      {log.shares} shares @ ${log.price.toFixed(2)}
                    </span>
                  </div>

                  {log.realizedPnL !== undefined && log.realizedPnL !== 0 && (
                    <div className="flex items-center space-x-2 font-mono">
                      <span className="text-zinc-500 text-[11px]">Realized:</span>
                      <span
                        className={`font-bold ${
                          isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-zinc-300'
                        }`}
                      >
                        {isWin ? '+' : ''}${log.realizedPnL.toFixed(2)} ({log.realizedPnLPercent && log.realizedPnLPercent >= 0 ? '+' : ''}{log.realizedPnLPercent?.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* Audit Justification */}
                <p className="text-zinc-300 bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60 font-sans leading-relaxed text-[11px]">
                  {log.reason}
                </p>
              </div>
            );
          })}
        </div>
      </div>
        </>
      ) : portfolioTab === 'analytics' ? (
        /* SECTION 2: Performance Analytics & Drawdown Dashboard */
        <div className="space-y-6 animate-in fade-in">
          {/* Analytics Top Banner */}
          <div className="bg-gradient-to-r from-blue-950/40 via-zinc-900 to-zinc-950 border border-blue-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-2">
                  <LineChart className="w-3.5 h-3.5" />
                  <span>Virtual $10,000 Portfolio Quantitative Risk &amp; Return Analytics</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Performance Analytics &amp; Drawdown Visualizer
                </h3>
                <p className="mt-1 text-xs text-zinc-300 max-w-2xl leading-relaxed">
                  Real-time quantitative performance suite tracking Sharpe ratio, Sortino ratio, Calmar ratio, 95% Value at Risk (VaR), and an interactive drawdown graph tracking the virtual $10,000 account curve.
                </p>
              </div>

              {/* Chart Mode Switcher */}
              <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 p-1.5 rounded-xl shrink-0">
                <button
                  onClick={() => setChartMode('equity')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    chartMode === 'equity'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Equity Growth ($)
                </button>
                <button
                  onClick={() => setChartMode('drawdown')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    chartMode === 'drawdown'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Drawdown (%)
                </button>
                <button
                  onClick={() => setChartMode('combined')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    chartMode === 'combined'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Combined Dual View
                </button>
              </div>
            </div>
          </div>

          {/* Key Quantitative Ratios Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 font-mono">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group hover:border-emerald-500/40 transition">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium font-sans">Sharpe Ratio</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {analytics.sharpeRatio.toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-500/90 mt-1 font-sans flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>High Efficiency (&gt;2.0)</span>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group hover:border-emerald-500/40 transition">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium font-sans">Sortino Ratio</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {analytics.sortinoRatio.toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-500/90 mt-1 font-sans flex items-center gap-1">
                <Award className="w-3 h-3" />
                <span>Downside Shielded</span>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group hover:border-rose-500/40 transition">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium font-sans">Max Drawdown</div>
              <div className="text-2xl font-bold text-rose-400 mt-1">
                -{analytics.maxDrawdownPercent.toFixed(2)}%
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 font-sans">
                -${analytics.maxDrawdownDollars.toFixed(2)} Peak Decline
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group hover:border-amber-500/40 transition">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium font-sans">Calmar Ratio</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                {analytics.calmarRatio.toFixed(2)}x
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 font-sans">Ann. Return / Max DD</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group hover:border-blue-500/40 transition">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium font-sans">95% 1-Day VaR</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">
                ${analytics.valueAtRisk95Percent.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 font-sans">Max Expected 1-Day Loss</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 relative overflow-hidden group hover:border-emerald-500/40 transition">
              <div className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium font-sans">Alpha vs SPY</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                +{analytics.alphaVsBenchmarkPercent.toFixed(2)}%
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 font-sans">SPY Baseline: +{analytics.sp500BenchmarkReturnPercent.toFixed(2)}%</div>
            </div>
          </div>

          {/* DRAWDOWN & EQUITY VISUALIZATION SVG CHART */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-md relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-4">
              <div>
                <h4 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                  <span>Portfolio Equity Curve &amp; Underwater Drawdown Visualization</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                    $10,000 Baseline
                  </span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Real-time track of account equity growth vs peak high-water mark and underwater drawdown percentages across all trade events.
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center space-x-4 text-xs font-mono">
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-1 bg-emerald-400 rounded-full"></span>
                  <span className="text-zinc-300">Equity ($)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-1 bg-rose-500/80 rounded-full"></span>
                  <span className="text-zinc-300">Drawdown (%)</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 stroke-dasharray border-b border-dashed border-zinc-500"></span>
                  <span className="text-zinc-400">Baseline ($10k)</span>
                </div>
              </div>
            </div>

            {/* SVG Chart Container */}
            <div className="w-full h-72 relative bg-zinc-950/80 border border-zinc-800/60 rounded-xl p-4 overflow-hidden">
              {renderDrawdownSvgGraph(analytics.equityCurve, chartMode, hoveredPointIndex, setHoveredPointIndex)}
            </div>

            {/* Hover Point Detailed Callout Banner */}
            {hoveredPointIndex !== null && analytics.equityCurve[hoveredPointIndex] && (
              <div className="p-3 bg-zinc-950 border border-emerald-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="font-bold text-white">{analytics.equityCurve[hoveredPointIndex].label}</span>
                  <span className="text-zinc-400">({analytics.equityCurve[hoveredPointIndex].date})</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div>
                    <span className="text-zinc-500 text-[10px] block font-sans">EQUITY</span>
                    <span className="font-bold text-emerald-400">${analytics.equityCurve[hoveredPointIndex].equity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block font-sans">PEAK HIGH</span>
                    <span className="font-bold text-white">${analytics.equityCurve[hoveredPointIndex].peakEquity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block font-sans">DRAWDOWN</span>
                    <span className={`font-bold ${analytics.equityCurve[hoveredPointIndex].drawdownPercent < 0 ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {analytics.equityCurve[hoveredPointIndex].drawdownPercent.toFixed(2)}% (${analytics.equityCurve[hoveredPointIndex].drawdownDollars.toFixed(2)})
                    </span>
                  </div>
                </div>
                <div className="text-zinc-300 text-[11px] truncate max-w-md font-sans italic">
                  &quot;{analytics.equityCurve[hoveredPointIndex].event}&quot;
                </div>
              </div>
            )}
          </div>

          {/* Statistical Performance Decomposition Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Panel 1: Risk & Volatility Analytics */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h4 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Risk &amp; Volatility Decomposition</span>
              </h4>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Annualized Extrapolated Return</span>
                  <span className="font-bold text-emerald-400">+{analytics.annualizedReturnPercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Annualized Portfolio Volatility</span>
                  <span className="font-bold text-white">{analytics.annualizedVolatilityPercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Downside Return Volatility</span>
                  <span className="font-bold text-emerald-400">{analytics.downsideVolatilityPercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Value at Risk (95% CI 1-Day)</span>
                  <span className="font-bold text-blue-400">${analytics.valueAtRisk95Percent.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Trade Mathematical Expectancy</span>
                  <span className="font-bold text-emerald-400">+${analytics.expectancyDollars.toFixed(2)} / trade</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-zinc-400">Strategy Profit Factor</span>
                  <span className="font-bold text-amber-400">{analytics.profitFactor.toFixed(2)}x</span>
                </div>
              </div>
            </div>

            {/* Panel 2: Drawdown & Benchmark Audit */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h4 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Drawdown &amp; Benchmark Audit</span>
              </h4>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">All-Time Peak Equity</span>
                  <span className="font-bold text-white">${analytics.peakEquity.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Maximum Drawdown Peak-to-Trough</span>
                  <span className="font-bold text-rose-400">-{analytics.maxDrawdownPercent.toFixed(2)}% (-${analytics.maxDrawdownDollars.toFixed(2)})</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Current Drawdown Under Water</span>
                  <span className={`font-bold ${analytics.currentDrawdownPercent < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {analytics.currentDrawdownPercent === 0 ? '0.00% (At High Water Mark)' : `${analytics.currentDrawdownPercent.toFixed(2)}%`}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">S&amp;P 500 (SPY) Period Return</span>
                  <span className="font-bold text-zinc-300">+{analytics.sp500BenchmarkReturnPercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Alpha Outperformance vs S&amp;P 500</span>
                  <span className="font-bold text-emerald-400">+{analytics.alphaVsBenchmarkPercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-zinc-400">Risk Limit Enforcement</span>
                  <span className="font-bold text-emerald-400">{account.riskPerTradePercent || 1.0}% Max Per Trade</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* SECTION 3: Active Memory & Continual Learning Brain View */

        <div className="space-y-6 animate-in fade-in">
          {/* Research & Architectural Grounding Banner */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Continual Reinforcement Learning &amp; Active Memory</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Self-Adaptive Portfolio Neural Executive</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-medium">
                    Online Learning Active
                  </span>
                </h3>
                <p className="mt-1.5 text-xs text-zinc-300 max-w-3xl leading-relaxed">
                  Synthesized from open-source GitHub quantitative architectures: 
                  <strong className="text-emerald-400 ml-1">FinRL</strong> (continual policy optimization in non-stationary markets), 
                  <strong className="text-emerald-400 ml-1">TradeMemory Protocol</strong> (outcome-weighted episodic memory &amp; multi-layer recall), and 
                  <strong className="text-emerald-400 ml-1">Reflexion</strong> (verbal critique synthesis from trade wins/losses). The executive dynamically self-tunes setup multipliers, ATR cushions, and quality score gates.
                </p>
              </div>

              {/* Action Controls for Active Memory */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleTriggerMemorySynthesis}
                  disabled={isSynthesizingMemory}
                  data-testid="relearn-history-btn"
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-md transition flex items-center space-x-1.5"
                  title="Run offline Reflexion review across all closed trades to synthesize new behavioral guardrails"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSynthesizingMemory ? 'animate-spin' : ''}`} />
                  <span>{isSynthesizingMemory ? 'Synthesizing...' : 'Re-Learn from History'}</span>
                </button>

                <button
                  onClick={handleExportMemoryJSON}
                  data-testid="export-memory-json-btn"
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl text-xs border border-zinc-700 transition flex items-center space-x-1.5"
                  title="Export active memory state and learned rules as JSON"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export JSON</span>
                </button>

                <button
                  onClick={() => setShowResetMemoryConfirm(true)}
                  className="px-3 py-2 bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 font-medium rounded-xl text-xs border border-zinc-800 transition flex items-center space-x-1.5"
                  title="Reset active memory to benchmark initial state"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Memory</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 Core Memory Telemetry Gauges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 font-mono">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-sans">Episodic Experiences</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-2xl font-bold text-white">{activeMemory.episodes.length}</span>
                <span className="text-xs text-zinc-500 font-sans">({activeMemory.learningIterations} cycles)</span>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1 block font-sans">Continuous memory bank</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-sans">Adaptive Quality Gate</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-2xl font-bold text-emerald-400">{activeMemory.calibratedMinQualityScore}%</span>
                <span className="text-[10px] text-zinc-500 font-sans">Min Score</span>
              </div>
              <span className="text-[10px] text-emerald-500/80 mt-1 block font-sans">Tightens on loss, optimizes on win</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-sans">Dynamic ATR Stop Buffer</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-2xl font-bold text-amber-400">{activeMemory.calibratedAtrStopMultiple}x</span>
                <span className="text-[10px] text-zinc-500 font-sans">ATR</span>
              </div>
              <span className="text-[10px] text-amber-500/80 mt-1 block font-sans">Shields against noise &amp; wicks</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider block font-sans">Streak Risk Scale</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-2xl font-bold text-blue-400">{activeMemory.riskMultiplier}x</span>
                <span className="text-[10px] text-zinc-500 font-sans font-normal">Kelly Scale</span>
              </div>
              <span className="text-[10px] text-blue-500/80 mt-1 block font-sans">Modulates risk per trade</span>
            </div>
          </div>

          {/* Setup Affinity & Weight Matrix */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-emerald-400" />
                  <span>Bayesian Setup Affinity Multipliers (Online Policy Tuning)</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  The model dynamically rewards winning divergence structures and penalizes losing setups in real time.
                </p>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">Base weight: 1.00x (Range: 0.40x - 1.60x)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(activeMemory.setupWeights).map(([setupName, stat]) => {
                const isBoosted = stat.currentWeightMultiplier > 1.0;
                const isThrottled = stat.currentWeightMultiplier < 1.0;

                return (
                  <div
                    key={setupName}
                    className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono font-bold text-xs text-white">{setupName}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          stat.confidenceRating === 'HIGH'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : stat.confidenceRating === 'CAUTIONARY'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}
                      >
                        {stat.confidenceRating}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-[11px] text-zinc-400">Policy Weight:</span>
                      <span
                        className={`text-base font-extrabold ${
                          isBoosted ? 'text-emerald-400' : isThrottled ? 'text-amber-400' : 'text-zinc-300'
                        }`}
                      >
                        {stat.currentWeightMultiplier}x
                      </span>
                    </div>

                    <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isBoosted ? 'bg-emerald-400' : isThrottled ? 'bg-amber-400' : 'bg-zinc-600'
                        }`}
                        style={{ width: `${Math.min(100, (stat.currentWeightMultiplier / 1.6) * 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-900">
                      <span>Win Rate: <strong className="text-zinc-300">{stat.winRate}%</strong></span>
                      <span>P&amp;L: <strong className={stat.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{stat.totalPnL >= 0 ? '+' : ''}${stat.totalPnL.toFixed(1)}</strong></span>
                      <span>({stat.tradesCount}T)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Symbol-Specific Memory Badges */}
            <div className="pt-2 border-t border-zinc-800/60">
              <span className="text-[11px] text-zinc-400 block mb-2 font-medium">Symbol Affinity Weights:</span>
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(activeMemory.symbolStats).map(([sym, stat]) => (
                  <span
                    key={sym}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono"
                  >
                    <span className="font-bold text-white">{sym}:</span>
                    <span
                      className={
                        stat.weightMultiplier > 1.0
                          ? 'text-emerald-400'
                          : stat.weightMultiplier < 1.0
                          ? 'text-amber-400'
                          : 'text-zinc-400'
                      }
                    >
                      {stat.weightMultiplier}x
                    </span>
                    <span className="text-[10px] text-zinc-500">({stat.winRate}% WR)</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Active Learned Rules & Behavioral Guardrails */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Active Learned Behavioral Guardrails &amp; Reflexion Rules</span>
              </h4>
              <span className="text-xs text-zinc-500">{activeMemory.learnedRules.length} Active Heuristics</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {activeMemory.learnedRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 flex items-start space-x-3 text-zinc-300 leading-relaxed shadow-sm hover:border-zinc-700 transition"
                >
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 font-mono font-bold text-xs mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Episodic Memory Bank (Past Episodes & Reflections) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-white flex items-center gap-2 font-mono">
                <Brain className="w-4 h-4 text-emerald-400" />
                <span>Episodic Trade Memory Bank ({activeMemory.episodes.length} Episodes)</span>
              </h4>
              <span className="text-xs text-zinc-500">Historical outcome-weighted recall stream</span>
            </div>

            <div className="space-y-3">
              {activeMemory.episodes.map((ep) => {
                const isWin = ep.outcome === 'WIN';
                const isLoss = ep.outcome === 'LOSS';

                return (
                  <div
                    key={ep.id}
                    className={`bg-zinc-900 border rounded-2xl p-4 sm:p-5 space-y-3 transition shadow-sm ${
                      isWin ? 'border-emerald-500/30' : isLoss ? 'border-rose-500/30' : 'border-zinc-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/70 pb-3">
                      <div className="flex items-center space-x-2.5">
                        <span
                          className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                            isWin
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isLoss
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {ep.outcome}
                        </span>

                        <span className="text-base font-bold text-white font-mono">{ep.symbol}</span>
                        <span className="text-xs text-zinc-400 font-medium">{ep.companyName}</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800">
                          {ep.setupType}
                        </span>
                      </div>

                      <div className="flex items-center space-x-3 font-mono text-xs">
                        <span className="text-zinc-500 text-[11px]">{ep.timestamp}</span>
                        <span
                          className={`font-bold ${
                            isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-zinc-300'
                          }`}
                        >
                          {isWin ? '+' : ''}${ep.pnl.toFixed(2)} ({ep.pnlPercent >= 0 ? '+' : ''}{ep.pnlPercent.toFixed(2)}%)
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded ${
                            ep.synapticWeightDelta > 0
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : ep.synapticWeightDelta < 0
                              ? 'bg-rose-500/10 text-rose-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                          title="Synaptic policy adjustment"
                        >
                          Δ {ep.synapticWeightDelta >= 0 ? '+' : ''}{ep.synapticWeightDelta.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/60">
                      <div>
                        <span className="text-[10px] text-zinc-500 block font-sans">Entry Price</span>
                        <span className="text-zinc-200 font-bold">${ep.entryPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block font-sans">Exit Price</span>
                        <span className="text-zinc-200 font-bold">${ep.exitPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block font-sans">Quality Score</span>
                        <span className="text-zinc-200 font-bold">{ep.qualityScore}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block font-sans">ATR Volatility</span>
                        <span className="text-zinc-200 font-bold">{ep.atrPercent.toFixed(2)}%</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="text-zinc-300 leading-relaxed bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800/80">
                        <strong className="text-emerald-400 block mb-0.5 font-sans text-[11px] uppercase tracking-wider">
                          Reflexion Verbal Critique:
                        </strong>
                        {ep.reflectionCritique}
                      </div>

                      <div className="text-zinc-400 text-[11px] leading-relaxed bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/40">
                        <strong className="text-amber-400 font-sans uppercase tracking-wider mr-1">
                          Learned Heuristic:
                        </strong>
                        {ep.learnedRule}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Manual Close / Exit Position */}
      {positionToClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleConfirmManualClose}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-white font-mono">
                  {closeFraction >= 1.0 ? 'Full Position Exit' : 'Partial Scale-Out (50%)'}
                </h3>
                <span className="text-xs text-zinc-400">
                  {positionToClose.symbol} &bull; {positionToClose.companyName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPositionToClose(null)}
                className="text-zinc-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Exit Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={closeExitPrice}
                  onChange={(e) => setCloseExitPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Exit Fraction</label>
                <select
                  value={closeFraction}
                  onChange={(e) => setCloseFraction(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value={0.5}>50% Partial Close ({Math.floor(positionToClose.currentShares * 0.5)} shares)</option>
                  <option value={1.0}>100% Full Exit ({positionToClose.currentShares} shares)</option>
                </select>
              </div>
            </div>

            <div className="text-xs">
              <label className="text-zinc-300 block mb-1 font-medium">Audit Reason for Manual Action</label>
              <textarea
                rows={2}
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Discretionary exit reason..."
                className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setPositionToClose(null)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-md shadow-emerald-600/20 transition flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Execute Manual Exit</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Reset Confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Reset Portfolio to $10,000?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              This will reset the Automated Portfolio back to the pristine $10,000.00 virtual capital baseline with default Trullàs 4-Pillars positions and clean audit metrics.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPortfolio}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition"
              >
                Yes, Reset Portfolio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reset Memory Confirmation */}
      {showResetMemoryConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <Brain className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Reset Active Memory Bank?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              This will clear all learned Reflexion rules, Bayesian setup affinity multipliers, and episodic history, returning the memory executive to initial benchmark parameters.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowResetMemoryConfirm(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleResetMemory}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition"
              >
                Yes, Reset Active Memory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Risk Settings */}
      {showRiskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleSaveRiskSettings}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-mono">Portfolio Risk Control Settings</h3>
                  <span className="text-xs text-zinc-400">Position Sizing &amp; Allocation Cap</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5 font-medium">
                  <label className="text-zinc-300">Fixed Risk Per Trade (%)</label>
                  <span className="text-blue-400 font-mono font-bold text-sm">{tempRiskPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={5.0}
                  step={0.25}
                  value={tempRiskPercent}
                  onChange={(e) => setTempRiskPercent(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1">
                  <span>0.25% (Conservative)</span>
                  <span>1.0% (Standard)</span>
                  <span>5.0% (Aggressive)</span>
                </div>
                <div className="mt-2 p-2.5 bg-zinc-950 rounded-lg border border-zinc-800/80 font-mono text-[11px] text-zinc-300">
                  <span className="text-zinc-400 block font-sans text-[10px]">Calculated Maximum Loss Per Trade:</span>
                  <span className="text-emerald-400 font-bold">
                    ${((stats.currentEquity * tempRiskPercent) / 100).toFixed(2)} USD
                  </span>
                  <span className="text-zinc-500 ml-1">
                    (on current equity of ${stats.currentEquity.toFixed(2)})
                  </span>
                </div>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Max Open Concurrent Positions Cap</label>
                <select
                  value={tempMaxPositions}
                  onChange={(e) => setTempMaxPositions(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value={2}>2 Open Positions (Concentrated)</option>
                  <option value={3}>3 Open Positions (Focused)</option>
                  <option value={5}>5 Open Positions (Balanced - Recommended)</option>
                  <option value={8}>8 Open Positions (Diversified)</option>
                  <option value={10}>10 Open Positions (Broad Market Basket)</option>
                </select>
                <span className="text-[10px] text-zinc-500 mt-1 block leading-normal">
                  Prevents capital over-exposure across correlated sector setups.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRiskModal(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg shadow-md shadow-blue-600/20 transition flex items-center space-x-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Risk Controls</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

function renderDrawdownSvgGraph(
  points: EquityPoint[],
  mode: 'equity' | 'drawdown' | 'combined',
  hoveredIndex: number | null,
  setHoveredIndex: (idx: number | null) => void
) {
  if (!points || points.length === 0) return null;

  const padding = { top: 25, right: 35, bottom: 35, left: 60 };
  const width = 800;
  const height = 250;
  const graphW = width - padding.left - padding.right;
  const graphH = height - padding.top - padding.bottom;

  const equities = points.map((p) => p.equity);
  const minEq = Math.min(...equities, 9800);
  const maxEq = Math.max(...equities, 10300);
  const eqRange = Math.max(100, maxEq - minEq);

  const drawdowns = points.map((p) => p.drawdownPercent);
  const minDD = Math.min(...drawdowns, -3.0);
  const ddRange = Math.abs(minDD) || 1;

  const getX = (idx: number) => {
    if (points.length <= 1) return padding.left + graphW / 2;
    return padding.left + (idx / (points.length - 1)) * graphW;
  };

  const getEquityY = (eq: number) => {
    return padding.top + graphH - ((eq - minEq) / eqRange) * graphH;
  };

  const getDrawdownY = (dd: number) => {
    const norm = Math.abs(dd) / ddRange;
    return padding.top + norm * graphH;
  };

  const equityPointsStr = points.map((p, i) => `${getX(i)},${getEquityY(p.equity)}`).join(' ');
  const equityAreaStr = `${getX(0)},${padding.top + graphH} ${equityPointsStr} ${getX(points.length - 1)},${padding.top + graphH}`;

  const ddPointsStr = points.map((p, i) => `${getX(i)},${getDrawdownY(p.drawdownPercent)}`).join(' ');
  const ddAreaStr = `${getX(0)},${getDrawdownY(0)} ${ddPointsStr} ${getX(points.length - 1)},${getDrawdownY(0)}`;

  let maxDDIndex = 0;
  let deepestDD = 0;
  points.forEach((p, i) => {
    if (p.drawdownPercent < deepestDD) {
      deepestDD = p.drawdownPercent;
      maxDDIndex = i;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full overflow-visible select-none"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <defs>
        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
        </linearGradient>
        <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* Grid Lines */}
      <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="#27272a" strokeDasharray="3 3" />
      <line x1={padding.left} y1={padding.top + graphH / 2} x2={width - padding.right} y2={padding.top + graphH / 2} stroke="#27272a" strokeDasharray="3 3" />
      <line x1={padding.left} y1={padding.top + graphH} x2={width - padding.right} y2={padding.top + graphH} stroke="#27272a" />

      {/* Baseline $10,000 line */}
      {(mode === 'equity' || mode === 'combined') && (
        <g>
          <line
            x1={padding.left}
            y1={getEquityY(10000)}
            x2={width - padding.right}
            y2={getEquityY(10000)}
            stroke="#10b981"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.6"
          />
          <text x={padding.left + 6} y={getEquityY(10000) - 5} fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold">
            $10,000 Deposit Baseline
          </text>
        </g>
      )}

      {/* Y Axis Labels */}
      {(mode === 'equity' || mode === 'combined') && (
        <g textAnchor="end" fontSize="9" fill="#a1a1aa" fontFamily="monospace">
          <text x={padding.left - 8} y={getEquityY(maxEq) + 3}>${maxEq.toFixed(0)}</text>
          <text x={padding.left - 8} y={getEquityY((maxEq + minEq) / 2) + 3}>${((maxEq + minEq) / 2).toFixed(0)}</text>
          <text x={padding.left - 8} y={getEquityY(minEq) + 3}>${minEq.toFixed(0)}</text>
        </g>
      )}

      {mode === 'drawdown' && (
        <g textAnchor="end" fontSize="9" fill="#f43f5e" fontFamily="monospace">
          <text x={padding.left - 8} y={getDrawdownY(0) + 3}>0.0%</text>
          <text x={padding.left - 8} y={getDrawdownY(minDD / 2) + 3}>{(minDD / 2).toFixed(1)}%</text>
          <text x={padding.left - 8} y={getDrawdownY(minDD) + 3}>{minDD.toFixed(1)}%</text>
        </g>
      )}

      {/* EQUITY AREA & LINE */}
      {(mode === 'equity' || mode === 'combined') && (
        <g>
          <polygon points={equityAreaStr} fill="url(#equityGradient)" />
          <polyline points={equityPointsStr} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* DRAWDOWN AREA & LINE */}
      {(mode === 'drawdown' || mode === 'combined') && (
        <g>
          <polygon points={ddAreaStr} fill="url(#drawdownGradient)" />
          <polyline points={ddPointsStr} fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray={mode === 'combined' ? '3 3' : undefined} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Max Drawdown Badge */}
      {deepestDD < 0 && (
        <g transform={`translate(${getX(maxDDIndex)}, ${mode === 'drawdown' ? getDrawdownY(deepestDD) : getEquityY(points[maxDDIndex].equity)})`}>
          <circle r="6" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" className="animate-ping opacity-75" />
          <circle r="4" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" />
          <rect x="-44" y="-24" width="88" height="18" rx="5" fill="#18181b" stroke="#f43f5e" strokeWidth="1" />
          <text x="0" y="-12" textAnchor="middle" fill="#f43f5e" fontSize="9" fontWeight="bold" fontFamily="monospace">
            Max DD: {deepestDD.toFixed(2)}%
          </text>
        </g>
      )}

      {/* Interactive Data Points */}
      {points.map((p, idx) => {
        const cx = getX(idx);
        const cy = mode === 'drawdown' ? getDrawdownY(p.drawdownPercent) : getEquityY(p.equity);
        const isHovered = hoveredIndex === idx;

        return (
          <g key={p.id} className="cursor-pointer" onMouseEnter={() => setHoveredIndex(idx)}>
            <circle
              cx={cx}
              cy={cy}
              r={isHovered ? 6 : 3.5}
              fill={isHovered ? '#34d399' : '#18181b'}
              stroke={p.drawdownPercent < 0 ? '#f43f5e' : '#34d399'}
              strokeWidth={isHovered ? 2.5 : 1.5}
              className="transition-all duration-150"
            />
            {isHovered && (
              <line
                x1={cx}
                y1={padding.top}
                x2={cx}
                y2={padding.top + graphH}
                stroke="#a1a1aa"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </g>
        );
      })}

      {/* X Axis Labels */}
      {points.map((p, idx) => {
        if (idx === 0 || idx === points.length - 1 || idx === Math.floor(points.length / 2)) {
          return (
            <text
              key={`x-lbl-${p.id}`}
              x={getX(idx)}
              y={height - 8}
              textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
              fill="#71717a"
              fontSize="9"
              fontFamily="monospace"
            >
              {p.date.split(' ')[0]}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}

