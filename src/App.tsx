import React, { useState, useEffect, useRef } from 'react';
import { Header, ActiveTab } from './components/Header';
import { StrategyGuide } from './components/StrategyGuide';
import { LiveScanner } from './components/LiveScanner';
import { ChartViewer } from './components/ChartViewer';
import { BacktesterView } from './components/BacktesterView';
import { LuxAlgoSuite } from './components/LuxAlgoSuite';
import { SecEdgarInspector } from './components/SecEdgarInspector';
import { PythonDaemonView } from './components/PythonDaemonView';
import { AlertStream, AlertLogItem } from './components/AlertStream';
import { ActionDashboard } from './components/ActionDashboard';
import { IndicatorLibraryView } from './components/IndicatorLibraryView';
import { MarketHeatmap } from './components/MarketHeatmap';
import { TradeJournalView } from './components/TradeJournalView';
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
import { SP500_TOP_50, SP500_UNIVERSE } from './data/sp500Universe';
import { deduplicateSymbols, generateStableAlertId } from './utils/dataFetcher';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
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
  useEffect(() => {
    (window as any).setShowWebhookModal = setShowWebhookModal;
  }, []);

  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);

  const prevSetupIds = useRef<Set<string>>(new Set());

  // Web Audio Synth for Alert Chime (zero mp3 dependencies)
  const playAlertChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      // AudioContext policy fallback
    }
  };

  // Scan Function
  const runScan = async (tickersToScan: string[] = watchlist, tf: string = timeframe) => {
    if (scanning) return;
    setScanning(true);
    try {
      const uniqueTickers = deduplicateSymbols(tickersToScan);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: uniqueTickers, timeframe: tf }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setLastScanTime(new Date());

        // Check for new setups to notify
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
            // Deduplicate alerts by ID to guarantee uniqueness
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

          // Dispatch Telegram Push Notifications if enabled
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
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
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
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500 selection:text-zinc-950">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
        {activeTab === 'today' && (
          <TodayView
            onOpenChart={handleSelectSymbolForChart}
            scannerResults={results}
            onScanNow={() => runScan(watchlist, timeframe)}
          />
        )}

        {activeTab === 'action-zones' && (
          <ActionDashboard
            onSelectSymbolForChart={handleSelectSymbolForChart}
            onOpenCalculator={(s) => setCalculatorSetup(s)}
          />
        )}

        {activeTab === 'scanner' && (
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

        {activeTab === 'confluence' && (
          <ConfluenceMatrixView
            onSelectSymbolForChart={handleSelectSymbolForChart}
            scannerResults={results}
          />
        )}

        {activeTab === 'watchlists' && (
          <WatchlistManagerView
            onSelectSymbolForChart={handleSelectSymbolForChart}
            onSetScanWatchlist={(symbols, name) => {
              setWatchlist(symbols);
              setActiveTab('scanner');
              runScan(symbols, timeframe);
            }}
          />
        )}

        {activeTab === 'sectors' && (
          <SectorPerformanceView
            onSelectSymbolForChart={handleSelectSymbolForChart}
            onSetScanWatchlist={(symbols, name) => {
              setWatchlist(symbols);
              setActiveTab('scanner');
              runScan(symbols, timeframe);
            }}
            scannerResults={results}
          />
        )}

        {activeTab === 'options' && (
          <CboeOptionsAnalytics
            initialSymbol={selectedSymbol}
            onSelectSymbolForChart={handleSelectSymbolForChart}
          />
        )}


        {activeTab === 'chart' && (
          <ChartViewer
            initialSymbol={selectedSymbol}
            onOpenCalculator={(s) => setCalculatorSetup(s)}
          />
        )}

        {activeTab === 'heatmap' && (
          <MarketHeatmap onSelectSymbolForChart={handleSelectSymbolForChart} />
        )}

        {activeTab === 'backtester' && (
          <BacktesterView onSelectSymbolForChart={handleSelectSymbolForChart} />
        )}

        {activeTab === 'luxalgo' && (
          <LuxAlgoSuite
            initialSymbol={selectedSymbol}
            onSelectSymbolForChart={handleSelectSymbolForChart}
          />
        )}

        {activeTab === 'indicators' && (
          <IndicatorLibraryView
            onSelectIndicatorForChart={() => setActiveTab('chart')}
          />
        )}

        {activeTab === 'journal' && (
          <TradeJournalView
            onSelectSymbolForChart={handleSelectSymbolForChart}
            scannerResults={results}
          />
        )}

        {activeTab === 'rules' && <StrategyGuide />}

        {activeTab === 'sec' && <SecEdgarInspector />}

        {activeTab === 'trendspider' && (
          <TrendSpiderSuite
            onSelectSymbolForChart={handleSelectSymbolForChart}
            onOpenCalculator={(s) => setCalculatorSetup(s)}
            onNavigateToTab={(t) => setActiveTab(t)}
          />
        )}

        {activeTab === 'python' && <PythonDaemonView />}

        {activeTab === 'alerts' && (
          <AlertStream
            alerts={alerts}
            onClearAlerts={() => setAlerts([])}
            onSelectSymbolForChart={handleSelectSymbolForChart}
            onPlayChime={playAlertChime}
          />
        )}

        {activeTab === 'health' && <SystemHealthView />}
      </main>

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
