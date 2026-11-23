import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAlpacaEquityEligibleSymbol,
  markBotCandidateOutcome,
  mergeQueuedCandidatesWithMarketItems,
  removeBotCandidate,
  upsertBotCandidate,
  type BotQueuedCandidate,
} from './botCandidateQueue';
import { selectAlpacaEquityCandidates, type AlpacaOverviewDTO } from './alpacaJournalSync';
import { DEFAULT_SETTINGS } from './masterPlanCore';
import type { MarketHealthReport } from './marketHealthEngine';

function buildOverview(overrides?: Partial<AlpacaOverviewDTO>): AlpacaOverviewDTO {
  return {
    configured: true,
    mode: 'PAPER',
    paperEndpoint: 'https://paper-api.alpaca.markets',
    message: 'OK',
    fetchedAt: '2026-11-23T15:00:00.000Z',
    account: {
      id: 'acc-1',
      account_number: 'PA1234',
      status: 'ACTIVE',
      currency: 'USD',
      cash: 25000,
      buying_power: 50000,
      options_buying_power: 25000,
      options_approved_level: 2,
      equity: 25000,
      last_equity: 25000,
      day_pnl: 0,
      day_pnl_pct: 0,
      pattern_day_trader: false,
    },
    positions: [],
    equityPositions: [],
    optionPositions: [],
    orders: [],
    fills: [],
    ...overrides,
  };
}

function buildHealth(safetyStatus: 'SAFE_RISK_ON' | 'CRASH_DEFENSE'): MarketHealthReport {
  return {
    asOf: '2026-11-23T15:00:00.000Z',
    current: {
      score: safetyStatus === 'SAFE_RISK_ON' ? 78 : 22,
      label: safetyStatus === 'SAFE_RISK_ON' ? 'Risk-On' : 'Crash Defense',
      safetyStatus,
      allowNewEntries: safetyStatus === 'SAFE_RISK_ON',
      sizeMultiplier: safetyStatus === 'SAFE_RISK_ON' ? 1.0 : 0,
      vix: safetyStatus === 'SAFE_RISK_ON' ? 15.2 : 34.8,
      vixRegime: safetyStatus === 'SAFE_RISK_ON' ? 'LOW' : 'STRESS',
      spyTrendScore: 80,
      breadthScore: 75,
      netVolume1MBillions: safetyStatus === 'SAFE_RISK_ON' ? 18.5 : -42.1,
      volumeBias: safetyStatus === 'SAFE_RISK_ON' ? 'ACCUMULATION' : 'DISTRIBUTION',
      reasons: safetyStatus === 'SAFE_RISK_ON' ? ['Healthy trend'] : ['VIX stress + net distribution'],
    },
    history: [],
    summary: { avg30dScore: 65, netBuyDays: 14, netSellDays: 7, cumulativeNetVolume1MBillions: 18.5 },
  } as unknown as MarketHealthReport;
}

describe('Internal Bot Candidate Queue & Gate Enforcement', () => {
  it('validates equity-only eligibility and deduplicates by symbol', () => {
    assert.equal(isAlpacaEquityEligibleSymbol('AAPL'), true);
    assert.equal(isAlpacaEquityEligibleSymbol('BRK.B'), true);
    assert.equal(isAlpacaEquityEligibleSymbol('BTC-USD'), false);
    assert.equal(isAlpacaEquityEligibleSymbol('ES=F'), false);
    assert.equal(isAlpacaEquityEligibleSymbol('^VIX'), false);

    const badCrypto = upsertBotCandidate([], {
      symbol: 'BTC-USD',
      direction: 'BULLISH',
      source: 'CHART',
      currentPrice: 80000,
    });
    assert.equal(badCrypto.ok, false);

    const first = upsertBotCandidate([], {
      symbol: 'aapl',
      direction: 'BULLISH',
      source: 'SCANNER',
      qualityScore: 81,
      currentPrice: 190,
      atr: 3.5,
    });
    assert.equal(first.ok, true);

    const replaced = upsertBotCandidate(first.queue, {
      symbol: 'AAPL',
      direction: 'BEARISH',
      source: 'CHART',
      setupType: 'BEARISH_TRIPLE',
      qualityScore: 88,
      currentPrice: 191,
      atr: 3.5,
    });
    assert.equal(replaced.ok, true);
    assert.equal(replaced.queue.length, 1);
    assert.equal(replaced.queue[0].direction, 'BEARISH');
    assert.equal(replaced.queue[0].source, 'CHART');

    const afterRemove = removeBotCandidate(replaced.queue, 'AAPL');
    assert.equal(afterRemove.length, 0);
  });

  it('prioritizes QUEUED candidates in market items and skips EXECUTED items', () => {
    const queue: BotQueuedCandidate[] = [
      {
        id: 'q1',
        symbol: 'NVDA',
        direction: 'BULLISH',
        source: 'CHART',
        setupType: 'BULLISH_TRIPLE',
        qualityScore: 86,
        currentPrice: 135,
        atr: 4.1,
        addedAt: '2026-11-23T15:00:00.000Z',
        status: 'QUEUED',
      },
      {
        id: 'q2',
        symbol: 'MSFT',
        direction: 'BULLISH',
        source: 'SCANNER',
        setupType: 'BULLISH_DOUBLE',
        qualityScore: 82,
        currentPrice: 410,
        addedAt: '2026-11-23T14:00:00.000Z',
        status: 'EXECUTED',
      },
    ];

    const marketItems: Array<{
      symbol: string;
      currentPrice: number;
      atr?: number;
      setups?: Array<{ type: string; qualityScore?: number }>;
    }> = [
      { symbol: 'AAPL', currentPrice: 220, atr: 3.2, setups: [] },
      { symbol: 'NVDA', currentPrice: 136, atr: 4.2, setups: [] },
    ];
    const merged = mergeQueuedCandidatesWithMarketItems(queue, marketItems);

    assert.equal(merged[0].symbol, 'NVDA');
    assert.equal(merged[0].currentPrice, 136);
    assert.equal(merged[0].setups?.[0]?.type, 'BULLISH_TRIPLE');
    assert.equal(merged.some((m) => m.symbol === 'MSFT'), false);
    assert.deepEqual(
      markBotCandidateOutcome(queue, 'NVDA', 'EXECUTED', 'Done').find((x) => x.symbol === 'NVDA')?.status,
      'EXECUTED'
    );
  });

  it('never bypasses Market Health Crash Defense or canTrade() for queued Chart candidates', () => {
    const queued: BotQueuedCandidate[] = [
      {
        id: 'q-chart',
        symbol: 'NVDA',
        direction: 'BULLISH',
        source: 'CHART',
        setupType: 'BULLISH_TRIPLE',
        qualityScore: 92,
        currentPrice: 135,
        atr: 4.0,
        sector: 'Information Technology',
        addedAt: '2026-11-23T15:00:00.000Z',
        status: 'QUEUED',
      },
    ];

    const crashSelection = selectAlpacaEquityCandidates(
      buildOverview(),
      [],
      { ...DEFAULT_SETTINGS, dataQuality: 'live' },
      5,
      {
        nowMs: Date.now(),
        marketHealth: buildHealth('CRASH_DEFENSE'),
        queuedCandidates: queued,
      }
    );

    assert.equal(crashSelection.ordersToPlace.length, 0);
    assert.equal(crashSelection.marketHealthBlocked, true);
    assert.match(crashSelection.skippedByRiskGates[0].reasons[0], /Market Health Crash Defense/);

    const safeSelection = selectAlpacaEquityCandidates(
      buildOverview(),
      [],
      { ...DEFAULT_SETTINGS, dataQuality: 'live' },
      5,
      {
        nowMs: Date.now(),
        marketHealth: buildHealth('SAFE_RISK_ON'),
        queuedCandidates: queued,
      }
    );

    assert.equal(safeSelection.ordersToPlace.length, 1);
    assert.equal(safeSelection.ordersToPlace[0].symbol, 'NVDA');
    assert.equal(safeSelection.ordersToPlace[0].side, 'buy');
  });

  it('triggers deterministic reversal exit when BEARISH candidate is queued against an open LONG position', () => {
    const queuedBearish: BotQueuedCandidate[] = [
      {
        id: 'q-rev',
        symbol: 'AAPL',
        direction: 'BEARISH',
        source: 'CHART',
        setupType: 'BEARISH_TRIPLE',
        qualityScore: 89,
        currentPrice: 192,
        atr: 3.1,
        addedAt: '2026-11-23T15:00:00.000Z',
        status: 'QUEUED',
      },
    ];

    const overviewWithLong = buildOverview({
      equityPositions: [
        {
          asset_id: 'eq-aapl',
          symbol: 'AAPL',
          asset_class: 'us_equity',
          qty: 10,
          side: 'long',
          avg_entry_price: 185,
          current_price: 192,
          market_value: 1920,
          cost_basis: 1850,
          unrealized_pl: 70,
          unrealized_plpc: 3.78,
          change_today: 1.2,
        },
      ],
    });

    const res = selectAlpacaEquityCandidates(
      overviewWithLong,
      [],
      { ...DEFAULT_SETTINGS, dataQuality: 'live' },
      5,
      {
        nowMs: Date.now(),
        marketHealth: buildHealth('SAFE_RISK_ON'),
        queuedCandidates: queuedBearish,
      }
    );

    assert.equal(res.positionsToClose.length, 1);
    assert.equal(res.positionsToClose[0].symbol, 'AAPL');
    assert.equal(res.positionsToClose[0].isReversal, true);
    assert.equal(res.reversalRequests.length, 1);
    assert.equal(res.reversalRequests[0].targetDirection, 'BEARISH');
    assert.equal(res.ordersToPlace.length, 0);
  });
});
