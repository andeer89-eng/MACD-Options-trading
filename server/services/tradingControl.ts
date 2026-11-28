export type BotOrderBlockReason = 'KILL_SWITCH' | 'NOT_ARMED';

export interface BotExecutionGateConfig {
  enabled: boolean;
  killSwitchEnabled: boolean;
}

/**
 * Server-side fail-closed gate for autonomous order submissions.
 * Risk-reducing position closes and order cancellations use separate endpoints
 * and intentionally remain available while new bot orders are blocked.
 */
export function getBotOrderBlockReason(
  config: BotExecutionGateConfig,
): BotOrderBlockReason | null {
  if (config.killSwitchEnabled) return 'KILL_SWITCH';
  if (!config.enabled) return 'NOT_ARMED';
  return null;
}

export type BotOptionCapabilityViolation = 'UNSUPPORTED_OPTION_STRATEGY' | null;

/**
 * Initial automated options capability: cash-secured short puts only.
 * Existing position closes are routed through the separate close-position
 * endpoint; this gate therefore rejects all option order shapes except sell-to-open puts.
 */
export function getBotOptionCapabilityViolation(input: {
  symbol: string;
  side: string;
}): BotOptionCapabilityViolation {
  const symbol = String(input.symbol || '').toUpperCase();
  const isOccOption = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol);
  if (!isOccOption) return null;
  const isShortPutEntry = input.side === 'sell' && /P\d{8}$/.test(symbol);
  return isShortPutEntry ? null : 'UNSUPPORTED_OPTION_STRATEGY';
}
