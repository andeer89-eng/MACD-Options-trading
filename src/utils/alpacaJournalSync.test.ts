import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOccOptionSymbol,
  mapAlpacaOrdersToJournalEntries,
  alpacaOrdersToOptionsHistory,
  selectAlpacaEquityCandidates,
  type AlpacaOverviewDTO,
} from './alpacaJournalSync.ts';
import { DEFAULT_SETTINGS } from './masterPlanCore.ts';
import type { JournalEntry } from './tradeJournal.ts';
import { initDefaultActiveMemory, ingestTradeEpisode } from './activeLearningEngine.ts';
import { buildEntryMarketContextFromReport } from './entryMarketContext.ts';

describe('alpacaJournalSync pure logic & FIFO journal ledger mapping', () => {
  it('parses OCC option symbols accurately into underlying, expiration, type, and strike', () => {
    const spyPut = parseOccOptionSymbol('SPY261218P00560000');
    assert.equal(spyPut.isOption, true);
    assert.equal(spyPut.underlying, 'SPY');
    assert.equal(spyPut.expiration, '2026-12-18');
    assert.equal(spyPut.optionType, 'PUT');
    assert.equal(spyPut.strike, 560);
    assert.ok(spyPut.formattedContract.includes('SPY'));
    assert.ok(spyPut.formattedContract.includes('560 P'));

    const eq = parseOccOptionSymbol('NVDA');
    assert.equal(eq.isOption, false);
    assert.equal(eq.underlying, 'NVDA');
  });

  it('pairs filled Alpaca stock buy+sell orders FIFO into closed JournalEntry with exact realized P&L', () => {
    const orders = [
      {
        id: 'ord-buy-1',
        symbol: 'NVDA',
        asset_class: 'us_equity',
        side: 'buy' as const,
        qty: 10,
        filled_qty: 10,
        filled_avg_price: 120.0,
        type: 'market',
        time_in_force: 'day',
        limit_price: null,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-10T14:30:00Z',
        filled_at: '2026-11-10T14:30:05Z',
      },
      {
        id: 'ord-sell-1',
        symbol: 'NVDA',
        asset_class: 'us_equity',
        side: 'sell' as const,
        qty: 10,
        filled_qty: 10,
        filled_avg_price: 132.5,
        type: 'limit',
        time_in_force: 'day',
        limit_price: 132.5,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-14T15:00:00Z',
        filled_at: '2026-11-14T15:00:10Z',
      },
    ];

    const result = mapAlpacaOrdersToJournalEntries(orders, [], []);
    assert.equal(result.entries.length, 1);
    const entry = result.entries[0];
    assert.equal(entry.symbol, 'NVDA');
    assert.equal(entry.status, 'CLOSED_WIN');
    assert.equal(entry.entryPrice, 120.0);
    assert.equal(entry.exitPrice, 132.5);
    assert.equal(entry.quantity, 10);
    assert.equal(entry.realizedPnL, 125.0);
    assert.ok(entry.tags.includes('Alpaca Paper'));
    assert.ok(entry.tags.includes('Alpaca Equity'));
    assert.equal(entry.epochId, 'alpaca-paper');
  });

  it('pairs filled Alpaca short OCC Put option sell+buy orders using 100x multiplier', () => {
    const orders = [
      {
        id: 'opt-open-1',
        symbol: 'SPY261218P00560000',
        asset_class: 'us_option',
        side: 'sell' as const,
        qty: 2,
        filled_qty: 2,
        filled_avg_price: 2.5,
        type: 'limit',
        time_in_force: 'day',
        limit_price: 2.5,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-12T15:00:00Z',
        filled_at: '2026-11-12T15:01:00Z',
      },
      {
        id: 'opt-close-1',
        symbol: 'SPY261218P00560000',
        asset_class: 'us_option',
        side: 'buy' as const,
        qty: 2,
        filled_qty: 2,
        filled_avg_price: 0.6,
        type: 'limit',
        time_in_force: 'day',
        limit_price: 0.6,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-17T18:00:00Z',
        filled_at: '2026-11-17T18:00:10Z',
      },
    ];

    const result = mapAlpacaOrdersToJournalEntries(orders, [], []);
    assert.equal(result.entries.length, 1);
    const entry = result.entries[0];
    assert.equal(entry.symbol, 'SPY261218P00560000');
    assert.equal(entry.status, 'CLOSED_WIN');
    // (2.50 - 0.60) * 2 contracts * 100 multiplier = +380.00
    assert.equal(entry.realizedPnL, 380.0);
    assert.ok(entry.tags.includes('Alpaca Paper'));
    assert.ok(entry.tags.includes('Alpaca Options'));

    const optHist = alpacaOrdersToOptionsHistory(orders);
    assert.equal(optHist.length, 1);
    assert.equal(optHist[0].ticker, 'SPY');
    assert.equal(optHist[0].profitDollars, 380.0);
  });

  it('sync is idempotent and upgrades an OPEN entry to CLOSED without creating duplicates or losing manual notes', () => {
    const existingOpen: JournalEntry = {
      id: 'alpaca_lot_ord-aapl-open',
      symbol: 'AAPL',
      setupType: 'BULLISH_TRIPLE',
      timeframe: '1d',
      status: 'OPEN',
      entryDate: '2026-11-15',
      entryPrice: 220,
      stopLoss: 214,
      targetPrice: 232,
      quantity: 5,
      notes: 'Custom user thesis before exit',
      tags: ['Alpaca Paper', 'Alpaca Equity', 'alpaca-order:ord-aapl-open'],
      executionRating: 5,
      epochId: 'alpaca-paper',
      createdAt: 1763200000000,
    };

    const orders = [
      {
        id: 'ord-aapl-open',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        side: 'buy' as const,
        qty: 5,
        filled_qty: 5,
        filled_avg_price: 220,
        type: 'market',
        time_in_force: 'day',
        limit_price: null,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-15T15:00:00Z',
        filled_at: '2026-11-15T15:00:05Z',
      },
      {
        id: 'ord-aapl-close',
        symbol: 'AAPL',
        asset_class: 'us_equity',
        side: 'sell' as const,
        qty: 5,
        filled_qty: 5,
        filled_avg_price: 230,
        type: 'market',
        time_in_force: 'day',
        limit_price: null,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-19T15:00:00Z',
        filled_at: '2026-11-19T15:00:05Z',
      },
    ];

    const first = mapAlpacaOrdersToJournalEntries(orders, [], [existingOpen]);
    assert.equal(first.entries.length, 1);
    assert.equal(first.entries[0].status, 'CLOSED_WIN');
    assert.equal(first.entries[0].realizedPnL, 50);
    assert.ok(first.entries[0].notes.includes('Custom user thesis before exit'));
    assert.equal(first.entries[0].executionRating, 5);

    // Second run must be an exact no-op with 0 added/updated changes
    const second = mapAlpacaOrdersToJournalEntries(orders, [], first.entries);
    assert.equal(second.entries.length, 1);
    assert.equal(second.addedCount, 0);
    assert.equal(second.updatedCount, 0);
  });

  it('selectAlpacaEquityCandidates enforces real sector exposure cap, blocks stale quotes, and sets deterministic client_order_id', () => {
    const nowMs = Date.UTC(2026, 10, 21, 16, 0, 0);
    const baseOverview: AlpacaOverviewDTO = {
      configured: true,
      mode: 'PAPER',
      paperEndpoint: 'https://paper-api.alpaca.markets',
      message: 'Connected',
      fetchedAt: new Date(nowMs).toISOString(),
      account: {
        id: 'acct-1',
        account_number: 'PA123456',
        status: 'ACTIVE',
        currency: 'USD',
        cash: 65000,
        buying_power: 65000,
        options_buying_power: 65000,
        options_approved_level: 2,
        equity: 100000,
        last_equity: 100000,
        day_pnl: 250,
        day_pnl_pct: 0.25,
        pattern_day_trader: false,
      },
      positions: [],
      equityPositions: [
        {
          asset_id: 'nvda-1',
          symbol: 'NVDA',
          asset_class: 'us_equity',
          qty: 250,
          side: 'long',
          avg_entry_price: 135,
          current_price: 140,
          market_value: 35000, // 35% of $100k in Information Technology > 30% cap
          cost_basis: 33750,
          unrealized_pl: 1250,
          unrealized_plpc: 3.7,
          change_today: 1.1,
        },
      ],
      optionPositions: [],
      orders: [],
      fills: [],
    };

    const marketItems = [
      {
        symbol: 'AAPL', // Information Technology -> must be blocked by 30% sector cap (35% held)
        sector: 'Information Technology',
        currentPrice: 220,
        atr: 4.0,
        fetchedAtMs: nowMs - 60_000,
        setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 88 }],
      },
      {
        symbol: 'JPM', // Financials -> 0% held, but stale quote must block
        sector: 'Financials',
        currentPrice: 210,
        atr: 3.5,
        fetchedAtMs: nowMs - 2 * 60 * 60 * 1000, // 2h old > 45m limit
        setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 86 }],
      },
      {
        symbol: 'XOM', // Energy -> 0% held, fresh quote -> must clear all gates!
        sector: 'Energy',
        currentPrice: 118,
        atr: 2.2,
        fetchedAtMs: nowMs - 120_000,
        setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 85 }],
      },
    ];

    const res = selectAlpacaEquityCandidates(
      baseOverview,
      marketItems,
      { ...DEFAULT_SETTINGS, maxSectorExposurePct: 30, maxRiskPerTradePct: 1.0 },
      5,
      { nowMs }
    );

    assert.equal(res.ordersToPlace.length, 1);
    assert.equal(res.ordersToPlace[0].symbol, 'XOM');
    assert.equal(res.ordersToPlace[0].sector, 'Energy');
    assert.ok(res.ordersToPlace[0].client_order_id.startsWith('trullas_XOM_buy_'));

    const aaplSkip = res.skippedByRiskGates.find((s) => s.symbol === 'AAPL');
    assert.ok(aaplSkip && aaplSkip.reasons.some((r) => r.includes('Sector Exposure Within Cap')));

    const jpmSkip = res.skippedByRiskGates.find((s) => s.symbol === 'JPM');
    assert.ok(jpmSkip && jpmSkip.reasons.some((r) => r.includes('Live & Fresh Market Data')));

    // Re-running when the exact client_order_id already exists in Alpaca orders suppresses duplicate
    const dedupRes = selectAlpacaEquityCandidates(
      {
        ...baseOverview,
        orders: [
          {
            id: 'ord-dup-1',
            client_order_id: res.ordersToPlace[0].client_order_id,
            symbol: 'XOM',
            asset_class: 'us_equity',
            side: 'buy',
            qty: res.ordersToPlace[0].qty,
            filled_qty: 0,
            filled_avg_price: null,
            type: 'market',
            time_in_force: 'day',
            limit_price: null,
            stop_price: null,
            status: 'filled',
            submitted_at: new Date(nowMs).toISOString(),
            filled_at: null,
          },
        ],
      },
      marketItems,
      { ...DEFAULT_SETTINGS, maxSectorExposurePct: 30, maxRiskPerTradePct: 1.0 },
      5,
      { nowMs }
    );
    assert.equal(dedupRes.ordersToPlace.length, 0);
    assert.ok(
      dedupRes.skippedByRiskGates.some(
        (s) => s.symbol === 'XOM' && s.reasons.some((r) => r.includes('idempotency key'))
      )
    );

    // Market Health Crash Defense must block all new BUY candidates regardless of individual setup score
    const crashHealth = {
      isLive: true,
      asOf: '2026-11-22',
      dataSource: 'Test Feed',
      universeCount: 14,
      current: {
        score: 21,
        label: 'Extreme Fear' as const,
        safetyStatus: 'CRASH_DEFENSE' as const,
        allowNewEntries: false,
        sizeMultiplier: 0,
        vix: 31.4,
        vix3m: 28.1,
        vixTermStructure: 'BACKWARDATION' as const,
        spyPrice: 540,
        spyChangePct: -2.4,
        spy5dReturnPct: -5.1,
        netVolumeTodayBillions: -6.2,
        buyingVolumeTodayBillions: 12.1,
        sellingVolumeTodayBillions: 18.3,
        netVolume1MBillions: -14.2,
        buyingVolume1MBillions: 110,
        sellingVolume1MBillions: 124.2,
        buySellRatio1M: 0.89,
        breadthPct: 18,
        momentumScore: 15,
        vixScore: 18,
        volumeScore: 26,
        breadthScore: 25,
        reasons: ['Extreme market fear (Health Score 21/100 < 32)', 'VIX crisis elevation (31.4 >= 28)'],
      },
      snapshots: {
        now: { date: '2026-11-22', score: 21, label: 'Extreme Fear' as const, vix: 31.4, netFlowBillions: -6.2 },
        previousClose: null,
        oneWeekAgo: null,
        oneMonthAgo: null,
        oneYearAgo: null,
      },
      history1M: [],
      history1YCount: 252,
    };

    const crashRes = selectAlpacaEquityCandidates(
      baseOverview,
      marketItems,
      { ...DEFAULT_SETTINGS, maxSectorExposurePct: 30, maxRiskPerTradePct: 1.0 },
      5,
      { nowMs, marketHealth: crashHealth }
    );
    assert.equal(crashRes.ordersToPlace.length, 0);
    assert.equal(crashRes.marketHealthBlocked, true);
    assert.ok(
      crashRes.skippedByRiskGates.some(
        (s) => s.symbol === 'XOM' && s.reasons.some((r) => r.includes('Market Health Crash Defense'))
      )
    );
  });

  it('handles partial closes cleanly without ID collision and prunes closed alpaca_pos fallback records', () => {
    const existingOpen: JournalEntry = {
      id: 'alpaca_lot_ord-adbe-1',
      symbol: 'ADBE',
      setupType: 'BULLISH_TRIPLE',
      timeframe: '1d',
      status: 'OPEN',
      entryDate: '2026-11-20',
      entryPrice: 224.52,
      stopLoss: 215.54,
      targetPrice: 242.48,
      quantity: 10,
      notes: 'Original 10 sh ADBE open lot',
      tags: ['Alpaca Paper', 'Alpaca Equity', 'alpaca-order:ord-adbe-1'],
      executionRating: 4,
      epochId: 'alpaca-paper',
      createdAt: 1763640000000,
    };
    const staleFallback: JournalEntry = {
      id: 'alpaca_pos_stale-xyz',
      symbol: 'XYZ',
      setupType: 'BULLISH_TRIPLE',
      timeframe: '1d',
      status: 'OPEN',
      entryDate: '2026-11-18',
      entryPrice: 50,
      stopLoss: 48,
      targetPrice: 54,
      quantity: 5,
      notes: 'Stale fallback position already closed on Alpaca',
      tags: ['Alpaca Paper', 'Alpaca Equity'],
      executionRating: 4,
      epochId: 'alpaca-paper',
      createdAt: 1763500000000,
    };

    const orders = [
      {
        id: 'ord-adbe-1',
        symbol: 'ADBE',
        asset_class: 'us_equity',
        side: 'buy' as const,
        qty: 10,
        filled_qty: 10,
        filled_avg_price: 224.52,
        type: 'market',
        time_in_force: 'day',
        limit_price: null,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-20T14:30:00Z',
        filled_at: '2026-11-20T14:30:05Z',
      },
      {
        id: 'ord-adbe-partial-sell',
        symbol: 'ADBE',
        asset_class: 'us_equity',
        side: 'sell' as const,
        qty: 4,
        filled_qty: 4,
        filled_avg_price: 234.52,
        type: 'market',
        time_in_force: 'day',
        limit_price: null,
        stop_price: null,
        status: 'filled',
        submitted_at: '2026-11-21T15:00:00Z',
        filled_at: '2026-11-21T15:00:05Z',
      },
    ];

    const positions = [
      {
        asset_id: 'asset-adbe',
        symbol: 'ADBE',
        asset_class: 'us_equity',
        qty: 6,
        side: 'long' as const,
        avg_entry_price: 224.52,
        current_price: 235.0,
        market_value: 1410,
        cost_basis: 1347.12,
        unrealized_pl: 62.88,
        unrealized_plpc: 4.67,
        change_today: 0.5,
      },
    ];

    const res = mapAlpacaOrdersToJournalEntries(orders, positions, [existingOpen, staleFallback]);
    assert.equal(res.entries.length, 2, 'Should keep 1 closed 4sh slice and 1 open 6sh remainder, pruning stale XYZ');
    const closedSlice = res.entries.find((e) => e.status === 'CLOSED_WIN');
    const openRemainder = res.entries.find((e) => e.status === 'OPEN');
    assert.ok(closedSlice);
    assert.ok(openRemainder);
    assert.equal(closedSlice.quantity, 4);
    assert.equal(closedSlice.realizedPnL, 40);
    assert.equal(openRemainder.quantity, 6);
    assert.equal(openRemainder.id, 'alpaca_lot_ord-adbe-1');
    assert.equal(res.entries.some((e) => e.symbol === 'XYZ'), false);
  });

  it('selectAlpacaEquityCandidates integrates activeMemory regime gating, scales qty, and attaches entryMarketContext', () => {
    const nowMs = Date.UTC(2026, 10, 21, 16, 0, 0);
    const neutralHealth = {
      isLive: true,
      asOf: '2026-11-21',
      dataSource: 'Test Feed',
      universeCount: 14,
      current: {
        score: 54,
        label: 'Neutral' as const,
        safetyStatus: 'SAFE_RISK_ON' as const,
        allowNewEntries: true,
        sizeMultiplier: 1.0,
        vix: 17.4,
        vix3m: 19.1,
        vixTermStructure: 'CONTANGO' as const,
        spyPrice: 595,
        spyChangePct: 0.3,
        spy5dReturnPct: 1.0,
        netVolumeTodayBillions: 1.5,
        buyingVolumeTodayBillions: 14,
        sellingVolumeTodayBillions: 12.5,
        netVolume1MBillions: 5.2,
        buyingVolume1MBillions: 115,
        sellingVolume1MBillions: 109.8,
        buySellRatio1M: 1.05,
        breadthPct: 60,
        momentumScore: 55,
        vixScore: 58,
        volumeScore: 52,
        breadthScore: 55,
        reasons: ['Healthy Neutral regime'],
      },
      snapshots: {
        now: { date: '2026-11-21', score: 54, label: 'Neutral' as const, vix: 17.4, netFlowBillions: 1.5 },
        previousClose: null,
        oneWeekAgo: null,
        oneMonthAgo: null,
        oneYearAgo: null,
      },
      history1M: [],
      history1YCount: 252,
    };

    const neutralCtx = buildEntryMarketContextFromReport(neutralHealth, {
      entryDate: '2026-11-15',
      initialRiskDollars: 100,
      assetMode: 'EQUITY',
    });

    let memory = initDefaultActiveMemory();
    for (let i = 0; i < 6; i++) {
      memory = ingestTradeEpisode(memory, {
        symbol: `LOSS${i}`,
        setupType: 'BULLISH TRIPLE',
        direction: 'BULLISH',
        assetMode: 'EQUITY',
        entryPrice: 100,
        exitPrice: 94,
        pnl: -150,
        pnlPercent: -6,
        qualityScore: 76,
        atrPercent: 2.5,
        exitReason: 'STOP LOSS',
        entryMarketContext: neutralCtx,
        initialRiskDollars: 100,
      }).updatedState;
    }

    const overview: AlpacaOverviewDTO = {
      configured: true,
      mode: 'PAPER',
      paperEndpoint: 'https://paper-api.alpaca.markets',
      message: 'Connected',
      fetchedAt: new Date(nowMs).toISOString(),
      account: {
        id: 'acct-1',
        account_number: 'PA123456',
        status: 'ACTIVE',
        currency: 'USD',
        cash: 100000,
        buying_power: 100000,
        options_buying_power: 100000,
        options_approved_level: 2,
        equity: 100000,
        last_equity: 100000,
        day_pnl: 0,
        day_pnl_pct: 0,
        pattern_day_trader: false,
      },
      positions: [],
      equityPositions: [],
      optionPositions: [],
      orders: [],
      fills: [],
    };

    const marketItems = [
      {
        symbol: 'XOM',
        sector: 'Energy',
        currentPrice: 118,
        atr: 2.2,
        fetchedAtMs: nowMs - 60_000,
        setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 73 }], // fails elevated adaptive threshold
      },
      {
        symbol: 'CVX',
        sector: 'Energy',
        currentPrice: 155,
        atr: 2.8,
        fetchedAtMs: nowMs - 60_000,
        setups: [{ type: 'BULLISH_TRIPLE', qualityScore: 88 }], // passes and gets throttled size & context attached
      },
    ];

    const res = selectAlpacaEquityCandidates(
      overview,
      marketItems,
      { ...DEFAULT_SETTINGS, maxSectorExposurePct: 40, maxRiskPerTradePct: 1.0 },
      5,
      { nowMs, marketHealth: neutralHealth, activeMemory: memory }
    );

    assert.equal(res.ordersToPlace.length, 1);
    assert.equal(res.ordersToPlace[0].symbol, 'CVX');
    assert.ok((res.ordersToPlace[0].regimeMultiplier ?? 1) < 1.0);
    assert.equal(res.ordersToPlace[0].entryMarketContext?.sentimentLabel, 'Neutral');
    assert.ok((res.ordersToPlace[0].initialRiskDollars ?? 0) > 0);

    const xomSkip = res.skippedByRiskGates.find((s) => s.symbol === 'XOM');
    assert.ok(xomSkip);
    assert.equal(xomSkip.setupType, 'BULLISH_TRIPLE');
    assert.equal(xomSkip.signalPrice, 118);
    assert.ok(xomSkip.reasons.some((r) => r.includes('Active Memory Guard')));
  });
});


