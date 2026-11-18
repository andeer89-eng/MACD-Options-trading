import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getEasternTimeParts, getTradeExecutionRegime } from './marketSession.ts';
import { isMarketHoliday, isEarlyClosing } from './marketCalendar.ts';

describe('marketSession & marketCalendar behavioral tests', () => {
  it('normalizes 00:xx midnight Eastern Time to hour 0 (not hour 24) and keeps Fri Globex open', () => {
    // 2026-11-20T05:15:00Z = Friday 2026-11-20 00:15:00 EST (UTC-5)
    const fridayMidnightUtc = new Date('2026-11-20T05:15:00Z');
    const et = getEasternTimeParts(fridayMidnightUtc);

    assert.equal(et.dayOfWeek, 5);
    assert.equal(et.hours, 0);
    assert.equal(et.minutes, 15);
    assert.equal(et.timeMinutes, 15);
    assert.equal(et.timeFormatted, '12:15:00 AM ET');

    // ES futures trade 24/5 continuously through Friday 5:00 PM ET
    const esRegime = getTradeExecutionRegime('ES', fridayMidnightUtc);
    assert.equal(esRegime.regime, '24/7');
    assert.equal(esRegime.label, '24/5 GLOBEX');
    assert.equal(esRegime.isOpen, true);
  });

  it('classifies Futures CME halt, Equity RTH, Premarket, Afterhours, and 24/7 Crypto sessions', () => {
    // Thursday 2026-11-19 17:30 ET = 22:30 UTC (CME daily maintenance halt 17:00-18:00 ET)
    const cmeHalt = getTradeExecutionRegime('ES', new Date('2026-11-19T22:30:00Z'));
    assert.equal(cmeHalt.regime, 'CLOSED');
    assert.equal(cmeHalt.label, 'DAILY CME HALT');
    assert.equal(cmeHalt.isOpen, false);

    // Wednesday 2026-11-18 10:00 ET = 15:00 UTC (Regular equity session)
    const rth = getTradeExecutionRegime('AAPL', new Date('2026-11-18T15:00:00Z'));
    assert.equal(rth.regime, 'REGULAR');
    assert.equal(rth.isOpen, true);

    // Thursday 2026-11-19 08:00 ET = 13:00 UTC (Premarket)
    const pre = getTradeExecutionRegime('AAPL', new Date('2026-11-19T13:00:00Z'));
    assert.equal(pre.regime, 'PREMARKET');

    // Thursday 2026-11-19 17:00 ET = 22:00 UTC (Afterhours)
    const ah = getTradeExecutionRegime('AAPL', new Date('2026-11-19T22:00:00Z'));
    assert.equal(ah.regime, 'AFTERHOURS');

    // Saturday crypto stays open 24/7
    const crypto = getTradeExecutionRegime('BTC-USD', new Date('2026-11-21T16:00:00Z'));
    assert.equal(crypto.regime, '24/7');
    assert.equal(crypto.isOpen, true);
  });

  it('detects NYSE holidays and early-closing dates beyond 2026', () => {
    // 2026 baseline
    assert.equal(isMarketHoliday('2026-11-26'), true);
    assert.equal(isEarlyClosing('2026-11-27'), true);

    // 2027 multi-year coverage
    assert.equal(isMarketHoliday('2027-01-01'), true); // New Year's Day
    assert.equal(isMarketHoliday('2027-03-26'), true); // Good Friday 2027
    assert.equal(isMarketHoliday('2027-07-05'), true); // Independence Day observed (July 4 is Sun)
    assert.equal(isMarketHoliday('2027-11-25'), true); // Thanksgiving 2027
    assert.equal(isMarketHoliday('2027-12-24'), true); // Christmas observed (Dec 25 is Sat)
    assert.equal(isEarlyClosing('2027-11-26'), true); // Day after Thanksgiving 2027

    // Non-holiday weekday
    assert.equal(isMarketHoliday('2027-11-24'), false);

    // Regime evaluation honors 2027 holiday
    const thxgiving2027 = getTradeExecutionRegime('SPY', new Date('2027-11-25T16:00:00Z'));
    assert.equal(thxgiving2027.regime, 'CLOSED');
    assert.equal(thxgiving2027.label, 'HOLIDAY');
  });
});
