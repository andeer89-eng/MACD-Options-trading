import type { JournalEntry } from './tradeJournal.ts';
import type { AutomatedPosition, AutomatedTradeLog } from './automatedPortfolio.ts';
import { evaluateCboeOptionsConfluence } from './automatedPortfolio.ts';
import type { OptionsPosition, OptionsTradeLog, OptionsTradeRecord } from './optionsAutomatedPortfolio.ts';
import { getTradeExecutionRegime } from './marketSession.ts';
import { canTrade, calculateLevels, MasterPlanSettings, DataQuality } from './masterPlanCore.ts';
import { SP500_UNIVERSE } from '../data/sp500Universe.ts';
import { lookupGlobalCompany } from '../data/globalTickers.ts';
import type { MarketHealthReport } from './marketHealthEngine.ts';
import type { MarketStructuralSummary } from './marketStructuralContext.ts';
import {
  BotQueuedCandidate,
  mergeQueuedCandidatesWithMarketItems,
} from './botCandidateQueue.ts';
import type { ReversalCloseRequest } from './deterministicOrderPipeline.ts';
import {
  backfillEntryMarketContextFromHistory,
  buildEntryMarketContextFromReport,
  lookupEntryMarketContextSnapshot,
  type EntryMarketContext,
} from './entryMarketContext.ts';
import { queryMemoryForSetup, type ActiveMemoryState } from './activeLearningEngine.ts';

export interface AlpacaAccountDTO {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: number;
  buying_power: number;
  options_buying_power: number;
  options_approved_level: number;
  equity: number;
  last_equity: number;
  day_pnl: number;
  day_pnl_pct: number;
  pattern_day_trader: boolean;
}

export interface AlpacaPositionDTO {
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: number;
  side: 'long' | 'short';
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  change_today: number;
}

export interface AlpacaOrderDTO {
  id: string;
  client_order_id?: string;
  symbol: string;
  asset_class: string;
  side: 'buy' | 'sell';
  qty: number;
  filled_qty: number;
  filled_avg_price: number | null;
  type: string;
  time_in_force: string;
  limit_price: number | null;
  stop_price: number | null;
  status: string;
  submitted_at: string;
  filled_at: string | null;
}

export interface AlpacaFillDTO {
  id: string;
  order_id: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  transaction_time: string;
}

export interface AlpacaOverviewDTO {
  configured: boolean;
  mode: 'PAPER';
  paperEndpoint: string;
  paperViolation?: boolean;
  message: string;
  fetchedAt: string;
  account: AlpacaAccountDTO | null;
  positions: AlpacaPositionDTO[];
  equityPositions: AlpacaPositionDTO[];
  optionPositions: AlpacaPositionDTO[];
  orders: AlpacaOrderDTO[];
  fills: AlpacaFillDTO[];
  error?: string;
}

export interface ParsedOccOption {
  isOption: boolean;
  underlying: string;
  expiration: string;
  expirationLabel: string;
  optionType: 'PUT' | 'CALL';
  strike: number;
  formattedContract: string;
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function parseOccOptionSymbol(rawSymbol: string): ParsedOccOption {
  const sym = rawSymbol.trim().toUpperCase();
  const match = sym.match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) {
    return {
      isOption: false,
      underlying: sym,
      expiration: '',
      expirationLabel: '',
      optionType: 'PUT',
      strike: 0,
      formattedContract: sym,
    };
  }
  const [, underlying, yy, mm, dd, cp, strikeRaw] = match;
  const year = 2000 + parseInt(yy, 10);
  const monthIdx = Math.max(0, Math.min(11, parseInt(mm, 10) - 1));
  const day = parseInt(dd, 10);
  const strike = Number((parseInt(strikeRaw, 10) / 1000).toFixed(2));
  const optionType: 'PUT' | 'CALL' = cp === 'C' ? 'CALL' : 'PUT';
  const expiration = `${year}-${mm}-${dd}`;
  const expirationLabel = `${dd} ${MONTH_NAMES[monthIdx]} ${year}`;
  const strikeLabel = Number.isInteger(strike) ? String(strike) : strike.toFixed(2);
  const formattedContract = `${underlying} ${dd}${MONTH_NAMES[monthIdx]}${yy} ${strikeLabel} ${optionType === 'PUT' ? 'P' : 'C'}`;

  return {
    isOption: true,
    underlying,
    expiration,
    expirationLabel,
    optionType,
    strike,
    formattedContract: day ? formattedContract : sym,
  };
}

function sanitizeSyncId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

interface LotState {
  id: string;
  openOrderId: string;
  closeOrderId?: string;
  symbol: string;
  isOption: boolean;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice?: number;
  entryTs: string;
  exitTs?: string;
  closed: boolean;
}

function pairAlpacaOrdersFifo(orders: AlpacaOrderDTO[]): LotState[] {
  const filledOrders = orders
    .filter((o) => o.filled_qty > 0 && o.filled_avg_price !== null && o.filled_avg_price > 0)
    .sort((a, b) => {
      const ta = new Date(a.filled_at || a.submitted_at).getTime();
      const tb = new Date(b.filled_at || b.submitted_at).getTime();
      return ta - tb;
    });

  const openQueues = new Map<string, LotState[]>();
  const completedLots: LotState[] = [];

  for (const ord of filledOrders) {
    const sym = ord.symbol.toUpperCase();
    const isOption = ord.asset_class === 'us_option' || parseOccOptionSymbol(sym).isOption;
    const execPrice = Number(ord.filled_avg_price);
    let remainingQty = Math.abs(ord.filled_qty);
    const ts = ord.filled_at || ord.submitted_at || new Date().toISOString();
    const incomingDirection: 'LONG' | 'SHORT' = ord.side === 'buy' ? 'LONG' : 'SHORT';

    const queue = openQueues.get(sym) || [];

    // Consume opposite-side open lots FIFO
    while (remainingQty > 0 && queue.length > 0 && queue[0].side !== incomingDirection) {
      const head = queue[0];
      const matchedQty = Math.min(remainingQty, head.qty);
      completedLots.push({
        id: `alpaca_lot_${sanitizeSyncId(head.openOrderId)}_${sanitizeSyncId(ord.id)}`,
        openOrderId: head.openOrderId,
        closeOrderId: ord.id,
        symbol: sym,
        isOption,
        side: head.side,
        qty: matchedQty,
        entryPrice: head.entryPrice,
        exitPrice: execPrice,
        entryTs: head.entryTs,
        exitTs: ts,
        closed: true,
      });

      remainingQty = Number((remainingQty - matchedQty).toFixed(6));
      head.qty = Number((head.qty - matchedQty).toFixed(6));
      if (head.qty <= 0.00001) {
        queue.shift();
      }
    }

    if (remainingQty > 0.00001) {
      queue.push({
        id: `alpaca_lot_${sanitizeSyncId(ord.id)}`,
        openOrderId: ord.id,
        symbol: sym,
        isOption,
        side: incomingDirection,
        qty: remainingQty,
        entryPrice: execPrice,
        entryTs: ts,
        closed: false,
      });
    }

    openQueues.set(sym, queue);
  }

  const stillOpen: LotState[] = [];
  for (const queue of openQueues.values()) {
    for (const lot of queue) {
      stillOpen.push(lot);
    }
  }

  return [...completedLots, ...stillOpen];
}

export interface JournalSyncResult {
  entries: JournalEntry[];
  addedCount: number;
  updatedCount: number;
  totalAlpacaEntries: number;
}

export function mapAlpacaOrdersToJournalEntries(
  orders: AlpacaOrderDTO[],
  positions: AlpacaPositionDTO[],
  existingEntries: JournalEntry[],
  marketHealth?: MarketHealthReport | null
): JournalSyncResult {
  const lots = pairAlpacaOrdersFifo(orders);
  const existingById = new Map<string, JournalEntry>();
  const existingByOpenOrderTag = new Map<string, JournalEntry>();

  for (const e of existingEntries) {
    existingById.set(e.id, e);
    for (const tag of e.tags || []) {
      if (tag.startsWith('alpaca-order:')) {
        existingByOpenOrderTag.set(tag.slice('alpaca-order:'.length), e);
      }
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  const nextById = new Map<string, JournalEntry>(existingEntries.map((e) => [e.id, e]));
  const openLotIds = new Set(lots.filter((l) => !l.closed).map((l) => l.id));
  const assignedLotIds = new Set<string>();
  const openPositionSymbols = new Set(positions.map((p) => p.symbol.toUpperCase()));

  for (const lot of lots) {
    const parsedOpt = parseOccOptionSymbol(lot.symbol);
    const multiplier = lot.isOption ? 100 : 1;
    const posMatch = positions.find((p) => p.symbol.toUpperCase() === lot.symbol);

    const isLong = lot.side === 'LONG';
    let status: JournalEntry['status'] = 'OPEN';
    let realizedPnL: number | undefined;
    let pnlPercent: number | undefined;

    if (lot.closed && lot.exitPrice !== undefined) {
      const rawPnl = isLong
        ? (lot.exitPrice - lot.entryPrice) * lot.qty * multiplier
        : (lot.entryPrice - lot.exitPrice) * lot.qty * multiplier;
      realizedPnL = Number(rawPnl.toFixed(2));
      const costDenominator = Math.max(0.01, lot.entryPrice * lot.qty * multiplier);
      pnlPercent = Number(((rawPnl / costDenominator) * 100).toFixed(2));
      status = Math.abs(realizedPnL) < 0.5 ? 'BREAKEVEN' : realizedPnL > 0 ? 'CLOSED_WIN' : 'CLOSED_LOSS';
    } else if (!lot.closed && !posMatch) {
      // Remove any leftover phantom OPEN lot if Alpaca no longer holds this symbol
      const baseOpenId = `alpaca_lot_${sanitizeSyncId(lot.openOrderId)}`;
      if (nextById.has(baseOpenId) && nextById.get(baseOpenId)?.status === 'OPEN') {
        nextById.delete(baseOpenId);
        updatedCount++;
      }
      continue;
    }

    const entryDate = lot.entryTs.slice(0, 10);
    const exitDate = lot.exitTs ? lot.exitTs.slice(0, 10) : undefined;
    const baseOpenId = `alpaca_lot_${sanitizeSyncId(lot.openOrderId)}`;
    const canUpgradeBaseOpen =
      lot.closed && !openLotIds.has(baseOpenId) && !assignedLotIds.has(baseOpenId) && existingById.has(baseOpenId);
    const matchedByTag = existingByOpenOrderTag.get(lot.openOrderId);
    const matchedOpen =
      existingById.get(lot.id) ||
      (canUpgradeBaseOpen ? existingById.get(baseOpenId) : undefined) ||
      (matchedByTag && !assignedLotIds.has(matchedByTag.id) && (!lot.closed || !openLotIds.has(matchedByTag.id))
        ? matchedByTag
        : undefined);

    const targetId = canUpgradeBaseOpen ? baseOpenId : matchedOpen?.id || lot.id;
    assignedLotIds.add(targetId);

    const tags = Array.from(
      new Set([
        ...(matchedOpen?.tags || []),
        'Alpaca Paper',
        lot.isOption ? 'Alpaca Options' : 'Alpaca Equity',
        `alpaca-order:${lot.openOrderId}`,
        ...(lot.closeOrderId ? [`alpaca-close:${lot.closeOrderId}`] : []),
      ])
    );

    const defaultNote = lot.isOption
      ? `Alpaca Paper ${lot.side} option ${parsedOpt.formattedContract} (${lot.qty} contract${lot.qty === 1 ? '' : 's'}) @ $${lot.entryPrice.toFixed(2)}${lot.exitPrice !== undefined ? ` -> closed @ $${lot.exitPrice.toFixed(2)}` : ''}.`
      : `Alpaca Paper ${lot.side} ${lot.qty} sh ${lot.symbol} @ $${lot.entryPrice.toFixed(2)}${lot.exitPrice !== undefined ? ` -> closed @ $${lot.exitPrice.toFixed(2)}` : ''}.`;

    const stopEstimate = isLong
      ? Number((lot.entryPrice * 0.96).toFixed(2))
      : Number((lot.entryPrice * 1.04).toFixed(2));
    const targetEstimate = isLong
      ? Number((lot.entryPrice * 1.08).toFixed(2))
      : Number((lot.entryPrice * 0.92).toFixed(2));

    const resolvedStop = matchedOpen?.stopLoss ?? stopEstimate;
    const riskPerUnit = Math.abs(lot.entryPrice - resolvedStop);
    const initialRiskDollars =
      riskPerUnit > 0 ? Number((riskPerUnit * lot.qty * multiplier).toFixed(2)) : null;

    const entryMarketContext: EntryMarketContext | null =
      matchedOpen?.entryMarketContext ||
      lookupEntryMarketContextSnapshot({
        orderId: lot.openOrderId,
        symbol: lot.symbol,
        entryDate,
      }) ||
      (marketHealth
        ? backfillEntryMarketContextFromHistory(entryDate, marketHealth, {
            initialRiskDollars,
            assetMode: lot.isOption ? 'OPTIONS' : 'EQUITY',
          })
        : null);

    const nextEntry: JournalEntry = {
      id: targetId,
      symbol: lot.symbol.slice(0, 20),
      companyName: matchedOpen?.companyName || (lot.isOption ? `${parsedOpt.underlying} Option` : lot.symbol),
      setupType: matchedOpen?.setupType || (isLong ? 'BULLISH_TRIPLE' : 'BEARISH_TRIPLE'),
      timeframe: matchedOpen?.timeframe || '1d',
      status,
      entryDate,
      exitDate,
      entryPrice: Number(lot.entryPrice.toFixed(2)),
      exitPrice: lot.exitPrice !== undefined ? Number(lot.exitPrice.toFixed(2)) : undefined,
      stopLoss: resolvedStop,
      targetPrice: matchedOpen?.targetPrice ?? targetEstimate,
      quantity: lot.qty,
      realizedPnL,
      pnlPercent,
      entryScreenshotUrl: matchedOpen?.entryScreenshotUrl,
      exitScreenshotUrl: matchedOpen?.exitScreenshotUrl,
      notes: matchedOpen?.notes || defaultNote,
      tags,
      executionRating: matchedOpen?.executionRating ?? (status === 'CLOSED_WIN' ? 5 : 4),
      epochId: 'alpaca-paper',
      createdAt: matchedOpen?.createdAt || new Date(lot.entryTs).getTime() || Date.now(),
      entryMarketContext,
    };

    const prev = nextById.get(targetId);
    if (!prev) {
      addedCount++;
      nextById.set(targetId, nextEntry);
    } else if (
      prev.status !== nextEntry.status ||
      prev.quantity !== nextEntry.quantity ||
      prev.entryPrice !== nextEntry.entryPrice ||
      prev.entryDate !== nextEntry.entryDate ||
      prev.exitPrice !== nextEntry.exitPrice ||
      prev.realizedPnL !== nextEntry.realizedPnL ||
      prev.tags.length !== nextEntry.tags.length ||
      (!prev.entryMarketContext && Boolean(nextEntry.entryMarketContext))
    ) {
      updatedCount++;
      nextById.set(targetId, nextEntry);
    }
  }

  // Reconcile any stale fallback alpaca_pos_* entries that are either closed or superseded by order lots
  for (const [id, entry] of Array.from(nextById.entries())) {
    if (id.startsWith('alpaca_pos_') && entry.status === 'OPEN') {
      const sym = entry.symbol.toUpperCase();
      const hasOrderOpen = Array.from(nextById.values()).some(
        (other) => other.id !== id && other.symbol.toUpperCase() === sym && other.status === 'OPEN' && other.tags.includes('Alpaca Paper')
      );
      if (!openPositionSymbols.has(sym) || hasOrderOpen) {
        nextById.delete(id);
        updatedCount++;
      }
    }
  }

  // Also ensure any live Alpaca position whose opening order fell outside orders pagination window is tracked as OPEN
  for (const pos of positions) {
    const sym = pos.symbol.toUpperCase();
    const alreadyOpenTracked = Array.from(nextById.values()).some(
      (e) => e.symbol === sym && e.status === 'OPEN' && e.tags.includes('Alpaca Paper') && !e.id.startsWith('alpaca_pos_')
    );
    if (alreadyOpenTracked) continue;

    const fallbackId = `alpaca_pos_${sanitizeSyncId(pos.asset_id || sym)}`;
    const prev = nextById.get(fallbackId);
    const isOpt = pos.asset_class === 'us_option' || parseOccOptionSymbol(sym).isOption;
    const isLong = pos.side === 'long';
    const nextPosEntry: JournalEntry = {
      id: fallbackId,
      symbol: sym.slice(0, 20),
      companyName: isOpt ? `${parseOccOptionSymbol(sym).underlying} Option` : sym,
      setupType: isLong ? 'BULLISH_TRIPLE' : 'BEARISH_TRIPLE',
      timeframe: '1d',
      status: 'OPEN',
      entryDate: prev?.entryDate || new Date().toISOString().slice(0, 10),
      entryPrice: Number(pos.avg_entry_price.toFixed(2)),
      stopLoss: prev?.stopLoss ?? Number((pos.avg_entry_price * (isLong ? 0.96 : 1.04)).toFixed(2)),
      targetPrice: prev?.targetPrice ?? Number((pos.avg_entry_price * (isLong ? 1.08 : 0.92)).toFixed(2)),
      quantity: Math.abs(pos.qty),
      notes: prev?.notes || `Live Alpaca Paper position (${pos.side.toUpperCase()} ${Math.abs(pos.qty)} @ $${pos.avg_entry_price.toFixed(2)}).`,
      tags: Array.from(new Set([...(prev?.tags || []), 'Alpaca Paper', isOpt ? 'Alpaca Options' : 'Alpaca Equity'])),
      executionRating: prev?.executionRating ?? 4,
      epochId: 'alpaca-paper',
      createdAt: prev?.createdAt || Date.now(),
    };
    if (!prev) {
      addedCount++;
      nextById.set(fallbackId, nextPosEntry);
    } else if (prev.quantity !== nextPosEntry.quantity || prev.entryPrice !== nextPosEntry.entryPrice) {
      updatedCount++;
      nextById.set(fallbackId, nextPosEntry);
    }
  }

  const entries = Array.from(nextById.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const totalAlpacaEntries = entries.filter((e) => e.tags.includes('Alpaca Paper')).length;
  return { entries, addedCount, updatedCount, totalAlpacaEntries };
}

export function alpacaPositionsToAutomatedPositions(
  equityPositions: AlpacaPositionDTO[],
  orders: AlpacaOrderDTO[],
  scannerResults: any[] = []
): AutomatedPosition[] {
  const now = new Date();
  return equityPositions.map((pos) => {
    const scanMatch = scannerResults.find((r) => r.symbol === pos.symbol);
    const matchingOrder = orders.find(
      (o) => o.symbol === pos.symbol && o.filled_qty > 0 && o.asset_class !== 'us_option'
    );
    const atr = Number(scanMatch?.atr) > 0 ? Number(scanMatch.atr) : Number((pos.current_price * 0.02).toFixed(2));
    const atrPct = pos.current_price > 0 ? Number(((atr / pos.current_price) * 100).toFixed(2)) : 2.0;
    const isBull = pos.side === 'long';
    const entryPrice = pos.avg_entry_price || pos.current_price;
    const stopDist = 1.5 * atr;
    const stopLoss = isBull ? Math.max(0.01, Number((entryPrice - stopDist).toFixed(2))) : Number((entryPrice + stopDist).toFixed(2));
    const target1 = isBull ? Number((entryPrice + stopDist * 1.5).toFixed(2)) : Number((entryPrice - stopDist * 1.5).toFixed(2));
    const target2 = isBull ? Number((entryPrice + stopDist * 2.8).toFixed(2)) : Number((entryPrice - stopDist * 2.8).toFixed(2));
    const entryDate = matchingOrder?.filled_at ? matchingOrder.filled_at.slice(0, 10) : now.toISOString().slice(0, 10);
    const absQty = Math.abs(pos.qty);

    return {
      id: `alpaca-eq-${pos.asset_id || pos.symbol}`,
      symbol: pos.symbol,
      companyName: scanMatch?.companyName || pos.symbol,
      sector: scanMatch?.sector || 'US Equities',
      direction: isBull ? 'BULLISH' : 'BEARISH',
      setupType: scanMatch?.setups?.[0]?.type?.replace(/_/g, ' ') || 'ALPACA PAPER EQUITY',
      entryDate,
      entryPrice: Number(entryPrice.toFixed(2)),
      currentPrice: Number(pos.current_price.toFixed(2)),
      initialShares: absQty,
      currentShares: absQty,
      stopLoss,
      trailingStop: stopLoss,
      target1,
      target2,
      target1Hit: isBull ? pos.current_price >= target1 : pos.current_price <= target1,
      target2Hit: isBull ? pos.current_price >= target2 : pos.current_price <= target2,
      atr: Number(atr.toFixed(2)),
      atrPercent: atrPct,
      qualityScore: Number(scanMatch?.setups?.[0]?.qualityScore || 80),
      unrealizedPnL: Number(pos.unrealized_pl.toFixed(2)),
      unrealizedPnLPercent: Number(pos.unrealized_plpc.toFixed(2)),
      trancheStage: 1,
      reasonOpened: `Live Alpaca Paper position (${pos.side.toUpperCase()} ${absQty} shares @ avg $${entryPrice.toFixed(2)}, Order ${matchingOrder?.id?.slice(0, 8) || 'API'}).`,
      cboeConfluence: evaluateCboeOptionsConfluence(pos.symbol, pos.current_price, isBull ? 'BULLISH' : 'BEARISH'),
      executionSession: getTradeExecutionRegime(pos.symbol, now).regime,
    };
  });
}

export function alpacaOrdersToAutomatedLogs(orders: AlpacaOrderDTO[]): AutomatedTradeLog[] {
  return orders
    .filter((o) => o.asset_class !== 'us_option' && !parseOccOptionSymbol(o.symbol).isOption)
    .map((o) => {
      const price = o.filled_avg_price ?? o.limit_price ?? 0;
      const qty = o.filled_qty > 0 ? o.filled_qty : o.qty;
      const ts = (o.filled_at || o.submitted_at || new Date().toISOString()).replace('T', ' ').slice(0, 16);
      return {
        id: `alpaca-log-${o.id}`,
        timestamp: ts,
        positionId: o.id,
        symbol: o.symbol,
        action: o.side === 'buy' ? 'OPEN' : 'FULL_EXIT',
        shares: qty,
        price: Number(price.toFixed(2)),
        reason: `Alpaca Paper ${o.side.toUpperCase()} ${qty} ${o.symbol} (${o.type.toUpperCase()} / ${o.status.toUpperCase()}) [${o.id}]`,
      };
    });
}

export function alpacaPositionsToOptionsPositions(
  optionPositions: AlpacaPositionDTO[],
  orders: AlpacaOrderDTO[],
  profitTakePercent = 75
): OptionsPosition[] {
  const nowMs = Date.now();
  return optionPositions.map((pos) => {
    const parsed = parseOccOptionSymbol(pos.symbol);
    const matchingOrder = orders.find((o) => o.symbol === pos.symbol && o.filled_qty > 0);
    const expMs = parsed.expiration ? new Date(`${parsed.expiration}T20:00:00Z`).getTime() : nowMs + 7 * 86_400_000;
    const dte = Math.max(0, Math.ceil((expMs - nowMs) / 86_400_000));
    const contracts = Math.max(1, Math.abs(pos.qty));
    const entryPrem = Number(pos.avg_entry_price.toFixed(2));
    const currentPrem = Number(pos.current_price.toFixed(2));
    const isShort = pos.side === 'short' || pos.qty < 0;
    const totalPrem = Number((entryPrem * contracts * 100).toFixed(2));

    return {
      id: `alpaca-opt-${pos.asset_id || pos.symbol}`,
      ticker: parsed.underlying,
      contract: pos.symbol,
      boughtSold: isShort ? 'Sold' : 'Bought',
      optionType: parsed.optionType,
      strike: parsed.strike,
      entryDate: matchingOrder?.filled_at ? matchingOrder.filled_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      expirationDateStr: parsed.expiration,
      expirationLabel: parsed.expirationLabel || parsed.expiration,
      dteDaysRemaining: dte,
      contractsCount: contracts,
      entryPremiumPerContract: entryPrem,
      currentPremiumPerContract: currentPrem,
      totalPremiumCollected: totalPrem,
      underlyingPriceAtEntry: parsed.strike,
      underlyingCurrentPrice: parsed.strike,
      strikeDistancePercent: 0,
      delta: isShort ? -0.12 : 0.12,
      gamma: 0.002,
      dailyTheta: Number((Math.abs(totalPrem) / Math.max(1, dte)).toFixed(2)),
      vega: 0,
      ivRankPercent: 20,
      unrealizedPnL: Number(pos.unrealized_pl.toFixed(2)),
      unrealizedPnLPercent: Number(pos.unrealized_plpc.toFixed(2)),
      profitTargetPercent: profitTakePercent,
      status: 'Open',
      tradingWarzPattern: 'TradingWarz Golden Zone',
      goldenZoneSupportLevel: parsed.strike,
      setupGrade: 'A+',
      whyOpenedThesis: `Live Alpaca Paper ${isShort ? 'Short' : 'Long'} ${parsed.formattedContract} (${contracts} contract${contracts === 1 ? '' : 's'}) filled @ $${entryPrem.toFixed(2)}.`,
      executionSession: 'REGULAR',
    };
  });
}

export function alpacaOrdersToOptionsHistory(orders: AlpacaOrderDTO[]): OptionsTradeRecord[] {
  const optionOrders = orders.filter(
    (o) => o.asset_class === 'us_option' || parseOccOptionSymbol(o.symbol).isOption
  );
  const lots = pairAlpacaOrdersFifo(optionOrders).filter((l) => l.closed && l.exitPrice !== undefined);

  return lots
    .map((lot) => {
      const parsed = parseOccOptionSymbol(lot.symbol);
      const isShort = lot.side === 'SHORT';
      const pnl = isShort
        ? (lot.entryPrice - (lot.exitPrice ?? lot.entryPrice)) * lot.qty * 100
        : ((lot.exitPrice ?? lot.entryPrice) - lot.entryPrice) * lot.qty * 100;
      const denom = Math.max(0.01, lot.entryPrice * lot.qty * 100);
      const pnlPct = Number(((pnl / denom) * 100).toFixed(1));
      const outcomeReason: OptionsTradeRecord['outcomeReason'] =
        Math.abs(pnl) < 1 ? 'Break Even' : pnlPct >= 95 ? 'Expired Worthless' : 'Early Take-Profit';

      return {
        id: lot.id,
        date: (lot.exitTs || lot.entryTs).slice(0, 10),
        ticker: parsed.underlying,
        boughtSold: isShort ? ('Sold' as const) : ('Bought' as const),
        contract: lot.symbol,
        strike: parsed.strike,
        optionType: parsed.optionType,
        expiration: parsed.expirationLabel || parsed.expiration,
        expirationDateStr: parsed.expiration,
        profitDollars: Number(pnl.toFixed(2)),
        profitPercent: pnlPct,
        status: 'Closed' as const,
        outcomeReason,
        underlyingPriceAtEntry: parsed.strike,
        strikeDistancePercent: 0,
        delta: 0.12,
        thetaPerDay: Number((Math.abs(pnl) / 7).toFixed(2)),
        tradingWarzPattern: 'GOLDEN_ZONE_BOUNCE' as const,
        goldenZoneSupportLevel: parsed.strike,
        whyOpenedThesis: `Alpaca Paper closed ${parsed.formattedContract}: entry $${lot.entryPrice.toFixed(2)} -> exit $${lot.exitPrice?.toFixed(2)} (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}).`,
        session: 'REGULAR' as const,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function alpacaOrdersToOptionsSessionLogs(orders: AlpacaOrderDTO[]): OptionsTradeLog[] {
  return orders
    .filter((o) => o.asset_class === 'us_option' || parseOccOptionSymbol(o.symbol).isOption)
    .map((o) => {
      const price = o.filled_avg_price ?? o.limit_price ?? 0;
      const qty = o.filled_qty > 0 ? o.filled_qty : o.qty;
      return {
        id: `alpaca-opt-log-${o.id}`,
        timestamp: (o.filled_at || o.submitted_at || new Date().toISOString()).replace('T', ' ').slice(0, 16),
        positionId: o.id,
        contract: o.symbol,
        action: o.side === 'sell' ? 'SELL_TO_OPEN' : 'BUY_TO_CLOSE',
        contracts: qty,
        premium: Number(price.toFixed(2)),
        reason: `Alpaca Paper ${o.side.toUpperCase()} ${qty}x ${o.symbol} (${o.type.toUpperCase()} / ${o.status.toUpperCase()})`,
      };
    });
}

export interface AlpacaEquityOrderCandidate {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit';
  time_in_force: 'day';
  client_order_id: string;
  sector: string;
  setupType: string;
  qualityScore: number;
  stopLoss: number;
  targetPrice: number;
  rationale: string;
  initialRiskDollars?: number;
  regimeMultiplier?: number;
  entryMarketContext?: EntryMarketContext | null;
}

export interface AlpacaRiskGateSkip {
  symbol: string;
  sector: string;
  reasons: string[];
  setupType?: string;
  signalPrice?: number;
}

export function resolveEquitySector(symbol: string, explicitSector?: string): string {
  if (explicitSector && explicitSector.trim() && explicitSector !== 'US Equities' && explicitSector !== 'Equities') {
    return explicitSector.trim();
  }
  const sym = symbol.trim().toUpperCase();
  const sp = SP500_UNIVERSE.find((c) => c.symbol.toUpperCase() === sym);
  if (sp?.sector) return sp.sector;
  const global = lookupGlobalCompany(sym);
  if (global?.sector) return global.sector;
  return explicitSector?.trim() || 'US Equities';
}

export function buildIdempotentClientOrderId(params: {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  asOfIso?: string;
  prefix?: string;
}): string {
  const datePart = (params.asOfIso || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
  const cleanSym = params.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18);
  const tag = params.prefix || 'trullas';
  return `${tag}_${cleanSym}_${params.side}_${params.qty}_${datePart}`.slice(0, 48);
}

export function selectAlpacaEquityCandidates(
  overview: AlpacaOverviewDTO,
  marketItems: Array<{
    symbol: string;
    sector?: string;
    currentPrice: number;
    atr?: number;
    atrPercent?: number;
    dataQuality?: DataQuality;
    fetchedAtMs?: number;
    stale?: boolean;
    structuralContext?: MarketStructuralSummary | null;
    setups?: any[];
  }>,
  settings: MasterPlanSettings,
  maxOpenPositions: number,
  options?: {
    nowMs?: number;
    maxQuoteAgeMs?: number;
    marketHealth?: MarketHealthReport | null;
    queuedCandidates?: BotQueuedCandidate[];
    activeMemory?: ActiveMemoryState | null;
  }
): {
  ordersToPlace: AlpacaEquityOrderCandidate[];
  positionsToClose: Array<{ symbol: string; percentage: number; reason: string; isReversal?: boolean }>;
  reversalRequests: ReversalCloseRequest[];
  skippedByRiskGates: AlpacaRiskGateSkip[];
  marketHealthBlocked?: boolean;
  marketHealthSummary?: string;
} {
  const ordersToPlace: AlpacaEquityOrderCandidate[] = [];
  const positionsToClose: Array<{ symbol: string; percentage: number; reason: string; isReversal?: boolean }> = [];
  const reversalRequests: ReversalCloseRequest[] = [];
  const skippedByRiskGates: AlpacaRiskGateSkip[] = [];

  if (!overview.configured || !overview.account) {
    return { ordersToPlace, positionsToClose, reversalRequests, skippedByRiskGates };
  }

  const effectiveMarketItems =
    options?.queuedCandidates && options.queuedCandidates.length > 0
      ? mergeQueuedCandidatesWithMarketItems(options.queuedCandidates, marketItems)
      : marketItems;

  const activeQueuedBySymbol = new Map<string, BotQueuedCandidate>();
  for (const qc of options?.queuedCandidates || []) {
    if (qc.status === 'QUEUED') {
      activeQueuedBySymbol.set(qc.symbol.toUpperCase(), qc);
    }
  }

  // Evaluate open Alpaca equity positions against ATR stop / T2 target exits + queued opposite reversals
  const heldPositions = alpacaPositionsToAutomatedPositions(overview.equityPositions, overview.orders, effectiveMarketItems);
  for (const pos of heldPositions) {
    const isBull = pos.direction === 'BULLISH';
    const hitStop = isBull ? pos.currentPrice <= pos.stopLoss : pos.currentPrice >= pos.stopLoss;
    const hitT2 = isBull ? pos.currentPrice >= pos.target2 : pos.currentPrice <= pos.target2;
    const queuedOpposite = activeQueuedBySymbol.get(pos.symbol.toUpperCase());
    const isOppositeReversal =
      queuedOpposite &&
      ((isBull && queuedOpposite.direction === 'BEARISH') ||
        (!isBull && queuedOpposite.direction === 'BULLISH'));

    if (hitStop) {
      positionsToClose.push({ symbol: pos.symbol, percentage: 100, reason: `ATR stop-loss triggered at $${pos.currentPrice.toFixed(2)}` });
    } else if (hitT2) {
      positionsToClose.push({ symbol: pos.symbol, percentage: 100, reason: `Target 2 reached at $${pos.currentPrice.toFixed(2)}` });
    } else if (isOppositeReversal && queuedOpposite) {
      const reason = `Reversal exit (${queuedOpposite.source} queued ${queuedOpposite.direction} ${queuedOpposite.setupType})`;
      positionsToClose.push({ symbol: pos.symbol, percentage: 100, reason, isReversal: true });
      reversalRequests.push({
        symbol: pos.symbol,
        targetDirection: queuedOpposite.direction,
        reason,
      });
    }
  }

  const openSymbols = new Set(overview.equityPositions.map((p) => p.symbol.toUpperCase()));
  const pendingSymbols = new Set(
    overview.orders
      .filter((o) => ['new', 'accepted', 'pending_new', 'partially_filled'].includes(o.status))
      .map((o) => o.symbol.toUpperCase())
  );
  const existingClientOrderIds = new Set(
    overview.orders
      .map((o) => o.client_order_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  let remainingSlots = Math.max(0, maxOpenPositions - overview.equityPositions.length);
  let remainingBuyingPower = overview.account.buying_power;

  const accountEquity = overview.account.equity > 0 ? overview.account.equity : settings.simCapitalUsd;
  const effectiveSettings: MasterPlanSettings = {
    ...settings,
    simCapitalUsd: accountEquity,
    dataQuality: 'live',
  };

  // Track real sector notional exposure across held positions + newly queued buys
  const sectorMapFromItems = new Map<string, string>();
  for (const item of marketItems) {
    sectorMapFromItems.set(item.symbol.toUpperCase(), resolveEquitySector(item.symbol, item.sector));
  }
  const sectorExposureDollars = new Map<string, number>();
  for (const pos of overview.equityPositions) {
    const sec = resolveEquitySector(pos.symbol, sectorMapFromItems.get(pos.symbol.toUpperCase()));
    const mv = Math.abs(pos.market_value || pos.qty * pos.current_price || 0);
    sectorExposureDollars.set(sec, (sectorExposureDollars.get(sec) || 0) + mv);
  }

  // Real daily loss % from Alpaca account day P&L
  const dailyLossPct =
    overview.account.day_pnl_pct < 0 ? Math.abs(overview.account.day_pnl_pct) : 0;

  const nowMs = options?.nowMs ?? Date.now();
  const maxQuoteAgeMs = options?.maxQuoteAgeMs ?? 45 * 60 * 1000;
  const asOfIso = new Date(nowMs).toISOString();

  const marketHealth = options?.marketHealth ?? null;
  const resolvedRegimeScore = marketHealth ? marketHealth.current.score : 70;
  const marketCrashBlocked =
    marketHealth !== null &&
    (marketHealth.current.safetyStatus === 'CRASH_DEFENSE' || !marketHealth.current.allowNewEntries);
  const marketHealthSummary = marketHealth
    ? `Health ${marketHealth.current.score}/100 (${marketHealth.current.label}), VIX ${
        marketHealth.current.vix !== null ? marketHealth.current.vix.toFixed(1) : 'N/A'
      }, 1M Net Vol ${
        marketHealth.current.netVolume1MBillions < 0
          ? `-$${Math.abs(marketHealth.current.netVolume1MBillions).toFixed(1)}B`
          : `+$${marketHealth.current.netVolume1MBillions.toFixed(1)}B`
      }`
    : undefined;

  for (const item of effectiveMarketItems) {
    if (remainingSlots <= 0 || remainingBuyingPower < 100) break;
    const sym = item.symbol.toUpperCase();
    if (sym.includes('=F') || sym.includes('-USD') || sym.includes('=X')) continue;

    const sector = resolveEquitySector(sym, item.sector);
    if (openSymbols.has(sym) || pendingSymbols.has(sym)) {
      if (activeQueuedBySymbol.has(sym)) {
        skippedByRiskGates.push({
          symbol: sym,
          sector,
          reasons: [
            openSymbols.has(sym)
              ? `Position already open in ${sym} (duplicate entry blocked)`
              : `Working order already pending in ${sym}`,
          ],
        });
      }
      continue;
    }

    const mainSetup = item.setups?.[0];
    if (!mainSetup || !item.currentPrice || item.currentPrice <= 0) continue;
    const isBull = String(mainSetup.type || '').includes('BULLISH');
    if (!isBull) {
      if (activeQueuedBySymbol.has(sym)) {
        skippedByRiskGates.push({
          symbol: sym,
          sector,
          reasons: ['Long-only equity gate: BEARISH queued signals only exit existing longs (no naked shorts)'],
        });
      }
      continue;
    }

    if (marketCrashBlocked && marketHealth) {
      skippedByRiskGates.push({
        symbol: sym,
        sector,
        setupType: String(mainSetup.type || 'BULLISH_TRIPLE'),
        signalPrice: item.currentPrice,
        reasons: [
          `Market Health Crash Defense: ${marketHealthSummary} (${marketHealth.current.reasons.join('; ')})`,
        ],
      });
      continue;
    }

    const candStructural =
      item.structuralContext ??
      (sym === 'SPY'
        ? marketHealth?.structuralContext?.spy ?? null
        : sym === 'QQQ'
          ? marketHealth?.structuralContext?.qqq ?? null
          : null);
    const broadIndexInGap =
      marketHealth?.structuralContext?.spy?.regime === 'IN_VOLUME_GAP' &&
      marketHealth?.structuralContext?.qqq?.regime === 'IN_VOLUME_GAP';

    if (
      candStructural?.regime === 'IN_VOLUME_GAP' ||
      (broadIndexInGap && candStructural?.regime !== 'AT_INSTITUTIONAL_BUY_ZONE')
    ) {
      const gapDesc = candStructural?.activeVolumeGap
        ? `$${candStructural.activeVolumeGap.low.toFixed(2)}–$${candStructural.activeVolumeGap.high.toFixed(2)} LVN air pocket`
        : 'SPY/QQQ LVN Volume Gap vacuum';
      skippedByRiskGates.push({
        symbol: sym,
        sector,
        setupType: String(mainSetup.type || 'BULLISH_TRIPLE'),
        signalPrice: item.currentPrice,
        reasons: [
          `Volume Gap Guard: ${sym} blocked inside ${gapDesc} (awaiting HVN / Institutional Buy Zone floor)`,
        ],
      });
      continue;
    }

    const setupName = String(mainSetup.type || 'BULLISH_TRIPLE');
    const setupQualityScore = Number(mainSetup.qualityScore || 75);
    const memoryEval = options?.activeMemory
      ? queryMemoryForSetup(options.activeMemory, sym, setupName, setupQualityScore, marketHealth, {
          assetMode: 'EQUITY',
          symbolStructural: candStructural,
        })
      : null;

    if (memoryEval && !memoryEval.isApproved) {
      skippedByRiskGates.push({
        symbol: sym,
        sector,
        setupType: setupName,
        signalPrice: item.currentPrice,
        reasons: [memoryEval.auditRationale],
      });
      continue;
    }

    const currentSectorDollars = sectorExposureDollars.get(sector) || 0;
    const currentSectorExposurePct =
      accountEquity > 0 ? Number(((currentSectorDollars / accountEquity) * 100).toFixed(2)) : 0;

    const isStale =
      Boolean(item.stale) ||
      item.dataQuality === 'estimated' ||
      (typeof item.fetchedAtMs === 'number' &&
        Number.isFinite(item.fetchedAtMs) &&
        nowMs - item.fetchedAtMs > maxQuoteAgeMs);
    const itemDataQuality: DataQuality = isStale ? 'cached' : item.dataQuality || 'live';

    const atr = item.atr && item.atr > 0 ? item.atr : item.currentPrice * 0.02;
    const levels = calculateLevels({
      symbol: sym,
      direction: 'long',
      currentPrice: item.currentPrice,
      atr14: atr,
      recentBars: [{ o: item.currentPrice, h: item.currentPrice + atr * 0.6, l: item.currentPrice - atr * 0.6, c: item.currentPrice }],
      dataQuality: itemDataQuality,
      asOf: asOfIso,
    });

    const gate = canTrade({
      symbol: sym,
      direction: 'long',
      sector,
      setupScore: setupQualityScore,
      levels,
      currentPrice: item.currentPrice,
      marketOpenOverride: true, // Manual cycle click evaluates live setups cleanly; scheduler enforces NYSE hours
      dailyLossPct,
      currentSectorExposurePct,
      regimeScore: resolvedRegimeScore,
      customSettings: {
        ...effectiveSettings,
        dataQuality: itemDataQuality,
      },
    });

    if (!gate.allow || gate.suggestedQty < 1) {
      if (gate.fails.length > 0) {
        skippedByRiskGates.push({
          symbol: sym,
          sector,
          setupType: setupName,
          signalPrice: item.currentPrice,
          reasons: gate.fails.map((f) => `${f.name}: ${f.detail}`),
        });
      }
      continue;
    }

    const adaptiveMult = memoryEval ? memoryEval.sizingMultiplier : 1.0;
    const marketSafetyMult =
      marketHealth &&
      marketHealth.current.sizeMultiplier > 0 &&
      marketHealth.current.sizeMultiplier < 1.0
        ? marketHealth.current.sizeMultiplier
        : 1.0;
    const effectiveMult = Number((adaptiveMult * marketSafetyMult).toFixed(4));
    const adaptedSuggestedQty =
      effectiveMult !== 1.0
        ? Math.max(1, Math.round(gate.suggestedQty * effectiveMult))
        : gate.suggestedQty;

    const maxAffordable = Math.floor(remainingBuyingPower / item.currentPrice);
    // Also keep single incremental addition from breaching sector dollar cap if cap > 0
    const maxSectorDollars = (accountEquity * effectiveSettings.maxSectorExposurePct) / 100;
    const remainingSectorDollars = Math.max(0, maxSectorDollars - currentSectorDollars);
    const maxQtyBySector =
      effectiveSettings.maxSectorExposurePct > 0
        ? Math.floor(remainingSectorDollars / item.currentPrice)
        : adaptedSuggestedQty;

    const qty = Math.min(adaptedSuggestedQty, maxAffordable, maxQtyBySector);
    if (qty < 1) {
      skippedByRiskGates.push({
        symbol: sym,
        sector,
        setupType: setupName,
        signalPrice: item.currentPrice,
        reasons: [
          maxQtyBySector < 1
            ? `Sector Exposure Within Cap: adding 1 sh of ${sym} would breach ${effectiveSettings.maxSectorExposurePct.toFixed(0)}% ${sector} cap`
            : `Insufficient Alpaca buying power for ${sym}`,
        ],
      });
      continue;
    }

    const clientOrderId = buildIdempotentClientOrderId({
      symbol: sym,
      side: 'buy',
      qty,
      asOfIso,
    });
    if (existingClientOrderIds.has(clientOrderId)) {
      skippedByRiskGates.push({
        symbol: sym,
        sector,
        setupType: setupName,
        signalPrice: item.currentPrice,
        reasons: [`Duplicate order suppressed by idempotency key (${clientOrderId})`],
      });
      continue;
    }

    const notional = qty * item.currentPrice;
    remainingBuyingPower -= notional;
    remainingSlots -= 1;
    openSymbols.add(sym);
    existingClientOrderIds.add(clientOrderId);
    sectorExposureDollars.set(sector, currentSectorDollars + notional);

    const stopPrice = levels.stop.price;
    const initialRiskDollars =
      item.currentPrice > stopPrice
        ? Number(((item.currentPrice - stopPrice) * qty).toFixed(2))
        : Number((atr * 1.25 * qty).toFixed(2));
    const entryMarketContext = buildEntryMarketContextFromReport(marketHealth, {
      entryDate: asOfIso.slice(0, 10),
      symbolStructural: candStructural,
      initialRiskDollars,
      assetMode: 'EQUITY',
      source: 'LIVE_ORDER',
    });

    const structuralTag = candStructural
      ? candStructural.regime === 'AT_INSTITUTIONAL_BUY_ZONE' && candStructural.institutionalBuyZone
        ? ` • Inst. Buy Zone $${candStructural.institutionalBuyZone.low.toFixed(2)}–$${candStructural.institutionalBuyZone.high.toFixed(2)}${candStructural.isChurnAbsorption ? ' (Churn Absorption)' : ''}`
        : ` • Vol Sent ${candStructural.mtfVolumeSentiment >= 0 ? '+' : ''}${candStructural.mtfVolumeSentiment}/10`
      : '';
    const memTag = memoryEval
      ? ` • Memory ${memoryEval.sizingMultiplier.toFixed(2)}x`
      : '';
    const safetyMultTag =
      marketSafetyMult < 1.0
        ? ` • Safety ${marketSafetyMult.toFixed(2)}x`
        : '';

    ordersToPlace.push({
      symbol: sym,
      side: 'buy',
      qty,
      type: 'market',
      time_in_force: 'day',
      client_order_id: clientOrderId,
      sector,
      setupType: setupName,
      qualityScore: Number(mainSetup.qualityScore || 80),
      stopLoss: stopPrice,
      targetPrice: levels.targets[1]?.price || levels.targets[0]?.price || Number((item.currentPrice * 1.05).toFixed(2)),
      initialRiskDollars,
      regimeMultiplier: effectiveMult,
      entryMarketContext,
      rationale: `${mainSetup.type} (Score ${mainSetup.qualityScore}) • Risk-sized ${qty} sh @ ~$${item.currentPrice.toFixed(2)} [${sector}]${structuralTag}${memTag}${safetyMultTag}${
        marketHealthSummary ? ` • ${marketHealthSummary}` : ''
      }`,
    });
  }

  return {
    ordersToPlace,
    positionsToClose,
    reversalRequests,
    skippedByRiskGates,
    marketHealthBlocked: marketCrashBlocked,
    marketHealthSummary,
  };
}
