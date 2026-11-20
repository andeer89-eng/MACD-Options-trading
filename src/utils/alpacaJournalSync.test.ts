import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOccOptionSymbol,
  mapAlpacaOrdersToJournalEntries,
  alpacaOrdersToOptionsHistory,
} from './alpacaJournalSync.ts';
import type { JournalEntry } from './tradeJournal.ts';

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
});
