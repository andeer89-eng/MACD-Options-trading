import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeterBlocks,
  compactQmxOverlayLabel,
  createPillCollisionPlacer,
  formatOverlayPrice,
  getPrimaryPaneBounds,
  resolveFibPriceLineLabel,
  resolveSetupPriceLineLabels,
  resolveSuperTrendHudLayout,
  resolveVisibleHudDock,
} from './chartOverlayPrimitives.ts';

describe('chartOverlayPrimitives', () => {
  it('buildMeterBlocks clamps percentages and builds accurate unicode blocks', () => {
    assert.deepEqual(buildMeterBlocks(50, 10), {
      filled: '█████',
      empty: '░░░░░',
    });
    assert.deepEqual(buildMeterBlocks(150, 6), {
      filled: '██████',
      empty: '',
    });
    assert.deepEqual(buildMeterBlocks(-20, 6), {
      filled: '',
      empty: '░░░░░░',
    });
    assert.deepEqual(buildMeterBlocks(Number.NaN, 4), {
      filled: '',
      empty: '░░░░',
    });
  });

  it('formatOverlayPrice formats large and small instruments cleanly', () => {
    assert.equal(formatOverlayPrice(null), '—');
    assert.equal(formatOverlayPrice(Number.NaN), '—');
    assert.equal(formatOverlayPrice(351.9123), '351.91');
    assert.equal(formatOverlayPrice(1234.567), '1234.57');
    assert.equal(formatOverlayPrice(0.45123, 4), '0.4512');
    assert.equal(formatOverlayPrice(0.45123, 3), '0.451');
  });

  it('resolveVisibleHudDock switches seamlessly when one or both HUDs are enabled', () => {
    assert.deepEqual(
      resolveVisibleHudDock({
        ofsHudEnabled: false,
        qmxHudEnabled: false,
        preferredHud: 'ofs',
        isExpanded: false,
      }),
      { showSwitcher: false, renderOfsHud: false, renderQmxHud: false }
    );

    assert.deepEqual(
      resolveVisibleHudDock({
        ofsHudEnabled: true,
        qmxHudEnabled: false,
        preferredHud: 'qmx',
        isExpanded: false,
      }),
      { showSwitcher: false, renderOfsHud: true, renderQmxHud: false }
    );

    assert.deepEqual(
      resolveVisibleHudDock({
        ofsHudEnabled: true,
        qmxHudEnabled: true,
        preferredHud: 'qmx',
        isExpanded: false,
      }),
      { showSwitcher: true, renderOfsHud: false, renderQmxHud: true }
    );
  });

  it('createPillCollisionPlacer nudges overlapping pills and rejects crowded duplicates', () => {
    const placer = createPillCollisionPlacer({
      plotWidth: 600,
      paneHeight: 400,
      topMargin: 28,
      bottomMargin: 8,
    });

    const first = placer.tryPlace({
      x: 300,
      y: 200,
      width: 90,
      height: 18,
      align: 'center',
      nudgeOffsets: [0, -22, 22],
    });
    assert.ok(first, 'first pill should be placed');
    assert.equal(first.centerY, 200);

    // Second pill at identical position should nudge vertically instead of overlapping
    const second = placer.tryPlace({
      x: 300,
      y: 200,
      width: 90,
      height: 18,
      align: 'center',
      nudgeOffsets: [0, -22, 22],
    });
    assert.ok(second, 'second pill should nudge to non-overlapping slot');
    assert.equal(second.centerY, 178);

    // Third pill at same position takes +22 downward slot
    const third = placer.tryPlace({
      x: 300,
      y: 200,
      width: 90,
      height: 18,
      align: 'center',
      nudgeOffsets: [0, -22, 22],
    });
    assert.ok(third, 'third pill should take downward slot');
    assert.equal(third.centerY, 222);

    // Fourth pill has no free slot left -> returns null cleanly
    const fourth = placer.tryPlace({
      x: 300,
      y: 200,
      width: 90,
      height: 18,
      align: 'center',
      nudgeOffsets: [0, -22, 22],
    });
    assert.equal(fourth, null);

    // Clamp right-edge pill inside plotWidth
    const edgePill = placer.tryPlace({
      x: 598,
      y: 120,
      width: 80,
      height: 18,
      align: 'center',
      nudgeOffsets: [0],
    });
    assert.ok(edgePill);
    assert.ok(edgePill.leftX + 80 <= 600);
  });

  it('getPrimaryPaneBounds excludes right price scale via paneSize(0) when available', () => {
    const fakeChart = {
      paneSize: (idx?: number) => (idx === 0 ? { width: 740, height: 390 } : { width: 740, height: 90 }),
    } as any;

    assert.deepEqual(getPrimaryPaneBounds(fakeChart, 800, 600), {
      plotWidth: 740,
      paneHeight: 390,
    });
  });

  it('compactQmxOverlayLabel shortens verbose TradingView pill strings without losing key values', () => {
    assert.equal(compactQmxOverlayLabel('zone', 'BSL Zone Strength: 54'), 'BSL · 54');
    assert.equal(compactQmxOverlayLabel('zone', 'SSL Zone Strength: 52'), 'SSL · 52');
    assert.equal(compactQmxOverlayLabel('sweep', 'Bearish Sweep SQ: 71'), 'SWEEP ▼ 71');
    assert.equal(compactQmxOverlayLabel('sweep', 'Bullish Sweep SQ: 64'), 'SWEEP ▲ 64');
    assert.equal(compactQmxOverlayLabel('exhaustion', 'Exhaustion Cloud - Early Bullish Exh · 49'), 'EXH ▲ 49');
    assert.equal(compactQmxOverlayLabel('vacuum', 'VACUUM ▲ FILLED ✓ Entry 345.79 → Exit 346.46'), 'VAC ▲ FILLED');
    assert.equal(compactQmxOverlayLabel('vacuum', 'VACUUM ▼ OPEN Gap 350.00–353.00'), 'VAC ▼ OPEN');
  });

  it('resolveSetupPriceLineLabels and resolveFibPriceLineLabel compact titles when right HUD is active', () => {
    assert.deepEqual(
      resolveSetupPriceLineLabels({
        triggerPrice: 310.5,
        tp1: 325.25,
        tp2: 348.75,
        stopLoss: 295.0,
        compact: true,
      }),
      {
        trigger: 'TRG 23.6%',
        tp1: 'TP1 38.2%',
        tp2: 'TP2 61.8%',
        stopLoss: 'SL',
      }
    );

    assert.deepEqual(
      resolveSetupPriceLineLabels({
        triggerPrice: 310.5,
        tp1: 325.25,
        tp2: 348.75,
        stopLoss: 295.0,
        compact: false,
      }),
      {
        trigger: 'TRIGGER 23.6% ($310.50)',
        tp1: 'TP1 38.2% ($325.25)',
        tp2: 'TP2 GOLDEN 61.8% ($348.75)',
        stopLoss: 'STOP LOSS ($295.00)',
      }
    );

    assert.equal(resolveFibPriceLineLabel('Golden Pocket 61.8%', 335.7, true), 'Fib 61.8%');
    assert.equal(resolveFibPriceLineLabel('Fib 78.6%', 348.2, true), 'Fib 78.6%');
    assert.equal(resolveFibPriceLineLabel('Golden Pocket 61.8%', 335.7, false), 'Golden Pocket 61.8% ($335.70)');
  });

  it('resolveSuperTrendHudLayout clears right-edge price-line lane when setup/fib labels are active', () => {
    const standard = resolveSuperTrendHudLayout({
      totalWidth: 1100,
      plotWidth: 1036,
      paneHeight: 480,
      reservePriceLabelLane: false,
      showTable: true,
      showLegend: true,
    });
    assert.equal(standard.priceLabelLanePx, 0);
    assert.equal(standard.rightOffset, 72);
    assert.equal(standard.effectiveLabelWidth, 842);

    const withSetupLines = resolveSuperTrendHudLayout({
      totalWidth: 1100,
      plotWidth: 1036,
      paneHeight: 480,
      reservePriceLabelLane: true,
      showTable: true,
      showLegend: true,
    });
    assert.equal(withSetupLines.priceLabelLanePx, 96);
    assert.equal(withSetupLines.rightOffset, 168);
    assert.ok(withSetupLines.effectiveLabelWidth < 1036 - 96 - 184);

    // Narrow mobile viewport degrades gracefully without pushing HUD off-screen
    const narrow = resolveSuperTrendHudLayout({
      totalWidth: 370,
      plotWidth: 310,
      paneHeight: 340,
      reservePriceLabelLane: true,
      showTable: true,
      showLegend: false,
    });
    assert.equal(narrow.priceLabelLanePx, 0);
    assert.equal(narrow.rightOffset, 68);
  });
});
