import React, { useState } from 'react';
import {
  Send,
  X,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  BellRing,
  Bot,
  Sliders,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  TelegramConfig,
  loadTelegramConfig,
  saveTelegramConfig,
  sendTelegramMessage,
} from '../utils/telegramAlerts';

interface TelegramConfigModalProps {
  onClose: () => void;
}

export const TelegramConfigModal: React.FC<TelegramConfigModalProps> = ({ onClose }) => {
  const [config, setConfig] = useState<TelegramConfig>(loadTelegramConfig());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleUpdate = (updated: Partial<TelegramConfig>) => {
    const next = { ...config, ...updated };
    setConfig(next);
  };

  const handleSave = () => {
    saveTelegramConfig(config);
    onClose();
  };

  const handleSendTestNotification = async () => {
    if (!config.botToken.trim() || !config.chatId.trim()) {
      setTestResult({
        success: false,
        message: 'Please provide both Bot Token and Chat ID before testing.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const testMsg = `
<b>🚀 TRULLÀS MACD 24/7 SCANNER TEST</b>

<b>Status:</b> Telegram Push Notification Connected Successfully!
<b>Min Quality Score Threshold:</b> ${config.notifyMinQualityScore}%

<i>You will now receive instant divergence setup alerts.</i>
`.trim();

    const res = await sendTelegramMessage(config.botToken, config.chatId, testMsg);

    if (res.success) {
      setTestResult({
        success: true,
        message: 'Test notification delivered to Telegram successfully!',
      });
      // Automatically enable if test succeeds
      const next = { ...config, enabled: true };
      setConfig(next);
      saveTelegramConfig(next);
    } else {
      setTestResult({
        success: false,
        message: res.error || 'Failed to send Telegram test notification.',
      });
    }

    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-lg bg-zinc-800/60 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title Header */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Telegram Alert Bot Configuration</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  config.enabled && config.botToken && config.chatId
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {config.enabled && config.botToken && config.chatId ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Receive instant push alerts on Telegram when new MACD triple divergences are detected.
            </p>
          </div>
        </div>

        {/* Test Result Banner */}
        {testResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-mono flex items-center space-x-2 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Form Inputs */}
        <div className="space-y-4 text-xs font-mono">
          <div>
            <label className="text-zinc-300 block mb-1 font-sans font-semibold">
              Telegram Bot Token
            </label>
            <input
              type="text"
              placeholder="e.g. 7123456789:AAFgH1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w"
              value={config.botToken}
              onChange={(e) => handleUpdate({ botToken: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          <div>
            <label className="text-zinc-300 block mb-1 font-sans font-semibold">
              Telegram Chat ID
            </label>
            <input
              type="text"
              placeholder="e.g. 123456789 or -100123456789"
              value={config.chatId}
              onChange={(e) => handleUpdate({ chatId: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>

          {/* Alert Criteria Toggles */}
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 font-sans">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-semibold text-xs">Enable Push Notifications</span>
              <button
                type="button"
                onClick={() => handleUpdate({ enabled: !config.enabled })}
                className={`px-3 py-1 rounded text-xs font-bold font-mono transition ${
                  config.enabled
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {config.enabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Minimum Quality Score Filter:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  ≥ {config.notifyMinQualityScore}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={config.notifyMinQualityScore}
                onChange={(e) => handleUpdate({ notifyMinQualityScore: Number(e.target.value) })}
                className="w-full accent-sky-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* HELP ACCORDION */}
        <div className="border border-zinc-800/80 rounded-xl bg-zinc-950/60 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full p-3.5 flex items-center justify-between text-zinc-300 hover:text-white transition font-medium"
          >
            <div className="flex items-center space-x-2">
              <HelpCircle className="w-4 h-4 text-sky-400" />
              <span>How to create a Telegram Bot & get your Chat ID</span>
            </div>
            <span className="text-zinc-500 font-mono text-[10px]">
              {showInstructions ? 'Hide Instructions' : 'Show Instructions'}
            </span>
          </button>

          {showInstructions && (
            <div className="p-4 pt-0 border-t border-zinc-800/60 space-y-3 text-zinc-400 leading-relaxed text-[11px]">
              <div>
                <strong className="text-white block mb-0.5">1. Get Bot Token from @BotFather:</strong>
                <span>Search <code className="text-sky-300 font-mono">@BotFather</code> on Telegram, send <code className="text-sky-300 font-mono">/newbot</code>, follow the prompts, and copy the HTTP API Token.</span>
              </div>
              <div>
                <strong className="text-white block mb-0.5">2. Get Chat ID from @userinfobot:</strong>
                <span>Search <code className="text-sky-300 font-mono">@userinfobot</code> on Telegram, send any message, and copy your <code className="text-sky-300 font-mono">Id</code> number.</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleSendTestNotification}
            disabled={testing || !config.botToken || !config.chatId}
            className="px-4 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-semibold transition flex items-center space-x-2 disabled:opacity-50"
          >
            {testing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>{testing ? 'Sending Test...' : 'Send Test Notification'}</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
