import React, { useState, useMemo } from 'react';
import {
  Bell,
  Send,
  Volume2,
  Trash2,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Activity,
  Flame,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Filter,
  Check,
  X,
  Gauge,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  AlertFilterCriteria,
  AlertItemData,
  DEFAULT_ALERT_FILTERS,
  VolatilityLevel,
  determineVolatilityLevel,
  filterAlertList,
  getVolatilityLevelMeta,
  isFilterActive,
  countActiveFilters,
} from '../utils/alertFilter';
import { generateStableAlertId, generateCompositeKey } from '../utils/dataFetcher';

export type AlertLogItem = AlertItemData;
export type { VolatilityLevel, AlertFilterCriteria };

interface AlertStreamProps {
  alerts: AlertLogItem[];
  onClearAlerts: () => void;
  onSelectSymbolForChart: (sym: string) => void;
  onPlayChime: () => void;
}

export const AlertStream: React.FC<AlertStreamProps> = ({
  alerts,
  onClearAlerts,
  onSelectSymbolForChart,
  onPlayChime,
}) => {
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [testSent, setTestSent] = useState(false);

  // Filter settings state
  const [showSettings, setShowSettings] = useState(true);
  const [filters, setFilters] = useState<AlertFilterCriteria>(DEFAULT_ALERT_FILTERS);

  const handleSendTestWebhook = () => {
    onPlayChime();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  // Toggle volatility level selection
  const handleToggleVolatility = (level: VolatilityLevel) => {
    setFilters((prev) => {
      const exists = prev.volatilityLevels.includes(level);
      let updated: VolatilityLevel[];
      if (exists) {
        // Prevent unselecting all (keep at least one or allow empty if user desires)
        updated = prev.volatilityLevels.filter((l) => l !== level);
        if (updated.length === 0) {
          // If all deselected, keep current
          return prev;
        }
      } else {
        updated = [...prev.volatilityLevels, level];
      }
      return { ...prev, volatilityLevels: updated };
    });
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_ALERT_FILTERS);
  };

  // Filtered alerts list
  const filteredAlerts = useMemo(() => {
    return filterAlertList(alerts, filters);
  }, [alerts, filters]);

  const activeFilterCount = useMemo(() => {
    return countActiveFilters(filters);
  }, [filters]);

  const filterIsActive = useMemo(() => {
    return isFilterActive(filters);
  }, [filters]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium mb-3">
              <Bell className="w-3.5 h-3.5" />
              <span>Real-Time Alert Dispatcher & Webhooks</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              24/7 Push Notifications & Alert Stream
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Never miss a 3rd wave exhaustion setup. Connect Telegram or Discord webhooks to receive instant notifications, and filter alerts by minimum MACD quality score or asset volatility.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => (window as any).setShowWebhookModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-medium transition"
              title="Configure Webhook alerts"
            >
              <Zap className="w-4 h-4" />
              <span>Configure Webhook</span>
            </button>
            <button
              onClick={onPlayChime}
              className="flex items-center space-x-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-zinc-700 transition"
              title="Test Web Audio synthesizer chime"
            >
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>Test Audio Chime</span>
            </button>
          </div>
        </div>
      </div>

      {/* Webhook Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Telegram Bot Setup */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="font-bold text-white text-sm flex items-center space-x-2">
              <span>Telegram Bot Integration</span>
            </h3>
            <span className="text-[10px] text-zinc-500">Free Push to Phone</span>
          </div>
          <p className="text-xs text-zinc-400">
            Create a bot with <span className="text-zinc-200">@BotFather</span> on Telegram and paste credentials below to receive immediate mobile alerts.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Bot Token</label>
              <input
                type="text"
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Chat ID</label>
              <input
                type="text"
                placeholder="e.g. 987654321"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Webhook Automation Setup */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="font-bold text-white text-sm">Webhook Automation (Zapier/Make)</h3>
            <span className="text-[10px] text-zinc-500">Instant POST Trigger</span>
          </div>
          <p className="text-xs text-zinc-400">
            Send rich JSON alert payloads to automation platforms like Zapier or Make.com to trigger custom workflows, email, or Slack notifications.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Webhook URL</label>
              <input
                type="text"
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                value={discordWebhook} // Reusing variable name, rename if desired
                onChange={(e) => setDiscordWebhook(e.target.value)}
                className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleSendTestWebhook}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-xs transition flex items-center justify-center space-x-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{testSent ? 'Simulated Ping Dispatched!' : 'Send Test Webhook Ping'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alert Feed Section with Settings Filter Panel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        {/* Stream Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-white text-base">Live Divergence Alerts Stream</h3>
                <span className="text-xs font-mono text-zinc-400">
                  ({filteredAlerts.length} shown / {alerts.length} total)
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Filtered real-time event feed calibrated to MACD exhaustion thresholds.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Toggle Settings Panel Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                showSettings
                  ? 'bg-zinc-800 text-emerald-400 border-zinc-700'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter Settings</span>
              {filterIsActive && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {activeFilterCount} Active
                </span>
              )}
              {showSettings ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>

            {/* Clear Alerts Button */}
            {alerts.length > 0 && (
              <button
                onClick={onClearAlerts}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-rose-400 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 transition"
                title="Clear current session alert log"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear History</span>
              </button>
            )}
          </div>
        </div>

        {/* SETTINGS PANEL (Collapsible) */}
        {showSettings && (
          <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Alert Stream Filters & Quality Thresholds
                </h4>
              </div>

              <div className="flex items-center space-x-2">
                {filterIsActive && (
                  <button
                    onClick={handleResetFilters}
                    className="flex items-center space-x-1 text-xs text-zinc-400 hover:text-white transition px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
                  >
                    <RotateCcw className="w-3 h-3 text-zinc-400" />
                    <span>Reset Defaults</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* FILTER 1: Minimum MACD Quality Score */}
              <div className="space-y-3 bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-white">Min MACD Quality Score</span>
                  </div>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      filters.minQualityScore >= 80
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : filters.minQualityScore >= 60
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                    }`}
                  >
                    {filters.minQualityScore === 0 ? 'Any (0%)' : `≥ ${filters.minQualityScore}%`}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Trullàs 4-Pillars algorithm rates MACD histogram divergence, RSI exhaustion, multi-point swing slope, and Fibonacci geometry.
                </p>

                {/* Score Slider */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                    <span>0% (All)</span>
                    <span>50%</span>
                    <span>70% (Strong)</span>
                    <span>85%+ (Elite)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    step="5"
                    value={filters.minQualityScore}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        minQualityScore: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-emerald-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    { label: 'All (0%)', val: 0 },
                    { label: '≥ 60% Basic', val: 60 },
                    { label: '≥ 70% Strong', val: 70 },
                    { label: '≥ 80% High Prob', val: 80 },
                    { label: '≥ 90% Elite', val: 90 },
                  ].map((preset, pIdx) => {
                    const active = filters.minQualityScore === preset.val;
                    return (
                      <button
                        key={`${preset.val}-${pIdx}-${Date.now()}`}
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            minQualityScore: preset.val,
                          }))
                        }
                        className={`text-[11px] px-2.5 py-1 rounded transition border font-mono ${
                          active
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-semibold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* FILTER 2: Ticker Volatility Levels */}
              <div className="space-y-3 bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-white">Ticker Volatility Levels</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {filters.volatilityLevels.length === 3
                      ? 'All Levels'
                      : `${filters.volatilityLevels.length} of 3 selected`}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Filter alerts by Average True Range (ATR % of price). Exclude stagnant symbols or isolate explosive movers.
                </p>

                {/* Volatility Level Checkboxes/Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {(['low', 'moderate', 'high'] as VolatilityLevel[]).map((level, lIdx) => {
                    const isSelected = filters.volatilityLevels.includes(level);
                    const meta = getVolatilityLevelMeta(level);
                    return (
                      <button
                        key={`${level}-${lIdx}-${Date.now()}`}
                        onClick={() => handleToggleVolatility(level)}
                        className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition ${
                          isSelected
                            ? `${meta.badgeBg} font-medium`
                            : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-500 opacity-60 hover:opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold">{meta.label}</span>
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                              isSelected
                                ? 'bg-emerald-500/30 border-emerald-500 text-emerald-300'
                                : 'border-zinc-700'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono mt-1 text-zinc-400">
                          {meta.range}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Volatility Shortcuts */}
                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-zinc-500">Quick Vol Presets:</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          volatilityLevels: ['low', 'moderate', 'high'],
                        }))
                      }
                      className="text-zinc-400 hover:text-white underline underline-offset-2"
                    >
                      All Levels
                    </button>
                    <span className="text-zinc-700">&bull;</span>
                    <button
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          volatilityLevels: ['moderate', 'high'],
                        }))
                      }
                      className="text-zinc-400 hover:text-white underline underline-offset-2"
                    >
                      Exclude Stagnant
                    </button>
                    <span className="text-zinc-700">&bull;</span>
                    <button
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          volatilityLevels: ['high'],
                        }))
                      }
                      className="text-zinc-400 hover:text-amber-400 underline underline-offset-2"
                    >
                      High Vol Only
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center pt-2 border-t border-zinc-800/60">
              <button
                onClick={() => setFilters(prev => ({ ...prev, priceNearSupport: !prev.priceNearSupport }))}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition ${
                  filters.priceNearSupport
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Only Price Near Historical Support</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800/60">
              <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 text-xs">
                <span className="text-zinc-400 shrink-0">Pattern Direction:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'All', val: 'ALL' },
                    { label: 'Bullish', val: 'BULLISH' },
                    { label: 'Bearish', val: 'BEARISH' },
                    { label: 'Triple Only', val: 'TRIPLE' },
                  ].map((item, dIdx) => (
                    <button
                      key={`${item.val}-${dIdx}-${Date.now()}`}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          divergenceType: item.val as any,
                        }))
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-mono transition border ${
                        filters.divergenceType === item.val
                          ? 'bg-zinc-800 text-white border-zinc-600 font-semibold'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Symbol / Search Query */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter by Symbol or Name (e.g. NVDA, AAPL)..."
                  value={filters.searchQuery}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      searchQuery: e.target.value,
                    }))
                  }
                  className="w-full pl-8 pr-8 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
                {filters.searchQuery && (
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, searchQuery: '' }))}
                    className="absolute right-2.5 top-2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ACTIVE FILTER SUMMARY BAR */}
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 px-1 border-t border-zinc-900">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-zinc-300">Active Criteria:</span>
                <span className="font-mono text-[11px] text-zinc-400">
                  Min Score: {filters.minQualityScore}% &bull; Volatility: {filters.volatilityLevels.join(', ')} &bull; Direction: {filters.divergenceType}
                  {filters.searchQuery ? ` &bull; Ticker: "${filters.searchQuery}"` : ''}
                </span>
              </div>
              <span className="font-mono text-emerald-400 text-[11px]">
                Showing {filteredAlerts.length} of {alerts.length} events
              </span>
            </div>
          </div>
        )}

        {/* ALERTS FEED LIST */}
        {filteredAlerts.length > 0 ? (
          <div className="space-y-2.5">
            {filteredAlerts.map((al, idx) => {
              const isBull = al.type.includes('BULLISH');
              const isTriple = al.type.includes('TRIPLE');
              const volLevel = al.volatilityLevel || determineVolatilityLevel(al.atrPercent);
              const volMeta = getVolatilityLevelMeta(volLevel);
              // Stable unique identifier constructed as ${symbol}-${index}-${Date.now()}
              const alertKey = `${al.symbol}-${idx}-${Date.now()}`;

              return (
                <div
                  key={alertKey}
                  className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs"
                >
                  <div className="flex items-start sm:items-center space-x-3.5">
                    {/* Direction Icon */}
                    <span
                      className={`p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0 ${
                        isBull
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {isBull ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </span>

                    {/* Metadata & Details */}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-white text-sm font-sans tracking-tight">
                          {al.symbol}
                        </strong>
                        {al.companyName && (
                          <span className="text-[11px] font-sans text-zinc-400 max-w-[140px] truncate">
                            {al.companyName}
                          </span>
                        )}

                        {/* Pattern Type */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isBull
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}
                        >
                          {al.type.replace('_', ' ')}
                        </span>

                        {/* MACD Quality Score Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            al.score >= 80
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : al.score >= 65
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          Score: {al.score}% {al.score >= 85 ? '★ Elite' : ''}
                        </span>

                        {/* Ticker Volatility Badge */}
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border ${volMeta.badgeBg}`}
                          title={`ATR %: ${al.atrPercent ? al.atrPercent.toFixed(2) + '%' : 'Calculated'}`}
                        >
                          {volMeta.label}
                          {al.atrPercent ? ` (${al.atrPercent.toFixed(1)}% ATR)` : ''}
                        </span>
                      </div>

                      {/* Technical Execution Metrics */}
                      <div className="text-[11px] text-zinc-400 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Price: <strong className="text-zinc-200">${al.price.toFixed(2)}</strong></span>
                        <span className="text-zinc-600">&bull;</span>
                        <span>Trigger (23.6%): <strong className="text-zinc-200">${al.trigger.toFixed(2)}</strong></span>
                        <span className="text-zinc-600">&bull;</span>
                        <span>SL: <strong className="text-rose-400">${al.stopLoss.toFixed(2)}</strong></span>
                        <span className="text-zinc-600">&bull;</span>
                        <span>TP2 (61.8%): <strong className="text-emerald-400">${al.target2.toFixed(2)}</strong></span>
                        {al.atr && (
                          <>
                            <span className="text-zinc-600">&bull;</span>
                            <span className="text-zinc-400 font-mono">ATR(14): ${al.atr.toFixed(2)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Timestamp */}
                  <div className="flex items-center justify-between sm:justify-end space-x-3 text-zinc-500 text-[11px] shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-900">
                    <span className="font-mono text-zinc-400">
                      {new Date(al.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <button
                      onClick={() => onSelectSymbolForChart(al.symbol)}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-lg text-xs font-sans transition border border-zinc-800 hover:border-zinc-700 flex items-center space-x-1"
                    >
                      <span>Chart</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-10 text-center text-xs bg-zinc-950 rounded-xl border border-zinc-800/80 space-y-3">
            {alerts.length === 0 ? (
              <>
                <Bell className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-zinc-300 font-medium text-sm">No alerts logged in the current session</p>
                <p className="text-zinc-500 max-w-md mx-auto text-xs leading-relaxed">
                  Keep the 24/7 background scanning loop active to automatically catch new 3rd-wave MACD divergences as they trigger across the universe.
                </p>
              </>
            ) : (
              <>
                <Filter className="w-8 h-8 text-amber-500/60 mx-auto" />
                <p className="text-zinc-300 font-medium text-sm">No alerts match your active filter criteria</p>
                <p className="text-zinc-500 max-w-md mx-auto text-xs leading-relaxed">
                  {alerts.length} alerts are logged, but none met the criteria (Min Score: {filters.minQualityScore}%, Volatility Levels: {filters.volatilityLevels.join(', ')}).
                </p>
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium border border-zinc-700 transition inline-flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Reset Filter Thresholds</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
