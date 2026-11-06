import { isMarketHoliday, isEarlyClosing } from './marketCalendar';

export type MarketSession = 'OPEN' | 'CLOSED' | 'PRE_MARKET' | 'AFTER_HOURS' | 'HOLIDAY';

export function getMarketSessionStatus(): MarketSession {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;

  if (isMarketHoliday(dateStr)) return 'HOLIDAY';
  if (day === 0 || day === 6) return 'CLOSED';

  // Early closing: 9:30 AM to 1:00 PM (570 to 780 minutes)
  const marketClose = isEarlyClosing(dateStr) ? 780 : 960;

  if (time >= 570 && time < marketClose) return 'OPEN';
  if (time >= 240 && time < 570) return 'PRE_MARKET';
  if (time >= marketClose && time < 1200) return 'AFTER_HOURS';

  return 'CLOSED';
}


export function isTradingAllowed(session: MarketSession): boolean {
  return session === 'OPEN';
}
