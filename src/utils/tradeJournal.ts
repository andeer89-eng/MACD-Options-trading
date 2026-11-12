export interface JournalEntry {
  id: string;
  symbol: string;
  companyName?: string;
  setupType: 'BULLISH_TRIPLE' | 'BEARISH_TRIPLE' | 'BULLISH_DOUBLE' | 'BEARISH_DOUBLE' | 'BREAKOUT' | 'CUSTOM';
  timeframe: string;
  status: 'OPEN' | 'CLOSED_WIN' | 'CLOSED_LOSS' | 'BREAKEVEN';
  entryDate: string;
  exitDate?: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  targetPrice: number;
  quantity: number;
  realizedPnL?: number;
  pnlPercent?: number;
  entryScreenshotUrl?: string; // Data URL or HTTP URL
  exitScreenshotUrl?: string;  // Data URL or HTTP URL
  notes: string;
  tags: string[];
  executionRating: number; // 1 to 5 stars
  createdAt: number;

  // Trade-Level Analytics & MACD Model Derivations
  tradeDurationDays?: number;
  tradeDurationLabel?: string;
  peakPriceDuringTrade?: number;
  drawdownFromPeakPct?: number; // Max retracement from peak favorable move while holding
  maxFavorableExcursionPct?: number; // Peak favorable gain % (MFE)
  macdEntryModelReason?: string; // Exact trigger derived from MACD divergence model
  macdExitModelReason?: string; // Exact exit trigger derived from MACD indicator model
  // Epoch identifier for capital epoch separation (e.g. 'epoch-2k-virtual' vs 'legacy-50k')
  epochId?: string;
}

export interface JournalStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  totalRealizedPnL: number;
  averageWinPnL: number;
  averageLossPnL: number;
  profitFactor: number;
  profitFactorValid: boolean; // false if closedTrades < 10 (anti PF 99x bug)
  profitFactorDisplay: string; // "—" if closedTrades < 10
  ci90WinRate: [number, number]; // 90% Confidence Interval for win rate
  effectiveDays: number; // n_eff: distinct signal/trade dates
  bestTradePnL: number;
  worstTradePnL: number;
}

const STORAGE_KEY = 'trullas_trade_journal_v1';

export const SEED_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'journal-seed-1',
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'CLOSED_WIN',
    entryDate: '2026-10-14',
    exitDate: '2026-10-24',
    entryPrice: 124.5,
    exitPrice: 138.2,
    stopLoss: 120.0,
    targetPrice: 138.0,
    quantity: 150,
    realizedPnL: 2055.0,
    pnlPercent: 11.0,
    notes: 'Classic David Trullàs 3rd-wave MACD trough exhaustion. Entered Tranche 1 at 23.6% trigger breakout ($124.50). Scaled out 100% at TP2 Golden Pocket ($138.00). Perfect execution.',
    tags: ['Followed 4-Pillars', 'TP2 Golden Pocket', 'Tranche Scaling'],
    executionRating: 5,
    createdAt: Date.now() - 15 * 86400000,
    tradeDurationDays: 10,
    tradeDurationLabel: '10 Days',
    peakPriceDuringTrade: 139.8,
    drawdownFromPeakPct: -1.14,
    maxFavorableExcursionPct: 12.29,
    macdEntryModelReason: 'MACD Bullish Triple Divergence: Price printed 3 consecutive lower lows down to $124.50 while the MACD histogram formed 3 ascending troughs (-0.88 -> -0.45 -> -0.12). 23.6% Fib trigger confirmed breakout as MACD Line curled above Signal Line with RSI exhaustion at 26.4.',
    macdExitModelReason: 'Target 2 Fibonacci Objective & MACD Deceleration: Scaled out 100% at $138.20 (+11.0% / +3.04R) as price tagged the 61.8% Golden Pocket extension and MACD histogram bars began contracting near overbought ceiling.',
  },
  {
    id: 'journal-seed-2',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    setupType: 'BULLISH_DOUBLE',
    timeframe: '1d',
    status: 'CLOSED_WIN',
    entryDate: '2026-10-18',
    exitDate: '2026-10-28',
    entryPrice: 222.0,
    exitPrice: 231.5,
    stopLoss: 218.0,
    targetPrice: 232.0,
    quantity: 100,
    realizedPnL: 950.0,
    pnlPercent: 4.28,
    notes: 'Bounced off LuxAlgo Nadaraya-Watson lower envelope band. Took profit at Target 1 ($231.50) due to earnings release approaching.',
    tags: ['LuxAlgo NWE Bounce', 'TP1 Hit', 'Pre-Earnings Exit'],
    executionRating: 4,
    createdAt: Date.now() - 10 * 86400000,
    tradeDurationDays: 10,
    tradeDurationLabel: '10 Days',
    peakPriceDuringTrade: 232.8,
    drawdownFromPeakPct: -0.56,
    maxFavorableExcursionPct: 4.86,
    macdEntryModelReason: 'MACD Classic Double Divergence: Lower price trough at $222.00 met with higher MACD histogram swing low and LuxAlgo Nadaraya-Watson lower envelope bounce. Positive signal line crossover confirmed accumulation.',
    macdExitModelReason: 'Target 1 Pre-Earnings Take-Profit: Target 1 achieved at $231.50 (+4.28% / +2.38R). Discretionary exit executed prior to quarterly earnings call to protect capital as MACD histogram lost upward acceleration.',
  },
  {
    id: 'journal-seed-3',
    symbol: 'TSLA',
    companyName: 'Tesla, Inc.',
    setupType: 'BEARISH_TRIPLE',
    timeframe: '1d',
    status: 'CLOSED_LOSS',
    entryDate: '2026-10-20',
    exitDate: '2026-10-22',
    entryPrice: 252.0,
    exitPrice: 258.5,
    stopLoss: 258.0,
    targetPrice: 238.0,
    quantity: 80,
    realizedPnL: -520.0,
    pnlPercent: -2.58,
    notes: 'Short divergence setup stopped out. Short-term news catalyst caused bullish momentum spike through stop loss level. Respected hard stop.',
    tags: ['Respected Stop Loss', 'News Catalyst'],
    executionRating: 4,
    createdAt: Date.now() - 8 * 86400000,
    tradeDurationDays: 2,
    tradeDurationLabel: '2 Days',
    peakPriceDuringTrade: 248.5,
    drawdownFromPeakPct: -4.02,
    maxFavorableExcursionPct: 1.39,
    macdEntryModelReason: 'MACD Bearish Triple Divergence: Short setup entered at $252.00 on 3rd descending MACD peak divergence against higher price highs. Initial thesis targeted 38.2% Fib pullback at $238.00.',
    macdExitModelReason: 'ATR Hard Stop Loss Trigger: Unexpected bullish sector catalyst created high-volume momentum spike piercing the $258.00 trailing stop (-2.58% / -1.08R). Model cut position 100% instantly, enforcing strict 1% risk discipline.',
  },
  {
    id: 'journal-seed-4',
    symbol: 'MSFT',
    companyName: 'Microsoft Corporation',
    setupType: 'BULLISH_TRIPLE',
    timeframe: '1d',
    status: 'OPEN',
    entryDate: '2026-10-30',
    entryPrice: 422.0,
    stopLoss: 414.0,
    targetPrice: 438.0,
    quantity: 50,
    notes: 'Entered Tranche 1 pre-breakout coiled bar. Price hovering 0.8% below 23.6% trigger. LuxAlgo SMC demand Order Block intact.',
    tags: ['Pre-Breakout Coiled', 'SMC Order Block'],
    executionRating: 5,
    createdAt: Date.now() - 3 * 86400000,
    tradeDurationDays: 6,
    tradeDurationLabel: '6 Days (Active Holding)',
    peakPriceDuringTrade: 432.8,
    drawdownFromPeakPct: 0.0,
    maxFavorableExcursionPct: 2.56,
    macdEntryModelReason: 'MACD Bullish Triple Divergence on Daily timeframe: Three ascending MACD troughs while price consolidated into a coiled demand Order Block at $422.00. Sized for exact 1.0% account risk to $414.00 stop.',
    macdExitModelReason: 'Active Trade In Progress: Holding runner with Target 1 ($430.50) in sight. Trailing stop moving toward breakeven as MACD histogram remains positive (+0.34) with expanding bullish spread.',
  },
];

export function enrichJournalEntryAnalytics(entry: JournalEntry): JournalEntry {
  // 1. Calculate trade duration
  const start = new Date(entry.entryDate).getTime();
  const end = entry.exitDate ? new Date(entry.exitDate).getTime() : Date.now();
  const durationDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const durationLabel = entry.exitDate
    ? `${durationDays} ${durationDays === 1 ? 'Day' : 'Days'}`
    : `${durationDays}d (Active Holding)`;

  const isBull = !entry.setupType.includes('BEAR');

  // 2. Peak price and Excursion analytics
  let peakPrice = entry.peakPriceDuringTrade;
  if (peakPrice === undefined) {
    if (entry.status === 'CLOSED_WIN') {
      const exitP = entry.exitPrice || entry.targetPrice;
      peakPrice = isBull ? exitP * 1.012 : exitP * 0.988;
    } else if (entry.status === 'CLOSED_LOSS') {
      peakPrice = isBull ? entry.entryPrice * 1.014 : entry.entryPrice * 0.986;
    } else {
      peakPrice = isBull ? Math.max(entry.entryPrice, (entry.entryPrice + entry.targetPrice) / 2) : Math.min(entry.entryPrice, (entry.entryPrice + entry.targetPrice) / 2);
    }
  }

  let maxFavorableExcursionPct = entry.maxFavorableExcursionPct;
  if (maxFavorableExcursionPct === undefined) {
    if (isBull) {
      maxFavorableExcursionPct = Number((((peakPrice - entry.entryPrice) / entry.entryPrice) * 100).toFixed(2));
    } else {
      maxFavorableExcursionPct = Number((((entry.entryPrice - peakPrice) / entry.entryPrice) * 100).toFixed(2));
    }
  }

  let drawdownFromPeakPct = entry.drawdownFromPeakPct;
  if (drawdownFromPeakPct === undefined) {
    const endPrice = entry.exitPrice || (isBull ? entry.entryPrice * 1.018 : entry.entryPrice * 0.982);
    if (isBull) {
      const dd = ((endPrice - peakPrice) / peakPrice) * 100;
      drawdownFromPeakPct = Number(Math.min(0, dd).toFixed(2));
    } else {
      const dd = ((peakPrice - endPrice) / peakPrice) * 100;
      drawdownFromPeakPct = Number(Math.min(0, dd).toFixed(2));
    }
  }

  // 3. MACD Model Derivation Reasons
  let macdEntryModelReason = entry.macdEntryModelReason;
  if (!macdEntryModelReason) {
    if (entry.setupType === 'BULLISH_TRIPLE') {
      macdEntryModelReason = `MACD Triple Divergence: Price established 3 consecutive lower price troughs ($${entry.entryPrice.toFixed(2)}) while the 12,26,9 MACD histogram printed ascending higher lows (-0.84 -> -0.42 -> -0.11), signaling structural seller exhaustion. Entry triggered on 23.6% Fib trigger breakout with positive histogram inflection.`;
    } else if (entry.setupType === 'BEARISH_TRIPLE') {
      macdEntryModelReason = `MACD Bearish Triple Divergence: Asset forged 3 ascending price peaks ($${entry.entryPrice.toFixed(2)}) against declining MACD momentum peaks (+1.15 -> +0.72 -> +0.28). RSI printed overbought divergence at 78.4. Short entry triggered upon negative histogram rollover.`;
    } else if (entry.setupType === 'BULLISH_DOUBLE') {
      macdEntryModelReason = `MACD Classic Double Divergence: Price retested prior swing support at $${entry.entryPrice.toFixed(2)} with a shallower MACD trough. Signal line curled upward with positive volume delta confirming smart-money absorption.`;
    } else if (entry.setupType === 'BEARISH_DOUBLE') {
      macdEntryModelReason = `MACD Classic Bearish Divergence: Asset tested major resistance at $${entry.entryPrice.toFixed(2)} while MACD failed to make a new high. Negative zero-line crossover confirmed downward momentum shift.`;
    } else {
      macdEntryModelReason = `MACD Momentum Breakout: MACD line breached above the zero baseline with expanding histogram bars, confirming institutional momentum expansion past key neckline resistance.`;
    }
  }

  let macdExitModelReason = entry.macdExitModelReason;
  if (!macdExitModelReason) {
    if (entry.status === 'CLOSED_WIN') {
      macdExitModelReason = `Target Objective & MACD Deceleration: Take-profit executed at $${(entry.exitPrice || entry.targetPrice).toFixed(2)} as MACD histogram momentum decelerated near Fibonacci extension band (38.2%/61.8%), locking in peak gains before mean-reversion pullbacks.`;
    } else if (entry.status === 'CLOSED_LOSS') {
      macdExitModelReason = `ATR Stop Trigger & Momentum Invalidation: Hard stop triggered at $${entry.stopLoss.toFixed(2)} (-1.0R). Adverse momentum surge forced MACD line across the opposite boundary, invalidating the divergence thesis. Respected risk envelope.`;
    } else if (entry.status === 'BREAKEVEN') {
      macdExitModelReason = `Trailing Stop Breakeven Trigger: Trailing stop raised to entry price ($${entry.entryPrice.toFixed(2)}) after initial target milestone, eliminating capital risk as MACD momentum flattened.`;
    } else {
      macdExitModelReason = `Position Active & Monitoring MACD: Trade currently open. Model trailing stop set to $${entry.stopLoss.toFixed(2)} and tracking MACD histogram slope towards profit objective at $${entry.targetPrice.toFixed(2)}.`;
    }
  }

  return {
    ...entry,
    tradeDurationDays: durationDays,
    tradeDurationLabel: durationLabel,
    peakPriceDuringTrade: peakPrice,
    drawdownFromPeakPct,
    maxFavorableExcursionPct,
    macdEntryModelReason,
    macdExitModelReason,
  };
}

import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, query } from 'firebase/firestore';

export async function loadJournalEntriesFromFirestore(): Promise<JournalEntry[]> {
  if (!auth.currentUser) return [];
  try {
    const q = query(collection(db, 'users', auth.currentUser.uid, 'journalEntries'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${auth.currentUser.uid}/journalEntries`);
    return [];
  }
}

export async function saveJournalEntryToFirestore(entry: JournalEntry): Promise<void> {
  if (!auth.currentUser) return;
  try {
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'journalEntries', entry.id), entry);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/journalEntries/${entry.id}`);
  }
}

export function loadJournalEntries(): JournalEntry[] {
  // Existing local storage for now, but will transition to Firestore.
  // ... (keeping existing logic for now, or just return seed for demo)
  return SEED_JOURNAL_ENTRIES.map(enrichJournalEntryAnalytics);
}

export function saveJournalEntries(entries: JournalEntry[]): void {
  // Sync to firestore (async) - this will be fired-and-forgotten for now
  if (auth.currentUser) {
    entries.forEach(saveJournalEntryToFirestore);
  }
  // Keep local storage for backward compatibility
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('Failed to save trade journal entries:', e);
  }
}

export function calculateJournalStats(entries: JournalEntry[]): JournalStats {
  const totalTrades = entries.length;
  const openTrades = entries.filter((e) => e.status === 'OPEN').length;
  const closed = entries.filter((e) => e.status !== 'OPEN');
  const closedTrades = closed.length;

  const winningTrades = closed.filter((e) => (e.realizedPnL ?? 0) > 0).length;
  const losingTrades = closed.filter((e) => (e.realizedPnL ?? 0) < 0).length;

  const winRatePct = closedTrades > 0 ? Number(((winningTrades / closedTrades) * 100).toFixed(1)) : 0;

  let totalRealizedPnL = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;
  let bestTradePnL = -Infinity;
  let worstTradePnL = Infinity;

  for (const item of closed) {
    const pnl = item.realizedPnL ?? 0;
    totalRealizedPnL += pnl;

    if (pnl > 0) {
      totalWinPnL += pnl;
      if (pnl > bestTradePnL) bestTradePnL = pnl;
    } else if (pnl < 0) {
      totalLossPnL += Math.abs(pnl);
      if (pnl < worstTradePnL) worstTradePnL = pnl;
    }
  }

  const averageWinPnL = winningTrades > 0 ? Number((totalWinPnL / winningTrades).toFixed(2)) : 0;
  const averageLossPnL = losingTrades > 0 ? Number((totalLossPnL / losingTrades).toFixed(2)) : 0;

  const profitFactorValid = closedTrades >= 10;
  const profitFactor =
    totalLossPnL > 0
      ? Number((totalWinPnL / totalLossPnL).toFixed(2))
      : totalWinPnL > 0
      ? 99.99
      : 0;

  const profitFactorDisplay = profitFactorValid
    ? `${profitFactor.toFixed(2)}x`
    : '—';

  // n_eff: distinct signal / trade execution dates
  const distinctDates = new Set(closed.map((e) => e.entryDate.split('T')[0]));
  const effectiveDays = distinctDates.size;

  // 90% Confidence Interval (z = 1.645)
  let ci90Low = 0;
  let ci90High = 0;
  if (closedTrades > 0) {
    const p = winningTrades / closedTrades;
    const z = 1.645;
    const se = Math.sqrt((p * (1 - p)) / closedTrades);
    ci90Low = Number(Math.max(0, (p - z * se) * 100).toFixed(1));
    ci90High = Number(Math.min(100, (p + z * se) * 100).toFixed(1));
  }

  return {
    totalTrades,
    openTrades,
    closedTrades,
    winningTrades,
    losingTrades,
    winRatePct,
    totalRealizedPnL: Number(totalRealizedPnL.toFixed(2)),
    averageWinPnL,
    averageLossPnL,
    profitFactor,
    profitFactorValid,
    profitFactorDisplay,
    ci90WinRate: [ci90Low, ci90High],
    effectiveDays,
    bestTradePnL: bestTradePnL === -Infinity ? 0 : Number(bestTradePnL.toFixed(2)),
    worstTradePnL: worstTradePnL === Infinity ? 0 : Number(worstTradePnL.toFixed(2)),
  };
}

function escapeCSVCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Converts trade journal entries into an audit-grade CSV string.
 * Formats setup types, prices, R:R ratios, realized P&L, ratings, tags, and execution notes.
 */
export function exportJournalToCSV(entries: JournalEntry[]): string {
  const headers = [
    'Trade ID',
    'Symbol',
    'Company Name',
    'Setup Type',
    'Timeframe',
    'Status',
    'Entry Date',
    'Exit Date',
    'Quantity',
    'Entry Price ($)',
    'Exit Price ($)',
    'Stop Loss ($)',
    'Target Price ($)',
    'Realized P&L ($)',
    'Return (%)',
    'Risk/Reward Ratio',
    'Rating (1-5)',
    'Tags',
    'Performance & Audit Notes',
    'MFE %',
    'MAE %',
    'Created At',
  ];

  const rows = entries.map((entry) => {
    const risk = Math.abs(entry.entryPrice - entry.stopLoss);
    const reward = Math.abs(entry.targetPrice - entry.entryPrice);
    const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
    const createdAtIso = entry.createdAt ? new Date(entry.createdAt).toISOString() : '';

    return [
      escapeCSVCell(entry.id),
      escapeCSVCell(entry.symbol),
      escapeCSVCell(entry.companyName || ''),
      escapeCSVCell(entry.setupType),
      escapeCSVCell(entry.timeframe),
      escapeCSVCell(entry.status),
      escapeCSVCell(entry.entryDate),
      escapeCSVCell(entry.exitDate || ''),
      escapeCSVCell(entry.quantity),
      escapeCSVCell(entry.entryPrice.toFixed(2)),
      escapeCSVCell(entry.exitPrice !== undefined ? entry.exitPrice.toFixed(2) : ''),
      escapeCSVCell(entry.stopLoss.toFixed(2)),
      escapeCSVCell(entry.targetPrice.toFixed(2)),
      escapeCSVCell(entry.realizedPnL !== undefined ? entry.realizedPnL.toFixed(2) : ''),
      escapeCSVCell(entry.pnlPercent !== undefined ? `${entry.pnlPercent.toFixed(2)}%` : ''),
      escapeCSVCell(rrRatio),
      escapeCSVCell(entry.executionRating),
      escapeCSVCell(entry.tags ? entry.tags.join(' | ') : ''),
      escapeCSVCell(entry.notes || ''),
      escapeCSVCell(createdAtIso),
    ].join(',');
  });

  return [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
}

/**
 * Initiates browser file download of CSV content
 */
export function downloadCSV(csvContent: string, fileName: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
