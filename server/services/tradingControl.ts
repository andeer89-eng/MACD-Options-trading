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
