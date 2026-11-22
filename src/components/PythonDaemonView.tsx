import React, { useState } from 'react';
import {
  Terminal,
  Download,
  Copy,
  Check,
  Play,
  Server,
  Cpu,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Send,
  Database,
  ArrowRight,
} from 'lucide-react';
import { fetchJsonSafe } from '../utils/safeFetchJson';

export const PythonDaemonView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [runningTest, setRunningTest] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'architecture' | 'code' | 'deployment'>('architecture');

  const handleCopyCode = async () => {
    try {
      const res = await fetch('/api/download-python');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunPythonTest = async () => {
    setRunningTest(true);
    setTestOutput('Launching Python 3.10 interpreter with trullas_scanner_247.py...\nConnecting to Yahoo Finance & SEC EDGAR...\n');
    try {
      const resp = await fetchJsonSafe<{
        success?: boolean;
        stdout?: string;
        stderr?: string;
        error?: string;
      }>('/api/run-python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: ['AAPL', 'MSFT', 'NVDA', 'BTC-USD', 'SPY'] }),
      });
      if (resp.ok && resp.data?.success) {
        setTestOutput(resp.data.stdout || 'Scan completed successfully with 0 exit code.');
      } else {
        setTestOutput(
          `Error running script:\n${resp.data?.error || resp.error || `HTTP ${resp.status}`}\n${resp.data?.stderr || ''}\n${resp.data?.stdout || ''}`
        );
      }
    } catch (e: any) {
      setTestOutput(`Execution failed: ${e.message}`);
    } finally {
      setRunningTest(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-3">
              <Terminal className="w-3.5 h-3.5" />
              <span>Autonomous 24/7 Python Daemon Architecture</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              24/7 Python Scanner & Architectural Design
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-3xl leading-relaxed">
              Engineered to run indefinitely on any server, VPS, Raspberry Pi, or cloud container. Ingests free real-time data from <strong className="text-zinc-200">Yahoo Finance</strong> and <strong className="text-zinc-200">SEC EDGAR</strong> without paying for costly subscriptions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunPythonTest}
              disabled={runningTest}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${runningTest ? 'animate-spin' : ''}`} />
              <span>{runningTest ? 'Running in Python...' : 'Test Run Python Script'}</span>
            </button>

            <a
              href="/api/download-python"
              download="trullas_scanner_247.py"
              className="flex items-center space-x-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs rounded-lg transition border border-zinc-700"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Download .py File</span>
            </a>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-zinc-800">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'architecture'
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
            }`}
          >
            1. System Architecture & Data Pipelines
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'code'
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
            }`}
          >
            2. Python Source Code (Zero-Dependency)
          </button>
          <button
            onClick={() => setActiveTab('deployment')}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'deployment'
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
            }`}
          >
            3. 24/7 Deployment (Systemd, Docker, Cron)
          </button>
        </div>
      </div>

      {/* Terminal Test Output Modal/Drawer */}
      {testOutput && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-3 font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-zinc-400">
            <span className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Live Container Execution: `python3 trullas_scanner_247.py`</span>
            </span>
            <button
              onClick={() => setTestOutput(null)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Close
            </button>
          </div>
          <pre className="text-zinc-200 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed bg-black/60 p-4 rounded-lg border border-zinc-900">
            {testOutput}
          </pre>
        </div>
      )}

      {/* TAB 1: SYSTEM ARCHITECTURE & DATA PIPELINES */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          {/* Architecture Diagram Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                A
              </div>
              <h3 className="font-bold text-white text-sm">Data Ingestion Layer</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Fetches OHLCV candles from free Yahoo Finance v8 chart JSON endpoints with automated user-agent rotation and exponential backoff retry.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800">
                GET /v8/finance/chart/{'{symbol}'}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold text-xs">
                B
              </div>
              <h3 className="font-bold text-white text-sm">SEC EDGAR Pipeline</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Queries SEC submissions API for US CIKs. Parses recent Form 4 (insider purchases) and Form 8-K material disclosures within the last 14 days.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800">
                GET /submissions/CIK{'{cik}'}.json
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                C
              </div>
              <h3 className="font-bold text-white text-sm">Trullàs Strategy Core</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Computes EMA(12), EMA(26), MACD Line, Signal(9), Histogram, RSI(14). Detects 3 consecutive swing peaks/troughs and evaluates contrary slopes.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800">
                Swing P1 &rarr; P2 &rarr; P3 Evaluator
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                D
              </div>
              <h3 className="font-bold text-white text-sm">Alerts &amp; 24/7 Supervisor</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Dispatches push notifications via Telegram Bot API or Discord Webhook with bar-level deduplication and exponential HTTP 429 backoff.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800">
                Telegram / Discord Webhook
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PYTHON SOURCE CODE */}
      {activeTab === 'code' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-zinc-800">
            <div>
              <div className="text-sm font-bold text-white font-mono">trullas_scanner_247.py</div>
              <div className="text-xs text-zinc-500">Standalone Python script &bull; Zero external dependencies required</div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyCode}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Source'}</span>
              </button>

              <a
                href="/api/download-python"
                download="trullas_scanner_247.py"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded text-xs transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .py</span>
              </a>
            </div>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/80 font-mono text-xs overflow-x-auto max-h-[500px]">
            <pre className="text-zinc-300 whitespace-pre leading-relaxed">
{`# Sample CLI Usage:
# 1. Scan the full S&P 500 Universe:
python3 trullas_scanner_247.py --sp500 --once

# 2. Scan specific S&P 500 Sector (tech, healthcare, financials, energy, etc.):
python3 trullas_scanner_247.py --sector tech --loop --interval 300

# 3. Continuous 24/7 loop across S&P 500 with Telegram push notifications:
python3 trullas_scanner_247.py --sector healthcare --loop --interval 300 \\
  --telegram-token "YOUR_TELEGRAM_BOT_TOKEN" \\
  --telegram-chat-id "YOUR_TELEGRAM_CHAT_ID"

# 4. Custom tickers + Discord Webhook:
python3 trullas_scanner_247.py --tickers AAPL MSFT NVDA TSLA BTC-USD \\
  --discord-webhook "https://discord.com/api/webhooks/..." --loop`}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 3: 24/7 DEPLOYMENT GUIDE */}
      {activeTab === 'deployment' && (
        <div className="space-y-6">
          {/* Linux systemd setup */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-400" />
              <span>Method 1: Linux / VPS systemd Service (Production Daemon)</span>
            </h3>
            <p className="text-xs text-zinc-400">
              A systemd unit ensures that if your server reboots or the process ever terminates unexpectedly, Linux restarts it automatically in milliseconds.
            </p>

            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 space-y-3">
              <div className="text-zinc-500"># 1. Create service file at /etc/systemd/system/trullas-scanner.service</div>
              <pre className="text-emerald-400">
{`[Unit]
Description=David Trullas MACD Triple Divergence 24/7 Scanner
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/trullas-scanner
ExecStart=/usr/bin/python3 /opt/trullas-scanner/trullas_scanner_247.py --loop --interval 300
Restart=always
RestartSec=10
StandardOutput=append:/var/log/trullas-scanner.log
StandardError=append:/var/log/trullas-scanner.error.log

[Install]
WantedBy=multi-user.target`}
              </pre>
              <div className="text-zinc-500"># 2. Enable and start the daemon</div>
              <pre className="text-zinc-200">
sudo systemctl daemon-reload
sudo systemctl enable trullas-scanner
sudo systemctl start trullas-scanner
sudo systemctl status trullas-scanner
              </pre>
            </div>
          </div>

          {/* Docker setup */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              <span>Method 2: Docker Container (Lightweight Alpine Linux)</span>
            </h3>

            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 space-y-3">
              <div className="text-zinc-500"># Dockerfile</div>
              <pre className="text-blue-400">
{`FROM python:3.10-alpine
WORKDIR /app
COPY trullas_scanner_247.py .
CMD ["python", "trullas_scanner_247.py", "--loop", "--interval", "300"]`}
              </pre>
              <div className="text-zinc-500"># Build and run with restart=always:</div>
              <pre className="text-zinc-200">
docker build -t trullas-scanner .
docker run -d --restart=always --name trullas-daemon trullas-scanner
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
