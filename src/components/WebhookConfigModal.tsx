import React, { useState } from 'react';
import {
  Send,
  X,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Zap,
  Bot,
  RefreshCw,
} from 'lucide-react';
import {
  WebhookConfig,
  loadWebhookConfig,
  saveWebhookConfig,
  sendWebhookAlert,
} from '../utils/webhookAlerts';
import { DivergenceSetup } from '../utils/trullasStrategy';

interface WebhookConfigModalProps {
  onClose: () => void;
}

export const WebhookConfigModal: React.FC<WebhookConfigModalProps> = ({ onClose }) => {
  const [config, setConfig] = useState<WebhookConfig>(loadWebhookConfig());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleUpdate = (updated: Partial<WebhookConfig>) => {
    const next = { ...config, ...updated };
    setConfig(next);
  };

  const handleSave = () => {
    saveWebhookConfig(config);
    onClose();
  };

  const handleSendTestNotification = async () => {
    if (!config.url.trim()) {
      setTestResult({
        success: false,
        message: 'Please provide a Webhook URL before testing.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    // Mock setup for test
    const testSetup: DivergenceSetup = {
      id: 'test-setup',
      symbol: 'TEST',
      timeframe: '1d',
      type: 'BULLISH_TRIPLE',
      qualityScore: 99,
      points: [],
      currentPrice: 100.0,
      triggerPrice: 101.0,
      stopLoss: 98.0,
      fibLevels: { fib0: 98, fib236: 100, fib382: 102, fib500: 103, fib618: 104, fib1000: 105 },
      targets: { tp1: 102, tp2: 104, tp3: 105 },
      riskRewardRatio: 1.5,
      confluenceChecks: { 
        priceDivergence: true,
        macdDivergence: true, 
        rsiDivergence: true, 
        volumeExhaustion: true,
        macdCrossConfirmed: true 
      },
      scalingTranches: { tranche1: '', tranche2: '', tranche3: '' },
      detectedAt: Date.now()
    };

    const res = await sendWebhookAlert(config.url, testSetup);

    if (res.success) {
      setTestResult({
        success: true,
        message: 'Test notification delivered to Webhook successfully!',
      });
      const next = { ...config, enabled: true };
      setConfig(next);
      saveWebhookConfig(next);
    } else {
      setTestResult({
        success: false,
        message: res.error || 'Failed to send webhook test notification.',
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

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Webhook Automation Config</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  config.enabled && config.url
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {config.enabled && config.url ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Send alerts to Zapier, Make.com, or custom endpoints.
            </p>
          </div>
        </div>

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

        <div className="space-y-4 text-xs font-mono">
          <div>
            <label className="text-zinc-300 block mb-1 font-sans font-semibold">
              Webhook URL (POST)
            </label>
            <input
              type="text"
              placeholder="e.g. https://hooks.zapier.com/hooks/catch/..."
              value={config.url}
              onChange={(e) => handleUpdate({ url: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 font-sans">
            <div className="flex items-center justify-between">
              <span className="text-zinc-300 font-semibold text-xs">Enable Webhook Alerts</span>
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
                <span>Min Quality Score Filter:</span>
                <span className="font-mono text-indigo-400 font-bold">
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
                className="w-full accent-indigo-500 bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleSendTestNotification}
            disabled={testing || !config.url}
            className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition flex items-center space-x-2 disabled:opacity-50"
          >
            {testing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
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
