import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarketBreadthCsv,
  parseUptrendSectorSummaryCsv,
  buildPublicBreadthSnapshot,
  normalizeGicsSectorName,
} from './publicBreadthFeed.ts';

describe('Public Market Breadth & Sector Uptrend CSV Engine', () => {
  it('normalizes TraderMonty sector labels to GICS names', () => {
    assert.equal(normalizeGicsSectorName('Healthcare'), 'Health Care');
    assert.equal(normalizeGicsSectorName('Consumer Defensive'), 'Consumer Staples');
    assert.equal(normalizeGicsSectorName('Financial'), 'Financials');
    assert.equal(normalizeGicsSectorName('Basic Materials'), 'Materials');
    assert.equal(normalizeGicsSectorName('Technology'), 'Information Technology');
  });

  it('parses market_breadth_data.csv chronologically and computes deltas and regime label', () => {
    const csv = [
      'Date,S&P500_Price,Breadth_Index_Raw,Breadth_Index_200MA,Breadth_Index_8MA,Breadth_200MA_Trend,Bearish_Signal,Is_Peak,Is_Trough,Is_Trough_8MA_Below_04,Breadth_50_Index_Raw,Breadth_50_Index_50MA,Breadth_50_Index_8MA,Breadth_50_MA_Trend,Bearish_Signal_50,Is_Peak_50,Is_Trough_50,Eligible_Count_200,Missing_Count_200,Above_Count_200,Coverage_200,Eligible_Count_50,Missing_Count_50,Above_Count_50,Coverage_50',
      '2026-11-25,6010.50,0.584,0.610,0.552,Down,False,False,False,False,0.596,0.540,0.571,Up,False,False,False,500,3,292,0.994,500,3,298,0.994',
      '2026-11-24,5980.10,0.562,0.612,0.548,Down,False,False,False,False,0.550,0.538,0.560,Down,False,False,False,500,3,281,0.994,500,3,275,0.994',
    ].join('\n');

    const rows = parseMarketBreadthCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, '2026-11-24');
    assert.equal(rows[1].date, '2026-11-25');
    assert.equal(rows[1].pctAbove200Ma, 58.4);
    assert.equal(rows[1].pctAbove50Ma, 59.6);
    assert.equal(rows[1].aboveCount200, 292);
    assert.equal(rows[1].aboveCount50, 298);

    const sectorCsv = [
      'Sector,Ratio,10MA,Trend,Slope,Status,As Of,Stale',
      'Technology,0.182,0.220,Down,-0.012,Normal,2026-11-25,False',
      'Financial,0.078,0.110,Down,-0.025,Oversold,2026-11-25,False',
      'Healthcare,0.440,0.380,Up,0.015,Normal,2026-11-25,False',
    ].join('\n');

    const sectorRows = parseUptrendSectorSummaryCsv(sectorCsv);
    assert.equal(sectorRows.length, 3);
    assert.equal(sectorRows[0].sector, 'Health Care'); // sorted desc by uptrendRatioPct (44.0%)
    assert.equal(sectorRows[0].uptrendRatioPct, 44.0);
    assert.equal(sectorRows[2].sector, 'Financials');
    assert.equal(sectorRows[2].status, 'OVERSOLD');

    const snap = buildPublicBreadthSnapshot({ breadthRows: rows, sectorRows });
    assert.ok(snap);
    assert.equal(snap.asOf, '2026-11-25');
    assert.equal(snap.sp500Breadth?.pctAbove200Ma, 58.4);
    assert.equal(snap.sp500Breadth?.pctAbove200MaDelta1D, 2.2);
    assert.equal(snap.sp500Breadth?.pctAbove50Ma, 59.6);
    assert.equal(snap.sp500Breadth?.pctAbove50MaDelta1D, 4.6);
    assert.equal(snap.sp500Breadth?.regimeLabel, 'HEALTHY');
    assert.equal(snap.sectorUptrend?.sectorsUpCount, 1);
    assert.equal(snap.sectorUptrend?.oversoldCount, 1);
  });

  it('degrades cleanly to null when CSV data is empty or malformed', () => {
    assert.deepEqual(parseMarketBreadthCsv('bad,header\n1,2'), []);
    assert.deepEqual(parseUptrendSectorSummaryCsv(''), []);
    assert.equal(buildPublicBreadthSnapshot({ breadthRows: [], sectorRows: [] }), null);
  });
});
