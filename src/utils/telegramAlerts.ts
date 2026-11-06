import { DivergenceSetup } from './trullasStrategy';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifyMinQualityScore: number; // e.g. 70%
  notifyOnBullish: boolean;
  notifyOnBearish: boolean;
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: '',
  chatId: '',
  enabled: false,
  notifyMinQualityScore: 70,
  notifyOnBullish: true,
  notifyOnBearish: true,
};

const STORAGE_KEY = 'trullas_telegram_config_v1';

export function loadTelegramConfig(): TelegramConfig {
  if (typeof window === 'undefined') return DEFAULT_TELEGRAM_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TELEGRAM_CONFIG;
    return { ...DEFAULT_TELEGRAM_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load Telegram config:', e);
    return DEFAULT_TELEGRAM_CONFIG;
  }
}

export function saveTelegramConfig(config: TelegramConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save Telegram config:', e);
  }
}

/**
 * Format a MACD Divergence Alert setup into a clean HTML message for Telegram.
 */
export function formatDivergenceTelegramAlert(setup: DivergenceSetup): string {
  const isBull = setup.type.includes('BULLISH');
  const emoji = isBull ? '🟢 🚀' : '🔴 🔻';
  const typeLabel = setup.type.replace('_', ' ');

  return `
<b>${emoji} TRULLÀS MACD ALERT: ${setup.symbol}</b>

<b>Setup:</b> ${typeLabel} (${setup.timeframe})
<b>Quality Score:</b> <b>${setup.qualityScore}%</b>
<b>Current Price:</b> $${setup.currentPrice.toFixed(2)}

🎯 <b>Key Execution Levels:</b>
• <b>Neckline Trigger (23.6%):</b> $${setup.triggerPrice.toFixed(2)}
• <b>Hard Stop Loss:</b> $${setup.stopLoss.toFixed(2)}
• <b>TP1 Target (38.2%):</b> $${setup.targets.tp1.toFixed(2)}
• <b>TP2 Golden Pocket (61.8%):</b> $${setup.targets.tp2.toFixed(2)}
• <b>Risk/Reward Ratio:</b> 1:${setup.riskRewardRatio} R:R

<i>David Trullàs 4-Pillars Trading Engine &bull; 24/7 Scanner</i>
`.trim();
}

/**
 * Send message via Telegram Bot API.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!botToken || !chatId) {
    return { success: false, error: 'Bot Token and Chat ID are required.' };
  }

  const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    if (data.ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: data.description || 'Telegram API rejected request.',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error connecting to Telegram API.',
    };
  }
}
