import { DivergenceSetup } from './trullasStrategy';

export interface WebhookConfig {
  url: string;
  enabled: boolean;
  notifyMinQualityScore: number;
  notifyOnBullish: boolean;
  notifyOnBearish: boolean;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  url: '',
  enabled: false,
  notifyMinQualityScore: 70,
  notifyOnBullish: true,
  notifyOnBearish: true,
};

const STORAGE_KEY = 'trullas_webhook_config_v1';

export function loadWebhookConfig(): WebhookConfig {
  if (typeof window === 'undefined') return DEFAULT_WEBHOOK_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEBHOOK_CONFIG;
    return { ...DEFAULT_WEBHOOK_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load Webhook config:', e);
    return DEFAULT_WEBHOOK_CONFIG;
  }
}

export function saveWebhookConfig(config: WebhookConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save Webhook config:', e);
  }
}

/**
 * Send alert to a custom webhook URL (Zapier/Make/etc)
 */
export async function sendWebhookAlert(
  webhookUrl: string,
  setup: DivergenceSetup
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl) {
    return { success: false, error: 'Webhook URL is required.' };
  }

  try {
    const response = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert: 'TRULLÀS MACD ALERT',
        timestamp: new Date().toISOString(),
        setup,
      }),
    });

    if (response.ok) {
      return { success: true };
    } else {
      return {
        success: false,
        error: `Webhook server returned ${response.status}: ${response.statusText}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Network error connecting to webhook.',
    };
  }
}
