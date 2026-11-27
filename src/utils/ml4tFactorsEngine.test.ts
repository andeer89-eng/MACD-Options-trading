import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from './trullasStrategy.ts';
import {
  applyCausalShift,
  buildSyncedPythonAlphalensScript,
  computeAdfStationarityTest,
  computeAgaigConsensus,
  computeAlgoAlphaTrendFlow,
  computeBXtrender,
  computeCenteredMfi,
  computeFeatureConfigFingerprint,
  computeGronTrendCloud,
  computeHaInstitutionalSuite,
  computeIctPropConfluence,
  computeInsideBarHtf,
  computeMcdxPlusMetrics,
  computeOrderFlowEliteMetrics,
  computeShannonYtdAvwap,
  computeStartupLattice,
  computeStartupSsStratAlignment,
  computeStartupSuiteMetrics,
  computeSuperTrendV10Prime,
  computeTradingWarzWeeklyFib,
  computeTripleBarrierSeries,
  computeWeinsteinDailyMetrics,
  computeWhaleFusionMetrics,
  computeWilliamsVixFix,
  SIMULATION_HORIZONS,
  evaluateIndicatorCombination,
  extractFactorSeriesMap,
  runCrossSectionalFactorAudit,
  spearmanRankCorrelation,
} from './ml4tFactorsEngine.ts';

function makeSyntheticTrendCandles(
  days: number,
  startPrice: number,
  driftPerDay: number,
  seedOffset: number
): Candle[] {
  const out: Candle[] = [];
  let price = startPrice;
  const baseTs = Date.UTC(2024, 0, 2);

  for (let i = 0; i < days; i++) {
    const ts = baseTs + i * 86_400_000;
    const dateStr = new Date(ts).toISOString().split('T')[0];
    const wave = Math.sin((i + seedOffset) * 0.27) * 0.009;
    const ret = driftPerDay + wave;
    const open = price;
    price = Math.max(5, Number((price * (1 + ret)).toFixed(2)));
    const high = Number((Math.max(open, price) * 1.007).toFixed(2));
    const low = Number((Math.min(open, price) * 0.993).toFixed(2));
    const volBase = 1_500_000 + Math.abs(Math.cos(i * 0.4 + seedOffset)) * 1_200_000;
    out.push({
      timestamp: ts,
      dateStr,
      open,
      high,
      low,
      close: price,
      volume: Math.round(volBase),
    });
  }
  return out;
}

test('ported Pine indicators produce finite, responsive outputs across bull rally and panic selloff', () => {
  const rally = makeSyntheticTrendCandles(180, 100, 0.004, 1);
  const bx = computeBXtrender(rally);
  const wvf = computeWilliamsVixFix(rally);
  const wf = computeWhaleFusionMetrics(rally);
  const aa = computeAlgoAlphaTrendFlow(rally);
  const cmfi = computeCenteredMfi(rally);

  const ha = computeHaInstitutionalSuite(rally);
  const ofImb = computeOrderFlowEliteMetrics(rally);
  const twFib = computeTradingWarzWeeklyFib(rally);
  const wsa = computeWeinsteinDailyMetrics(rally);
  const startup = computeStartupSuiteMetrics(rally);

  assert.equal(bx.length, 180);
  assert.ok(Number.isFinite(bx[179].t3Short));
  assert.ok(bx[179].longTerm > 0, `Expected positive B-Xtrender longTerm in steady uptrend, got ${bx[179].longTerm}`);

  assert.ok(aa[179].alphaDir === -1, 'Expected AlgoAlpha bullish trail (-1) in strong rally');
  assert.ok(Number.isFinite(aa[179].mfiHma7));
  assert.ok(Number.isFinite(cmfi[179].mfiCentered));
  assert.ok(wf[179].pTrend >= 0 && wf[179].pTrend <= 1);

  assert.equal(ha.length, 180);
  assert.ok(Number.isFinite(ha[179].signedRibbonScore));
  assert.equal(ofImb.length, 180);
  assert.ok(ofImb[179] >= -1 && ofImb[179] <= 1);
  assert.equal(twFib.length, 180);
  assert.ok(Number.isFinite(twFib[179]));
  assert.equal(wsa.length, 180);
  assert.ok(wsa[179] > 0, `Expected positive Weinstein 150D ROC in steady uptrend, got ${wsa[179]}`);
  assert.equal(startup.length, 180);
  assert.ok(Number.isFinite(startup[179].bravoAtrDist));
  assert.ok(Number.isFinite(startup[179].archZ));
  assert.ok(Number.isFinite(startup[179].echoRsi7));
  assert.ok(Number.isFinite(startup[179].helixOsc));
  assert.ok(startup[179].mountainAlt > 0);
  assert.ok(startup[179].tangoRsi28 > 0);

  // Batch 2 Pine v6 Ports
  const gron = computeGronTrendCloud(rally);
  const shannon = computeShannonYtdAvwap(rally);
  const agaig = computeAgaigConsensus(rally);
  const insideBar = computeInsideBarHtf(rally);
  const ict = computeIctPropConfluence(rally);
  const mcdx = computeMcdxPlusMetrics(rally);

  assert.equal(gron.length, 180);
  assert.ok(gron[179].isBullish);
  assert.ok(gron[179].biasScore > 0);

  assert.equal(shannon.length, 180);
  assert.ok(Number.isFinite(shannon[179].zScore));
  assert.ok(shannon[179].ytdAvwap > 0);

  assert.equal(agaig.length, 180);
  assert.ok(agaig[179].netScore > 0, `Expected positive AGAIG consensus in uptrend, got ${agaig[179].netScore}`);

  assert.equal(insideBar.length, 180);
  assert.ok(Number.isFinite(insideBar[179].combinedScore));
  assert.equal(insideBar[179].htfTrendBias, 1);

  assert.equal(ict.length, 180);
  assert.ok(Number.isFinite(ict[179].smoothedScore));

  assert.equal(mcdx.length, 180);
  assert.ok(mcdx[179].profitableChips > mcdx[179].trappedChips);
  assert.ok(mcdx[179].netChipEdge > 0);

  // Batch 3 Pine v6 Ports (Lattice, SS Strat v2.0 Online-IC, SuperTrend v10.1 PRIME)
  const lattice = computeStartupLattice(rally);
  const ssStrat = computeStartupSsStratAlignment(rally);
  const stV10 = computeSuperTrendV10Prime(rally);

  assert.equal(lattice.length, 180);
  assert.ok(lattice[179].latticePct > 0, `Expected positive Lattice spread in uptrend, got ${lattice[179].latticePct}`);
  assert.equal(ssStrat.length, 180);
  assert.ok(Number.isFinite(ssStrat[179].onlineIcScore));
  assert.equal(ssStrat[179].activeWeights.length, 7);
  const wSum = ssStrat[179].activeWeights.reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(wSum - 1) < 0.02, `Expected normalized Online-IC weights summing to ~1, got ${wSum}`);
  assert.equal(stV10.length, 180);
  assert.equal(stV10[179].isUp, true);
  assert.ok(stV10[179].combinedScore > 0);

  // Inject sharp capitulation drop on the last bar -> Williams Vix Fix must spike strongly
  const panic = rally.map((c) => ({ ...c }));
  const last = panic[panic.length - 1];
  panic[panic.length - 1] = {
    ...last,
    low: Number((last.close * 0.84).toFixed(2)),
    close: Number((last.close * 0.87).toFixed(2)),
    volume: last.volume * 4,
  };
  const wvfPanic = computeWilliamsVixFix(panic);
  assert.ok(
    wvfPanic[wvfPanic.length - 1].wvf > 12,
    `Expected WVF panic spike > 12, got ${wvfPanic[wvfPanic.length - 1].wvf}`
  );
  assert.equal(wvfPanic[wvfPanic.length - 1].isExtreme, true);
  assert.ok(wvf.length === 180);
});

test('applyCausalShift strictly prevents look-ahead leakage from bar t into shifted[t] across all 35 factors', () => {
  const baseCandles = makeSyntheticTrendCandles(110, 120, 0.002, 3);
  const mutatedCandles = baseCandles.map((c) => ({ ...c }));
  // Mutate the final bar drastically
  mutatedCandles[109] = {
    ...mutatedCandles[109],
    high: 999,
    low: 10,
    close: 950,
    volume: 999_000_000,
  };

  const baseRaw = extractFactorSeriesMap(baseCandles);
  const mutRaw = extractFactorSeriesMap(mutatedCandles);

  assert.equal(Object.keys(baseRaw).length, 35);

  for (const factorId of Object.keys(baseRaw)) {
    const shiftedBase = applyCausalShift(baseRaw[factorId], 1);
    const shiftedMut = applyCausalShift(mutRaw[factorId], 1);
    // Shifted value available AT bar 109 depends ONLY on bars <= 108!
    assert.equal(
      shiftedBase[109],
      shiftedMut[109],
      `Factor ${factorId} leaked future bar 109 into shifted[109]`
    );
  }
});

test('spearmanRankCorrelation captures monotonic rank relationship cleanly', () => {
  assert.ok(spearmanRankCorrelation([10, 20, 30, 40, 50], [1, 2, 3, 4, 5]) > 0.99);
  assert.ok(spearmanRankCorrelation([10, 20, 30, 40, 50], [5, 4, 3, 2, 1]) < -0.99);
});

test('runCrossSectionalFactorAudit audits 35 factors, 29 audit items, 10 preset combos, and walk-forward Ridge', () => {
  const cohort: Record<string, Candle[]> = {
    SYM1: makeSyntheticTrendCandles(180, 80, 0.0045, 1),
    SYM2: makeSyntheticTrendCandles(180, 110, 0.0030, 2),
    SYM3: makeSyntheticTrendCandles(180, 95, 0.0015, 3),
    SYM4: makeSyntheticTrendCandles(180, 130, 0.0005, 4),
    SYM5: makeSyntheticTrendCandles(180, 75, -0.0015, 5),
    SYM6: makeSyntheticTrendCandles(180, 150, -0.0030, 6),
    SYM7: makeSyntheticTrendCandles(180, 60, 0.0025, 7),
    SYM8: makeSyntheticTrendCandles(180, 105, -0.0008, 8),
  };

  const report = runCrossSectionalFactorAudit(cohort, {
    horizons: [1, 5, 10],
    shiftBars: 1,
    targetHorizonDays: 5,
  });

  assert.equal(report.symbolsAnalyzed.length, 8);
  assert.equal(report.antiLookaheadShiftBars, 1);
  assert.match(report.configFingerprint, /^[0-9a-f]{12}$/);
  assert.ok(report.stationaryCount >= 1 && report.stationaryCount <= 35);
  assert.ok(report.commonDatesCount >= 160);
  assert.equal(report.factorRanking.length, 35);

  for (const row of report.factorRanking) {
    assert.ok(Number.isFinite(row.bestIc));
    assert.ok(Number.isFinite(row.bestTStat));
    assert.ok(Number.isFinite(row.bestSpreadPct));
    assert.ok(Number.isFinite(row.adfTStat));
    assert.equal(typeof row.isStationary, 'boolean');
    assert.ok(Number.isFinite(row.tbWinRatePct) && row.tbWinRatePct >= 0 && row.tbWinRatePct <= 100);
    assert.ok(Number.isFinite(row.tbExpectancyR));
    assert.ok(row.byHorizon[5].datesEvaluated > 80);
    assert.ok(row.description.length > 5);
    assert.ok(row.strategyRole.length > 5);
  }

  assert.equal(report.walkForwardMeta.available, true);
  assert.equal(report.walkForwardMeta.featureWeights.length, 35);
  assert.ok(Number.isFinite(report.walkForwardMeta.oosMeanIc));
  assert.ok(Number.isFinite(report.walkForwardMeta.oosBarrierWinRatePct));
  assert.ok(Number.isFinite(report.walkForwardMeta.oosBarrierExpectancyR));

  // Duplication audit covers all 29 items (25 Pine scripts + 4 prompt templates)
  assert.equal(report.overlapAudit.length, 29);
  const ofRow = report.overlapAudit.find((r) => r.factorId === 'orderflow_bar_imbalance');
  const wsaRow = report.overlapAudit.find((r) => r.factorId === 'weinstein_stage_roc');
  const mtnRow = report.overlapAudit.find((r) => r.factorId === 'startup_mountain_alt');
  const volV5Row = report.overlapAudit.find((r) => r.fileName.includes('Volume Spike & Change Detector v5'));
  const tw23Row = report.overlapAudit.find((r) => r.fileName.includes('TradingWie - Auto Fibonacci (V2.3)'));
  const mcdxRow = report.overlapAudit.find((r) => r.factorId === 'mcdx_net_chip_edge');
  const insideRow = report.overlapAudit.find((r) => r.factorId === 'inside_bar_htf_score');
  const ssStratRow = report.overlapAudit.find((r) => r.factorId === 'ss_strat_alignment');
  const stV10Row = report.overlapAudit.find((r) => r.factorId === 'supertrend_v10_prime');
  const volProBatch3Row = report.overlapAudit.find((r) => r.fileName.includes('Paste_November_27__2026_-_1_55PM'));

  assert.equal(ofRow?.status, 'DUPLICATE_EXISTING');
  assert.equal(wsaRow?.status, 'DUPLICATE_EXISTING');
  assert.equal(mtnRow?.status, 'DUPLICATE_EXISTING');
  assert.equal(volV5Row?.status, 'DUPLICATE_EXISTING');
  assert.equal(tw23Row?.status, 'DUPLICATE_EXISTING');
  assert.equal(mcdxRow?.status, 'UNIQUE_NEW');
  assert.equal(insideRow?.status, 'UNIQUE_NEW');
  assert.equal(ssStratRow?.status, 'UNIQUE_NEW');
  assert.equal(stV10Row?.status, 'UNIQUE_NEW');
  assert.equal(volProBatch3Row?.status, 'DUPLICATE_EXISTING');
  assert.equal(
    report.overlapAudit.filter((r) => r.status === 'NON_INDICATOR_PROMPT').length,
    4
  );

  // Preset 1D combinations evaluated cleanly
  assert.equal(report.presetCombinations.length, 10);
  for (const combo of report.presetCombinations) {
    assert.ok(Number.isFinite(combo.meanIc));
    assert.ok(Number.isFinite(combo.icTStat));
    assert.ok(Number.isFinite(combo.q5MinusQ1NetPct));
    assert.ok(Number.isFinite(combo.consensusWinRatePct));
    assert.ok(Number.isFinite(combo.profitFactor));
  }

  // Custom 1D combination tester in both COMPOSITE_RANK & STRICT_CONSENSUS modes
  const customComposite = evaluateIndicatorCombination(
    cohort,
    {
      id: 'custom_test_1',
      name: 'Custom Test Composite',
      description: 'Test composite combo',
      mode: 'COMPOSITE_RANK',
      legs: [
        { factorId: 'ha_ribbon_align', direction: 1 },
        { factorId: 'tw_prev_week_fib_pos', direction: -1 },
      ],
    },
    { horizonDays: 5, factorRanking: report.factorRanking }
  );
  assert.equal(customComposite.legs.length, 2);
  assert.ok(Number.isFinite(customComposite.meanIc));
  assert.ok(Number.isFinite(customComposite.alphaLiftIc));
  assert.ok(customComposite.consensusTradesCount > 0);

  const customStrict = evaluateIndicatorCombination(
    cohort,
    {
      id: 'custom_test_2',
      name: 'Custom Strict Consensus',
      description: 'Test strict AND gate',
      mode: 'STRICT_CONSENSUS',
      consensusZThreshold: 0.4,
      legs: [
        { factorId: 'startup_tango_rsi28', direction: 1 },
        { factorId: 'whalefusion_ptrend', direction: 1 },
      ],
    },
    { horizonDays: 5, factorRanking: report.factorRanking }
  );
  assert.equal(customStrict.mode, 'STRICT_CONSENSUS');
  assert.ok(Number.isFinite(customStrict.meanIc));
  assert.ok(Number.isFinite(customStrict.consensusAvgNetReturnPct));
});

test('runCrossSectionalFactorAudit supports all 9 simulation horizons (1D to 360D) cleanly', () => {
  assert.deepEqual([...SIMULATION_HORIZONS], [1, 5, 10, 30, 50, 100, 120, 200, 360]);

  // 1,300 daily bars (~5+ trading years) across 8 trending/reverting symbols
  const longCohort: Record<string, Candle[]> = {
    SYM1: makeSyntheticTrendCandles(1300, 80, 0.0018, 1),
    SYM2: makeSyntheticTrendCandles(1300, 110, 0.0012, 2),
    SYM3: makeSyntheticTrendCandles(1300, 95, 0.0007, 3),
    SYM4: makeSyntheticTrendCandles(1300, 130, 0.0003, 4),
    SYM5: makeSyntheticTrendCandles(1300, 75, -0.0002, 5),
    SYM6: makeSyntheticTrendCandles(1300, 150, -0.0008, 6),
    SYM7: makeSyntheticTrendCandles(1300, 60, 0.0014, 7),
    SYM8: makeSyntheticTrendCandles(1300, 105, -0.0004, 8),
  };

  const report360 = runCrossSectionalFactorAudit(longCohort, {
    shiftBars: 1,
    targetHorizonDays: 360,
  });

  assert.deepEqual(report360.horizons, [...SIMULATION_HORIZONS]);
  assert.equal(report360.factorRanking.length, 35);

  for (const row of report360.factorRanking) {
    for (const h of SIMULATION_HORIZONS) {
      const m = row.byHorizon[h];
      assert.ok(m, `Missing horizon ${h}D for ${row.factorId}`);
      assert.ok(Number.isFinite(m.meanIc));
      assert.ok(Number.isFinite(m.icTStat));
      assert.ok(Number.isFinite(m.quintileSpreadPct));
      assert.ok(m.datesEvaluated > 800, `Expected >800 dates for ${h}D, got ${m.datesEvaluated}`);
    }
    assert.ok(row.turnoverPct >= 0 && Number.isFinite(row.turnoverPct));
  }

  // Ensure Walk-Forward Purged 70/30 Ridge succeeds at 360D
  assert.equal(report360.walkForwardMeta.targetHorizonDays, 360);
  assert.equal(report360.walkForwardMeta.available, true);
  assert.ok(report360.walkForwardMeta.oosDates >= 10);
  assert.ok(Number.isFinite(report360.walkForwardMeta.oosMeanIc));

  // Ensure preset combos evaluate cleanly at 360D
  assert.equal(report360.presetCombinations.length, 10);
  for (const combo of report360.presetCombinations) {
    assert.equal(combo.horizonDays, 360);
    assert.ok(Number.isFinite(combo.meanIc));
    assert.ok(Number.isFinite(combo.q5MinusQ1NetPct));
  }

  // Guard short cohorts when all 9 horizons (including 360D) are requested
  const shortCohort: Record<string, Candle[]> = {
    A: makeSyntheticTrendCandles(180, 90, 0.002, 1),
    B: makeSyntheticTrendCandles(180, 100, 0.001, 2),
    C: makeSyntheticTrendCandles(180, 110, 0.000, 3),
    D: makeSyntheticTrendCandles(180, 120, -0.001, 4),
    E: makeSyntheticTrendCandles(180, 80, 0.0015, 5),
    F: makeSyntheticTrendCandles(180, 95, -0.0005, 6),
  };
  const shortReport = runCrossSectionalFactorAudit(shortCohort, {
    targetHorizonDays: 5,
  });
  assert.ok(
    shortReport.factorRanking.some((r) => r.turnoverPct > 0),
    'Turnover must still compute on 180-bar cohort even when 360D horizon is included'
  );
  assert.equal(shortReport.factorRanking[0].byHorizon[360].datesEvaluated, 0);
});

test('computeFeatureConfigFingerprint, ADF stationarity, Triple-Barrier SL-before-TP, and synced Python script', () => {
  const fp1 = computeFeatureConfigFingerprint();
  const fp2 = computeFeatureConfigFingerprint();
  assert.equal(fp1, fp2);
  assert.match(fp1, /^[0-9a-f]{12}$/);

  // Stationary mean-reverting AR(1) / sine oscillation vs non-stationary upward drift
  const stationarySeries = Array.from({ length: 160 }, (_, i) => Math.sin(i * 0.6) * 10 + Math.cos(i * 1.1) * 4);
  const driftSeries = Array.from({ length: 160 }, (_, i) => 100 + i * 1.2 + Math.sin(i * 0.15) * 0.5);

  const adfStat = computeAdfStationarityTest(stationarySeries);
  const adfDrift = computeAdfStationarityTest(driftSeries);
  assert.equal(adfStat.stationary, true, `Expected stationary t <= -2.86, got ${adfStat.adfTStat}`);
  assert.ok(adfStat.adfTStat <= -2.86);
  assert.equal(adfDrift.stationary, false, `Expected drift t > -2.86, got ${adfDrift.adfTStat}`);

  // Triple-Barrier (+2R/-1R/15D): verify same-bar SL-before-TP conservative tie-break
  const baseBars: Candle[] = makeSyntheticTrendCandles(40, 100, 0, 1).map((c, idx) => ({
    ...c,
    open: 100,
    high: idx === 25 ? 150 : 100.5, // bar 25 hits BOTH upper (+2*ATR) AND lower (-1*ATR)
    low: idx === 25 ? 50 : 99.5,
    close: 100,
  }));
  const tbTieBreak = computeTripleBarrierSeries(baseBars, 2.0, 1.0, 15, 0.1);
  assert.equal(tbTieBreak[24].label, -1, 'SL must trigger before TP when same bar breaches both');
  assert.ok(tbTieBreak[24].rMultiple < -1.0);
  assert.equal(tbTieBreak[24].barsHeld, 1);

  // Clean TP (+2R) without hitting SL first
  const tpBars: Candle[] = makeSyntheticTrendCandles(40, 100, 0, 1).map((c, idx) => ({
    ...c,
    open: 100,
    high: idx === 25 ? 120 : 100.5,
    low: 99.6,
    close: 100,
  }));
  const tbWin = computeTripleBarrierSeries(tpBars, 2.0, 1.0, 15, 0.1);
  assert.equal(tbWin[24].label, 1);
  assert.ok(tbWin[24].rMultiple > 1.8 && tbWin[24].rMultiple <= 2.0);

  // Synced Python research script must lock fingerprint & avoid broken bxtrender stub
  const py = buildSyncedPythonAlphalensScript(['williams_vix_fix', 'bxtrender_short']);
  assert.ok(py.includes(`CONFIG_FINGERPRINT = '${fp1}'`));
  assert.ok(py.includes('ema(df[\'Close\'], 5) - ema(df[\'Close\'], 20)'));
  assert.ok(py.includes('triple_barrier_labels'));
  assert.ok(py.includes('adfuller'));
});

