/**
 * Market Calendar Utility
 * Tracks NYSE holidays and trading exceptions.
 */

export interface MarketHoliday {
  date: string;
  name: string;
}

function formatYmd(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function nthWeekdayOfMonth(year: number, month1: number, weekday: number, nth: number): string {
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return formatYmd(year, month1, day);
}

function lastWeekdayOfMonth(year: number, month1: number, weekday: number): string {
  const daysInMonth = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(year, month1 - 1, daysInMonth)).getUTCDay();
  const offset = (lastDow - weekday + 7) % 7;
  return formatYmd(year, month1, daysInMonth - offset);
}

function observedFixedHoliday(year: number, month1: number, day: number): string {
  const dt = new Date(Date.UTC(year, month1 - 1, day));
  const dow = dt.getUTCDay();
  if (dow === 6) {
    // Saturday holiday is observed on Friday
    dt.setUTCDate(dt.getUTCDate() - 1);
  } else if (dow === 0) {
    // Sunday holiday is observed on Monday
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function goodFridayDate(year: number): string {
  // Anonymous Gregorian Easter algorithm (Meeus/Jones/Butcher)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterUtc = new Date(Date.UTC(year, month - 1, day));
  easterUtc.setUTCDate(easterUtc.getUTCDate() - 2);
  return formatYmd(easterUtc.getUTCFullYear(), easterUtc.getUTCMonth() + 1, easterUtc.getUTCDate());
}

export function getNyseHolidaysForYear(year: number): MarketHoliday[] {
  return [
    { date: observedFixedHoliday(year, 1, 1), name: 'New Years Day' },
    { date: nthWeekdayOfMonth(year, 1, 1, 3), name: 'Martin Luther King, Jr. Day' },
    { date: nthWeekdayOfMonth(year, 2, 1, 3), name: "Washington's Birthday" },
    { date: goodFridayDate(year), name: 'Good Friday' },
    { date: lastWeekdayOfMonth(year, 5, 1), name: 'Memorial Day' },
    { date: observedFixedHoliday(year, 6, 19), name: 'Juneteenth' },
    { date: observedFixedHoliday(year, 7, 4), name: 'Independence Day' },
    { date: nthWeekdayOfMonth(year, 9, 1, 1), name: 'Labor Day' },
    { date: nthWeekdayOfMonth(year, 11, 4, 4), name: 'Thanksgiving Day' },
    { date: observedFixedHoliday(year, 12, 25), name: 'Christmas Day' },
  ];
}

// Preserved backward-compatible export for 2026 consumers
export const NYSE_HOLIDAYS_2026: MarketHoliday[] = getNyseHolidaysForYear(2026);

export function isMarketHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isInteger(year) || dateStr.length < 10) return false;
  return getNyseHolidaysForYear(year).some((h) => h.date === dateStr);
}

export function isEarlyClosing(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isInteger(year) || dateStr.length < 10) return false;
  if (isMarketHoliday(dateStr)) return false;

  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;

  // Day after Thanksgiving (4th Thursday of Nov + 1 day)
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  const thxDay = Number(thanksgiving.slice(8, 10));
  if (dateStr === formatYmd(year, 11, thxDay + 1)) return true;

  // July 3rd when it is a trading weekday (and July 4th is not Friday)
  if (m === 7 && d === 3 && dow >= 1 && dow <= 4) return true;

  // Christmas Eve when it falls on a weekday
  if (m === 12 && d === 24 && dow >= 1 && dow <= 4) return true;

  return false;
}
