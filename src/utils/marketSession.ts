import { isMarketHoliday, isEarlyClosing } from './marketCalendar';

export type MarketSession = 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS' | 'HOLIDAY';

export type MarketRegimeType = 'PREMARKET' | 'REGULAR' | 'AFTERHOURS' | '24/7' | 'CLOSED';

export interface SessionRegimeInfo {
  regime: MarketRegimeType;
  isOpen: boolean;
  canExecuteAutonomous: boolean;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  easternTimeFormatted: string;
  description: string;
}

/**
 * Formats time in Europe/Bucharest timezone (HH:MM:SS)
 */
export function getBucharestTimeFormatted(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bucharest',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch (err) {
    return date.toTimeString().slice(0, 8);
  }
}

/**
 * Formats full Date and Time in Europe/Bucharest timezone (YYYY-MM-DD HH:MM:SS)
 */
export function getBucharestDateTimeFormatted(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    let year = '', month = '', day = '', hour = '', minute = '', second = '';
    for (const p of parts) {
      if (p.type === 'year') year = p.value;
      if (p.type === 'month') month = p.value;
      if (p.type === 'day') day = p.value;
      if (p.type === 'hour') hour = p.value;
      if (p.type === 'minute') minute = p.value;
      if (p.type === 'second') second = p.value;
    }
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  } catch (err) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }
}

/**
 * Accurately extracts US Eastern Time parts (New York timezone) regardless of client/server local timezone.
 */
export function getEasternTimeParts(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  hours: number;
  minutes: number;
  seconds: number;
  dateStr: string; // YYYY-MM-DD
  timeMinutes: number; // minutes from midnight ET (0 - 1439)
  timeFormatted: string; // e.g. "09:35 AM ET"
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  let year = 2026, month = 1, day = 1, hours = 0, minutes = 0, seconds = 0, weekdayStr = 'Sun';

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    else if (part.type === 'month') month = parseInt(part.value, 10);
    else if (part.type === 'day') day = parseInt(part.value, 10);
    else if (part.type === 'hour') hours = parseInt(part.value, 10);
    else if (part.type === 'minute') minutes = parseInt(part.value, 10);
    else if (part.type === 'second') seconds = parseInt(part.value, 10);
    else if (part.type === 'weekday') weekdayStr = part.value;
  }

  const daysMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = daysMap[weekdayStr] ?? 0;
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeMinutes = hours * 60 + minutes;

  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const timeFormatted = `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm} ET`;

  return { year, month, day, dayOfWeek, hours, minutes, seconds, dateStr, timeMinutes, timeFormatted };
}

/**
 * Checks if a symbol is a 24/7 crypto asset
 */
export function isCryptoTicker(symbol?: string): boolean {
  if (!symbol) return false;
  const upper = symbol.toUpperCase();
  return (
    upper.includes('-USD') ||
    upper === 'BTC' ||
    upper === 'ETH' ||
    upper === 'SOL' ||
    upper === 'BNB' ||
    upper === 'XRP' ||
    upper === 'DOGE' ||
    upper === 'CRYPTO'
  );
}

/**
 * Checks if a symbol is a CME Globex index future (e.g. S&P 500 ES/MES) which trades nearly 24/5
 */
export function isFuturesTicker(symbol?: string): boolean {
  if (!symbol) return false;
  const upper = symbol.toUpperCase();
  return (
    upper === 'ES' ||
    upper === 'MES' ||
    upper === '/ES' ||
    upper === '/MES' ||
    upper.startsWith('ES ') ||
    upper.startsWith('MES ') ||
    upper === 'NQ' ||
    upper === 'MNQ'
  );
}

/**
 * Comprehensive Market Session & Regime Evaluator
 * Identifies the exact institutional market regime (REGULAR, PREMARKET, AFTERHOURS, 24/7, or CLOSED)
 * based on true US Eastern Time and specific asset class mechanics.
 */
export function getTradeExecutionRegime(symbol?: string, date: Date = new Date()): SessionRegimeInfo {
  const et = getEasternTimeParts(date);
  const { dayOfWeek, timeMinutes, dateStr, timeFormatted } = et;

  // 1. Crypto: 24/7/365 uninterrupted trading
  if (isCryptoTicker(symbol)) {
    return {
      regime: '24/7',
      isOpen: true,
      canExecuteAutonomous: true,
      label: '24/7 CRYPTO',
      badgeBg: 'bg-cyan-500/20',
      badgeText: 'text-cyan-300',
      badgeBorder: 'border-cyan-500/40',
      easternTimeFormatted: timeFormatted,
      description: 'Continuous 24/7 cryptocurrency market execution.',
    };
  }

  // 2. CME Globex Index Futures (ES / MES):
  // Trades Sunday 6:00 PM ET to Friday 5:00 PM ET with daily 5:00 PM - 6:00 PM ET halt.
  if (isFuturesTicker(symbol)) {
    // Saturday: completely closed
    if (dayOfWeek === 6) {
      return {
        regime: 'CLOSED',
        isOpen: false,
        canExecuteAutonomous: false,
        label: 'CLOSED (WEEKEND)',
        badgeBg: 'bg-zinc-800',
        badgeText: 'text-zinc-400',
        badgeBorder: 'border-zinc-700',
        easternTimeFormatted: timeFormatted,
        description: 'CME Globex futures closed for the weekend (re-opens Sunday 6:00 PM ET).',
      };
    }

    // Sunday: closed before 6:00 PM ET (1080 minutes)
    if (dayOfWeek === 0 && timeMinutes < 1080) {
      return {
        regime: 'CLOSED',
        isOpen: false,
        canExecuteAutonomous: false,
        label: 'CLOSED (WEEKEND)',
        badgeBg: 'bg-zinc-800',
        badgeText: 'text-zinc-400',
        badgeBorder: 'border-zinc-700',
        easternTimeFormatted: timeFormatted,
        description: 'CME Globex futures opens Sunday at 6:00 PM ET.',
      };
    }

    // Friday: closes at 5:00 PM ET (1020 minutes)
    if (dayOfWeek === 5 && timeMinutes >= 1020) {
      return {
        regime: 'CLOSED',
        isOpen: false,
        canExecuteAutonomous: false,
        label: 'CLOSED (WEEKEND)',
        badgeBg: 'bg-zinc-800',
        badgeText: 'text-zinc-400',
        badgeBorder: 'border-zinc-700',
        easternTimeFormatted: timeFormatted,
        description: 'CME Globex futures closed for weekend after 5:00 PM ET Friday.',
      };
    }

    // Daily maintenance halt: 5:00 PM - 6:00 PM ET (1020 to 1080 minutes) Monday-Thursday
    if (dayOfWeek >= 1 && dayOfWeek <= 4 && timeMinutes >= 1020 && timeMinutes < 1080) {
      return {
        regime: 'CLOSED',
        isOpen: false,
        canExecuteAutonomous: false,
        label: 'DAILY CME HALT',
        badgeBg: 'bg-amber-500/20',
        badgeText: 'text-amber-400',
        badgeBorder: 'border-amber-500/40',
        easternTimeFormatted: timeFormatted,
        description: 'CME Globex daily maintenance settlement halt (5:00 PM - 6:00 PM ET).',
      };
    }

    // Regular RTH hours: 9:30 AM - 4:00 PM ET (570 to 960 minutes) Monday-Friday
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && timeMinutes >= 570 && timeMinutes < 960) {
      return {
        regime: 'REGULAR',
        isOpen: true,
        canExecuteAutonomous: true,
        label: 'REGULAR (RTH)',
        badgeBg: 'bg-emerald-500/20',
        badgeText: 'text-emerald-300',
        badgeBorder: 'border-emerald-500/40',
        easternTimeFormatted: timeFormatted,
        description: 'Active US Regular Trading Hours (09:30 - 16:00 ET). Highest liquidity & tightest spreads.',
      };
    }

    // Globex Extended Overnight / Globex 24/5
    return {
      regime: '24/7',
      isOpen: true,
      canExecuteAutonomous: true,
      label: '24/5 GLOBEX',
      badgeBg: 'bg-indigo-500/20',
      badgeText: 'text-indigo-300',
      badgeBorder: 'border-indigo-500/40',
      easternTimeFormatted: timeFormatted,
      description: 'CME Globex overnight & extended futures session. Theta decay active.',
    };
  }

  // 3. US Equities and Standard Equity Options (SPY, AAPL, NVDA, etc.):
  // Holidays & Weekends
  if (isMarketHoliday(dateStr)) {
    return {
      regime: 'CLOSED',
      isOpen: false,
      canExecuteAutonomous: false,
      label: 'HOLIDAY',
      badgeBg: 'bg-zinc-800',
      badgeText: 'text-zinc-400',
      badgeBorder: 'border-zinc-700',
      easternTimeFormatted: timeFormatted,
      description: 'US Equities markets closed for official NYSE Holiday.',
    };
  }

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      regime: 'CLOSED',
      isOpen: false,
      canExecuteAutonomous: false,
      label: 'WEEKEND',
      badgeBg: 'bg-zinc-800',
      badgeText: 'text-zinc-400',
      badgeBorder: 'border-zinc-700',
      easternTimeFormatted: timeFormatted,
      description: 'US Equities markets closed on weekends.',
    };
  }

  // Early closing: 9:30 AM to 1:00 PM ET (570 to 780 minutes)
  const regularCloseMinute = isEarlyClosing(dateStr) ? 780 : 960;

  // Premarket: 4:00 AM - 9:30 AM ET (240 to 570 minutes)
  if (timeMinutes >= 240 && timeMinutes < 570) {
    return {
      regime: 'PREMARKET',
      isOpen: true,
      canExecuteAutonomous: true,
      label: 'PREMARKET',
      badgeBg: 'bg-amber-500/20',
      badgeText: 'text-amber-300',
      badgeBorder: 'border-amber-500/40',
      easternTimeFormatted: timeFormatted,
      description: 'US Premarket session (04:00 - 09:30 ET). Early institutional positioning.',
    };
  }

  // Regular Market: 9:30 AM - 4:00 PM ET (570 to regularCloseMinute)
  if (timeMinutes >= 570 && timeMinutes < regularCloseMinute) {
    return {
      regime: 'REGULAR',
      isOpen: true,
      canExecuteAutonomous: true,
      label: 'REGULAR',
      badgeBg: 'bg-emerald-500/20',
      badgeText: 'text-emerald-300',
      badgeBorder: 'border-emerald-500/40',
      easternTimeFormatted: timeFormatted,
      description: 'US Regular Market Hours (09:30 - 16:00 ET). Peak liquidity and divergence confirmation.',
    };
  }

  // Afterhours: 4:00 PM - 8:00 PM ET (regularCloseMinute to 1200 minutes)
  if (timeMinutes >= regularCloseMinute && timeMinutes < 1200) {
    return {
      regime: 'AFTERHOURS',
      isOpen: true,
      canExecuteAutonomous: true,
      label: 'AFTERHOURS',
      badgeBg: 'bg-purple-500/20',
      badgeText: 'text-purple-300',
      badgeBorder: 'border-purple-500/40',
      easternTimeFormatted: timeFormatted,
      description: 'US After-Hours session (16:00 - 20:00 ET). Post-market earnings and rebalancing.',
    };
  }

  // Overnight / Closed (20:00 - 04:00 ET)
  return {
    regime: 'CLOSED',
    isOpen: false,
    canExecuteAutonomous: false,
    label: 'CLOSED',
    badgeBg: 'bg-zinc-800',
    badgeText: 'text-zinc-400',
    badgeBorder: 'border-zinc-700',
    easternTimeFormatted: timeFormatted,
    description: 'US Equities markets closed overnight (re-opens Premarket at 04:00 ET).',
  };
}

/**
 * Backward-compatible helper for legacy components, now powered by Eastern Time.
 */
export function getMarketSessionStatus(): MarketSession {
  const regime = getTradeExecutionRegime();
  if (regime.regime === 'REGULAR') return 'OPEN';
  if (regime.regime === 'PREMARKET') return 'PRE_MARKET';
  if (regime.regime === 'AFTERHOURS') return 'AFTER_HOURS';
  if (regime.label === 'HOLIDAY') return 'HOLIDAY';
  return 'CLOSED';
}

/**
 * Checks if trading execution is permitted based on regime and user settings.
 */
export function isTradingAllowed(
  symbol?: string,
  allowExtendedHours: boolean = true
): boolean {
  const regimeInfo = getTradeExecutionRegime(symbol);
  if (!regimeInfo.isOpen) return false;
  if (!allowExtendedHours && regimeInfo.regime !== 'REGULAR') return false;
  return true;
}
