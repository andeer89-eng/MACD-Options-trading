import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Sparkles,
  Compass,
  Bookmark,
  LineChart,
  FileText,
  Grid,
  PieChart,
  Code2,
  BookOpen,
  Bell,
  Activity,
  Terminal,
} from 'lucide-react';
import { Header, ActiveTab } from './components/Header';
import { StrategyGuide } from './components/StrategyGuide';
import { LiveScanner } from './components/LiveScanner';
import { ChartViewer } from './components/ChartViewer';
import { LuxAlgoSuite } from './components/LuxAlgoSuite';
import { SecEdgarInspector } from './components/SecEdgarInspector';
import { PythonDaemonView } from './components/PythonDaemonView';
import { AlertStream, AlertLogItem } from './components/AlertStream';
import { ActionDashboard } from './components/ActionDashboard';
import { IndicatorLibraryView } from './components/IndicatorLibraryView';
import { MarketHeatmap } from './components/MarketHeatmap';
import { TradeJournalView, JournalSubTab } from './components/TradeJournalView';
import { CboeOptionsAnalytics } from './components/CboeOptionsAnalytics';
import { SystemHealthView } from './components/SystemHealthView';
import { WatchlistManagerView } from './components/WatchlistManagerView';
import { SectorPerformanceView } from './components/SectorPerformanceView';
import { ConfluenceMatrixView } from './components/ConfluenceMatrixView';
import { TrendSpiderSuite } from './components/TrendSpiderSuite';
import { TodayView } from './components/TodayView';

import { PositionCalculatorModal } from './components/PositionCalculatorModal';
import { TelegramConfigModal } from './components/TelegramConfigModal';
import { WebhookConfigModal } from './components/WebhookConfigModal';
import {
  loadTelegramConfig,
  formatDivergenceTelegramAlert,
  sendTelegramMessage,
} from './utils/telegramAlerts';
import { DivergenceSetup } from './utils/trullasStrategy';
import { SP500_UNIVERSE } from './data/sp500Universe';
import { deduplicateSymbols, generateStableAlertId } from './utils/dataFetcher';

type ScannerSubTab = 'live' | 'confluence' | 'zones' | 'watchlists';
type ChartSubTab = 'studio' | 'sec';
type MarketsSubTab = 'heatmap' | 'sectors';
type QuantSubTab = 'luxalgo' | 'trendspider' | 'indicators' | 'rules';
type OpsSubTab = 'alerts' | 'health' | 'python';

interface SubTabItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

function WorkspaceSubNav<T extends string>({
  items,
  active,
  onSelect,
  subtitle,
}: {
  items: SubTabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-xl mb-6">
      <div className="flex flex-wrap items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                isActive
                  ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="text-[10px] px-1.5 py-0 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {subtitle && (
        <span className="text-[11px] text-zinc-400 font-mono px-2.5 hidden md:inline">
          {subtitle}
        </span>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const [scannerSubTab, setScannerSubTab] = useState<ScannerSubTab>('live');
  const [chartSubTab, setChartSubTab] = useState<ChartSubTab>('studio');
  const [marketsSubTab, setMarketsSubTab] = useState<MarketsSubTab>('heatmap');
  const [journalSubTab, setJournalSubTab] = useState<JournalSubTab>('automated');
  const [quantSubTab, setQuantSubTab] = useState<QuantSubTab>('luxalgo');
  const [opsSubTab, setOpsSubTab] = useState<OpsSubTab>('alerts');

  const [timeframe, setTimeframe] = useState<string>('1d');
  // Default to full S&P 500 universe (all 503 constituents)
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    SP500_UNIVERSE.map((c) => c.symbol)
  );
  const [results, setResults] = useState<any[]>([]);
  const [scanning, setScanning] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('AAPL');
  const [calculatorSetup, setCalculatorSetup] = useState<DivergenceSetup | null>(null);
  const [alerts, setAlerts] = useState<AlertLogItem[]>([]);
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);

  const prevSetupIds = useRef<Set<string>>(new Set());
  const isScanningRef = useRef<boolean>(false);
  const scanAbortRef = useRef<AbortController | null>(null);

  // Unified router supporting both the 8 concentrated hubs and legacy deep-link tab IDs
  const navigateTo = (target: string, subTab?: string) => {
    switch (target) {
      case 'today':
        setActiveTab('today');
        break;
      case 'scanner':
        setActiveTab('scanner');
        if (subTab === 'live' || subTab === 'confluence' || subTab === 'zones' || subTab === 'watchlists') {
          setScannerSubTab(subTab);
        }
        break;
      case 'confluence':
        setActiveTab('scanner');
        setScannerSubTab('confluence');
        break;
      case 'action-zones':
        setActiveTab('scanner');
        setScannerSubTab('zones');
        break;
      case 'watchlists':
        setActiveTab('scanner');
        setScannerSubTab('watchlists');
        break;
      case 'chart':
        setActiveTab('chart');
        if (subTab === 'studio' || subTab === 'sec') {
          setChartSubTab(subTab);
        }
        break;
      case 'sec':
        setActiveTab('chart');
        setChartSubTab('sec');
        break;
      case 'markets':
        setActiveTab('markets');
        if (subTab === 'heatmap' || subTab === 'sectors') {
          setMarketsSubTab(subTab);
        }
        break;
      case 'heatmap':
        setActiveTab('markets');
        setMarketsSubTab('heatmap');
        break;
      case 'sectors':
        setActiveTab('markets');
        setMarketsSubTab('sectors');
        break;
      case 'options':
        setActiveTab('options');
        break;
      case 'journal':
        setActiveTab('journal');
        if (subTab === 'automated' || subTab === 'options' || subTab === 'manual' || subTab === 'backtester') {
          setJournalSubTab(subTab);
        }
        break;
      case 'backtester':
        setActiveTab('journal');
        setJournalSubTab('backtester');
        break;
      case 'quant':
        setActiveTab('quant');
        if (subTab === 'luxalgo' || subTab === 'trendspider' || subTab === 'indicators' || subTab === 'rules') {
          setQuantSubTab(subTab);
        }
        break;
      case 'luxalgo':
        setActiveTab('quant');
        setQuantSubTab('luxalgo');
        break;
      case 'trendspider':
        setActiveTab('quant');
        setQuantSubTab('trendspider');
        break;
      case 'indicators':
        setActiveTab('quant');
        setQuantSubTab('indicators');
        break;
      case 'rules':
        setActiveTab('quant');
        setQuantSubTab('rules');
        break;
      case 'ops':
        setActiveTab('ops');
        if (subTab === 'alerts' || subTab === 'health' || subTab === 'python') {
          setOpsSubTab(subTab);
        }
        break;
      case 'alerts':
        setActiveTab('ops');
        setOpsSubTab('alerts');
        break;
      case 'health':
        setActiveTab('ops');
        setOpsSubTab('health');
        break;
      case 'python':
        setActiveTab('ops');
        setOpsSubTab('python');
        break;
      default:
        setActiveTab('today');
    }
  };

  // Web Audio Synth for Alert Chime (closes AudioContext after playback to prevent leak)
  const playAlertChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      let closed = false;
      const closeCtx = () => {
        if (closed) return;
        closed = true;
        ctx.close().catch(() => {});
      };
      osc.onended = closeCtx;
      setTimeout(closeCtx, 500);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // AudioContext policy fallback
    }
  };

  // Scan Function (ref-guarded against concurrent overlap)
  const runScan = async (tickersToScan: string[] = watchlist, tf: string = timeframe) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setScanning(true);

    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;

    try {
      const uniqueTickers = deduplicateSymbols(tickersToScan);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: uniqueTickers, timeframe: tf }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setLastScanTime(new Date());

        let newFound = false;
        const newAlerts: AlertLogItem[] = [];

        for (const item of data.results || []) {
          for (let sIdx = 0; sIdx < (item.setups || []).length; sIdx++) {
            const s = item.setups[sIdx];
            const stableId = s.id || generateStableAlertId(s.symbol, s.type, Date.now(), sIdx);
            if (!prevSetupIds.current.has(stableId)) {
              prevSetupIds.current.add(stableId);
              newFound = true;
              const atrPct = item.atrPercent ?? 0;
              const volLevel =
                atrPct >= 2.0 ? 'high' : atrPct >= 1.0 ? 'moderate' : 'low';

              newAlerts.push({
                id: stableId,
                timestamp: Date.now(),
                symbol: s.symbol,
                companyName: item.companyName,
                sector: item.sector,
                timeframe: item.timeframe || tf,
                type: s.type,
                price: s.currentPrice,
                score: s.qualityScore,
                trigger: s.triggerPrice,
                stopLoss: s.stopLoss,
                target2: s.targets.tp2,
                atr: item.atr,
                atrPercent: item.atrPercent,
                volatilityLevel: volLevel,
              });
            }
          }
        }

        if (newAlerts.length > 0) {
          setAlerts((prev) => {
            const combined = [...newAlerts, ...prev];
            const seenAlerts = new Set<string>();
            const uniqueAlerts: AlertLogItem[] = [];
            for (const a of combined) {
              if (a && a.id && !seenAlerts.has(a.id)) {
                seenAlerts.add(a.id);
                uniqueAlerts.push(a);
              }
            }
            return uniqueAlerts.slice(0, 50);
          });
          if (soundEnabled && newFound) {
            playAlertChime();
          }

          const tgConfig = loadTelegramConfig();
          if (tgConfig.enabled && tgConfig.botToken && tgConfig.chatId) {
            for (const item of data.results || []) {
              for (const s of item.setups || []) {
                if (s.qualityScore >= tgConfig.notifyMinQualityScore) {
                  const tgText = formatDivergenceTelegramAlert(s);
                  sendTelegramMessage(tgConfig.botToken, tgConfig.chatId, tgText);
                }
              }
            }
          }
        }
        if (prevSetupIds.current.size > 1500) {
          const activeSet = new Set<string>();
          for (const item of data.results || []) {
            for (const s of item.setups || []) {
              if (s.id) activeSet.add(s.id);
            }
          }
          prevSetupIds.current = activeSet;
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Scan error:', err);
      }
    } finally {
      isScanningRef.current = false;
      setScanning(false);
    }
  };

  // Initial Scan on Mount
  useEffect(() => {
    runScan();
  }, []);

  // 24/7 Background Auto-Scan Interval (every 45 seconds)
  useEffect(() => {
    if (!isAutoScanning) return;
    const intervalId = setInterval(() => {
      runScan(watchlist, timeframe);
    }, 45000);
    return () => clearInterval(intervalId);
  }, [isAutoScanning, watchlist, timeframe]);

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isRefreshingMarketData, setIsRefreshingMarketData] = useState<boolean>(false);

  const handleRefreshMarketData = async () => {
    setIsRefreshingMarketData(true);
    try {
      await Promise.allSettled([
        fetch('/api/cboe-options?refresh=true'),
        fetch('/api/heatmap?refresh=true&timeframe=1D'),
        runScan(watchlist, timeframe),
      ]);
      window.dispatchEvent(new CustomEvent('market-data-refreshed'));
      setLastRefreshedAt(new Date());
    } catch (e) {
      console.error('Failed to refresh market context:', e);
      setLastRefreshedAt(new Date());
    } finally {
      setIsRefreshingMarketData(false);
    }
  };

  const handleSelectSymbolForChart = (sym: string) => {
    setSelectedSymbol(sym);
    setActiveTab('chart');
    setChartSubTab('studio');
  };

  const handleScanCustomSymbols = (symbols: string[]) => {
    setWatchlist(symbols);
    setActiveTab('scanner');
    setScannerSubTab('live');
    runScan(symbols, timeframe);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500 selection:text-zinc-950">
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => navigateTo(tab)}
        onQuickJump={(tab, subTab) => navigateTo(tab, subTab)}
        isAutoScanning={isAutoScanning}
        setIsAutoScanning={setIsAutoScanning}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        lastScanTime={lastScanTime}
        activeAlertCount={alerts.length}
        onOpenTelegramConfig={() => setShowTelegramModal(true)}
        lastRefreshedAt={lastRefreshedAt}
        onRefreshMarketData={handleRefreshMarketData}
        isRefreshingData={isRefreshingMarketData}
      />

      <main className="max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 1. TODAY COMMAND CENTER */}
        {activeTab === 'today' && (
          <TodayView
            onOpenChart={handleSelectSymbolForChart}
            scannerResults={results}
            onScanNow={() => runScan(watchlist, timeframe)}
          />
        )}

        {/* 2. SCANNER HUB (Live Scanner | Confluence 360° | Action Zones | Watchlists) */}
        {activeTab === 'scanner' && (
          <div>
            <WorkspaceSubNav<ScannerSubTab>
              active={scannerSubTab}
              onSelect={setScannerSubTab}
              subtitle="S&P 500 Divergences, 6-Angle Confluence, Action Zones & Custom Watchlists"
              items={[
                { id: 'live', label: 'Live Divergence Scanner', icon: Radio },
                { id: 'confluence', label: 'Confluence 360°', icon: Sparkles },
                { id: 'zones', label: 'Action Zones', icon: Compass },
                { id: 'watchlists', label: 'Watchlists', icon: Bookmark },
              ]}
            />
            {scannerSubTab === 'live' && (
              <LiveScanner
                results={results}
                scanning={scanning}
                onScanNow={runScan}
                onSelectSymbolForChart={handleSelectSymbolForChart}
                onOpenCalculator={(s) => setCalculatorSetup(s)}
                watchlist={watchlist}
                setWatchlist={setWatchlist}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
              />
            )}
            {scannerSubTab === 'confluence' && (
              <ConfluenceMatrixView
                onSelectSymbolForChart={handleSelectSymbolForChart}
                scannerResults={results}
              />
            )}
            {scannerSubTab === 'zones' && (
              <ActionDashboard
                onSelectSymbolForChart={handleSelectSymbolForChart}
                onOpenCalculator={(s) => setCalculatorSetup(s)}
              />
            )}
            {scannerSubTab === 'watchlists' && (
              <WatchlistManagerView
                onSelectSymbolForChart={handleSelectSymbolForChart}
                onSetScanWatchlist={(symbols) => handleScanCustomSymbols(symbols)}
              />
            )}
          </div>
        )}

        {/* 3. CHARTS & SEC HUB (Technical Chart Studio | SEC EDGAR Search) */}
        {activeTab === 'chart' && (
          <div>
            <WorkspaceSubNav<ChartSubTab>
              active={chartSubTab}
              onSelect={setChartSubTab}
              subtitle="Interactive Charting with Integrated SEC Filings Sidebar & Standalone EDGAR Search"
              items={[
                { id: 'studio', label: 'Chart Studio', icon: LineChart },
                { id: 'sec', label: 'SEC EDGAR Search', icon: FileText },
              ]}
            />
            {chartSubTab === 'studio' && (
              <ChartViewer
                initialSymbol={selectedSymbol}
                onOpenCalculator={(s) => setCalculatorSetup(s)}
              />
            )}
            {chartSubTab === 'sec' && <SecEdgarInspector />}
          </div>
        )}

        {/* 4. MARKETS HUB (S&P 500 Heatmap | GICS Sectors & Breadth) */}
        {activeTab === 'markets' && (
          <div>
            <WorkspaceSubNav<MarketsSubTab>
              active={marketsSubTab}
              onSelect={setMarketsSubTab}
              subtitle="S&P 500 Treemap & 11 SPDR Sector ETF Breadth Benchmarks"
              items={[
                { id: 'heatmap', label: 'S&P 500 Heatmap', icon: Grid },
                { id: 'sectors', label: 'GICS Sectors & Breadth', icon: PieChart },
              ]}
            />
            {marketsSubTab === 'heatmap' && (
              <MarketHeatmap onSelectSymbolForChart={handleSelectSymbolForChart} />
            )}
            {marketsSubTab === 'sectors' && (
              <SectorPerformanceView
                onSelectSymbolForChart={handleSelectSymbolForChart}
                onSetScanWatchlist={(symbols) => handleScanCustomSymbols(symbols)}
                scannerResults={results}
              />
            )}
          </div>
        )}

        {/* 5. OPTIONS FLOW & GEX */}
        {activeTab === 'options' && (
          <CboeOptionsAnalytics
            initialSymbol={selectedSymbol}
            onSelectSymbolForChart={handleSelectSymbolForChart}
          />
        )}

        {/* 6. BOTS, JOURNAL & BACKTESTER HUB */}
        {activeTab === 'journal' && (
          <TradeJournalView
            onSelectSymbolForChart={handleSelectSymbolForChart}
            scannerResults={results}
            requestedSubTab={journalSubTab}
          />
        )}

        {/* 7. QUANT LAB HUB (Orderflow & SMC Lab | Stage & AVWAP Lab | Indicator Library | 4-Pillars Playbook) */}
        {activeTab === 'quant' && (
          <div>
            <WorkspaceSubNav<QuantSubTab>
              active={quantSubTab}
              onSelect={setQuantSubTab}
              subtitle="Quantitative Indicators, Stage Analysis, PineTS Validation & Playbook"
              items={[
                { id: 'luxalgo', label: 'Orderflow & SMC Lab', icon: Sparkles },
                { id: 'trendspider', label: 'Stage & AVWAP Lab', icon: Compass },
                { id: 'indicators', label: 'Indicator Library', icon: Code2 },
                { id: 'rules', label: '4-Pillars Playbook', icon: BookOpen },
              ]}
            />
            {quantSubTab === 'luxalgo' && (
              <LuxAlgoSuite
                initialSymbol={selectedSymbol}
                onSelectSymbolForChart={handleSelectSymbolForChart}
              />
            )}
            {quantSubTab === 'trendspider' && (
              <TrendSpiderSuite
                onSelectSymbolForChart={handleSelectSymbolForChart}
                onOpenCalculator={(s) => setCalculatorSetup(s)}
                onNavigateToTab={(t) => navigateTo(t)}
              />
            )}
            {quantSubTab === 'indicators' && (
              <IndicatorLibraryView
                onSelectIndicatorForChart={(ind) => {
                  try {
                    const key = 'stageledger_active_chart_indicators';
                    const raw = localStorage.getItem(key);
                    const current: string[] = raw
                      ? JSON.parse(raw)
                      : ['supertrend-v9-pro', 'matrix-ai-pro'];
                    if (!current.includes(ind.id)) {
                      localStorage.setItem(key, JSON.stringify([...current, ind.id]));
                    }
                    window.dispatchEvent(new CustomEvent('stageledger:indicators-changed'));
                  } catch {
                    // ignore storage failures
                  }
                  navigateTo('chart', 'studio');
                }}
              />
            )}
            {quantSubTab === 'rules' && <StrategyGuide />}
          </div>
        )}

        {/* 8. OPS & ALERTS HUB (Alerts Stream | System Health | Python Daemon) */}
        {activeTab === 'ops' && (
          <div>
            <WorkspaceSubNav<OpsSubTab>
              active={opsSubTab}
              onSelect={setOpsSubTab}
              subtitle="Live Signal Dispatch, Upstream Diagnostics & Standalone Python Daemon"
              items={[
                {
                  id: 'alerts',
                  label: 'Alerts & Webhooks',
                  icon: Bell,
                  badge: alerts.length > 0 ? alerts.length : undefined,
                },
                { id: 'health', label: 'System Health', icon: Activity },
                { id: 'python', label: 'Python Daemon', icon: Terminal },
              ]}
            />
            {opsSubTab === 'alerts' && (
              <AlertStream
                alerts={alerts}
                onClearAlerts={() => setAlerts([])}
                onSelectSymbolForChart={handleSelectSymbolForChart}
                onPlayChime={playAlertChime}
                onOpenWebhookModal={() => setShowWebhookModal(true)}
              />
            )}
            {opsSubTab === 'health' && <SystemHealthView />}
            {opsSubTab === 'python' && <PythonDaemonView />}
          </div>
        )}
      </main>

      <footer className="max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 border-t border-zinc-900 text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
        <span>
          StageLedger &middot; Analytical research &amp; journaling software. Not personalized investment advice or an automated brokerage execution service.
        </span>
        <span className="font-mono tabular-nums">
          Market feeds via public Yahoo Finance (10–20m delayed quote windows), CBOE &amp; SEC EDGAR.
        </span>
      </footer>

      {/* Position Scaling Calculator Modal */}
      {calculatorSetup && (
        <PositionCalculatorModal
          setup={calculatorSetup}
          onClose={() => setCalculatorSetup(null)}
        />
      )}

      {/* Telegram Alert Bot Config Modal */}
      {showTelegramModal && (
        <TelegramConfigModal onClose={() => setShowTelegramModal(false)} />
      )}

      {/* Webhook Alert Config Modal */}
      {showWebhookModal && (
        <WebhookConfigModal onClose={() => setShowWebhookModal(false)} />
      )}
    </div>
  );
}
