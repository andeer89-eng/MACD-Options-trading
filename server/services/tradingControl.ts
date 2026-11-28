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

export interface PersistentTradingControlState {
  ownerId: string;
  stockBotEnabled: boolean;
  optionBotEnabled: boolean;
  killSwitchEnabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PersistentTradingControlUpdate {
  stockBotEnabled: boolean;
  optionBotEnabled: boolean;
  killSwitchEnabled: boolean;
  expectedVersion: number;
}

export function createDefaultTradingControlState(ownerId: string, timestamp: string): PersistentTradingControlState {
  return {
    ownerId,
    stockBotEnabled: false,
    optionBotEnabled: false,
    killSwitchEnabled: false,
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: ownerId,
  };
}

export function normalizeTradingControlState(
  ownerId: string,
  stored: Record<string, unknown>,
  fallbackTimestamp: string,
): PersistentTradingControlState {
  return {
    ownerId,
    stockBotEnabled: stored.killSwitchEnabled !== true && stored.stockBotEnabled === true,
    optionBotEnabled: stored.killSwitchEnabled !== true && stored.optionBotEnabled === true,
    killSwitchEnabled: stored.killSwitchEnabled === true,
    version: Math.max(0, Math.floor(Number(stored.version) || 0)),
    createdAt: String(stored.createdAt || fallbackTimestamp),
    updatedAt: String(stored.updatedAt || fallbackTimestamp),
    updatedBy: String(stored.updatedBy || ownerId),
  };
}

export function applyTradingControlUpdate(
  current: PersistentTradingControlState,
  update: PersistentTradingControlUpdate,
  timestamp: string,
): PersistentTradingControlState {
  if (!Number.isInteger(update.expectedVersion) || update.expectedVersion < 0 ||
      typeof update.stockBotEnabled !== 'boolean' ||
      typeof update.optionBotEnabled !== 'boolean' ||
      typeof update.killSwitchEnabled !== 'boolean') {
    throw new Error('Invalid trading control update.');
  }
  if (current.version !== update.expectedVersion) {
    throw new Error('Trading control state changed concurrently. Reload and retry.');
  }
  return {
    ...current,
    stockBotEnabled: update.killSwitchEnabled ? false : update.stockBotEnabled,
    optionBotEnabled: update.killSwitchEnabled ? false : update.optionBotEnabled,
    killSwitchEnabled: update.killSwitchEnabled,
    version: current.version + 1,
    updatedAt: timestamp,
    updatedBy: current.ownerId,
  };
}
