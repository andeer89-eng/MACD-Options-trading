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

export function validateWebhookUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    return { valid: false, error: 'Webhook URL is required.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        error: 'Webhook URL must use https:// or http:// protocol.',
      };
    }
    if (!parsed.hostname) {
      return { valid: false, error: 'Webhook URL must include a valid hostname.' };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, error: 'Webhook URL is malformed.' };
  }
}

export function loadWebhookConfig(): WebhookConfig {
  if (typeof window === 'undefined') return DEFAULT_WEBHOOK_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEBHOOK_CONFIG;
    const parsed = JSON.parse(raw);
    const rawScore = Number(parsed?.notifyMinQualityScore);
    const clampedScore = Number.isFinite(rawScore)
      ? Math.min(95, Math.max(50, rawScore))
      : DEFAULT_WEBHOOK_CONFIG.notifyMinQualityScore;
    return {
      url: typeof parsed?.url === 'string' ? parsed.url.trim() : DEFAULT_WEBHOOK_CONFIG.url,
      enabled: Boolean(parsed?.enabled),
      notifyMinQualityScore: clampedScore,
      notifyOnBullish: parsed?.notifyOnBullish !== undefined ? Boolean(parsed.notifyOnBullish) : true,
      notifyOnBearish: parsed?.notifyOnBearish !== undefined ? Boolean(parsed.notifyOnBearish) : true,
    };
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
  setup: DivergenceSetup,
  options: { timeoutMs?: number } = {}
): Promise<{ success: boolean; error?: string }> {
  const urlCheck = validateWebhookUrl(webhookUrl);
  if (!urlCheck.valid || !urlCheck.normalizedUrl) {
    return { success: false, error: urlCheck.error || 'Invalid Webhook URL.' };
  }

  const timeoutMs = Math.max(10, options.timeoutMs ?? 10_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlCheck.normalizedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        alert: 'TRULLÀS MACD ALERT',
        timestamp: new Date().toISOString(),
        setup,
      }),
    });

    if (response.ok) {
      return { success: true };
    }
    return {
      success: false,
      error: `Webhook server returned ${response.status}: ${response.statusText}`,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: `Webhook request timed out after ${timeoutMs}ms.`,
      };
    }
    return {
      success: false,
      error: err?.message || 'Network error connecting to webhook.',
    };
  } finally {
    clearTimeout(timer);
  }
}
