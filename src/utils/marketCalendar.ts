/**
 * Market Calendar Utility
 * Tracks NYSE holidays and trading exceptions.
 */

export interface MarketHoliday {
  date: string;
  name: string;
}

// Simplified NYSE holiday list for 2026
export const NYSE_HOLIDAYS_2026: MarketHoliday[] = [
  { date: '2026-01-01', name: 'New Years Day' },
  { date: '2026-01-19', name: 'Martin Luther King, Jr. Day' },
  { date: '2026-02-16', name: 'Washington\'s Birthday' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-25', name: 'Memorial Day' },
  { date: '2026-06-19', name: 'Juneteenth' },
  { date: '2026-07-03', name: 'Independence Day (Observed)' },
  { date: '2026-09-07', name: 'Labor Day' },
  { date: '2026-11-26', name: 'Thanksgiving Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

export function isMarketHoliday(dateStr: string): boolean {
  return NYSE_HOLIDAYS_2026.some((h) => h.date === dateStr);
}

export function isEarlyClosing(dateStr: string): boolean {
  // Common early closing days (e.g., day after Thanksgiving, July 3rd)
  return ['2026-11-27', '2026-07-02'].includes(dateStr);
}
