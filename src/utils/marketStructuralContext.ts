/**
 * Multi-Timeframe Market Structural Context Engine
 * Combines:
 *  - Visible/Weekly Volume Profile (HVN Support, LVN Vacuum Pockets, POC, VAH/VAL)
 *  - LuxAlgo Smart Money Concepts (Unmitigated Bullish Order Blocks) & NWE Lower Envelope
 *  - SuperKumo MPro (S/R Zones, Room-to-Target, Trail Stop)
 *  - Volume Spike & Change Detector Pro (MTF Sentiment -10..+10, Churn/Absorption, Weekly/Monthly Delta)
 *
 * Outputs verified Institutional Buy Zones, Volume Gaps (LVN), and regime gating
 * shared across ChartViewer overlays, MarketHealthGaugePanel, Stocks Auto-Bot, and Options Auto-Bot.
 */

import type { Candle } from './trullasStrategy.ts';
import { computeVolumeProfile, VolumeProfileResult } from './volumeProfileEngine.ts';
import {
  calculateNadarayaWatsonEnvelope,
  calculateSmartMoneyConcepts,
} from './luxalgoIndicators.ts';
import { calculateSuperKumoMpro } from './superKumoMpro.ts';
import { calculateVolumeSpikeDetector } from './volumeSpikeDetector.ts';

export type StructuralRegime =
  | 'IN_VOLUME_GAP'
  | 'AT_INSTITUTIONAL_BUY_ZONE'
  | 'BELOW_STRUCTURAL_SUPPORT'
  | 'ABOVE_VALUE_TREND';

export interface InstitutionalBuyZoneBand {
  low: number;
  high: number;
  midpoint: number;
  hvnAnchor: number;
  anchorSources: string[];
  strengthScore: number; // 0..100
  distancePct: number; // positive = spot above zone top, negative = below, 0 = inside
}

export interface VolumeGapBand {
  low: number;
  high: number;
  midpoint: number;
  widthPct: number;
  isSpotInside: boolean;
}

export interface MarketStructuralSummary {
  symbol: string;
  spotPrice: number;
  regime: StructuralRegime;
  institutionalBuyZone: InstitutionalBuyZoneBand | null;
  volumeGaps: VolumeGapBand[];
  activeVolumeGap: VolumeGapBand | null;
  nearestHvnSupport: number | null;
  nearestHvnResistance: number | null;
  poc: number;
  vah: number;
  val: number;
  mtfVolumeSentiment: number; // -10..+10
  volumeSentimentLabel: 'STRONG BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG BEAR';
  isChurnAbsorption: boolean;
  latestVolZScore: number;
  weeklyDeltaChgPct: number | null;
  monthlyDeltaChgPct: number | null;
  superKumoTrend: 'UP' | 'DOWN';
  superKumoRoomUpOk: boolean;
  recommendedPutFloor: number | null;
  summaryBullet: string;
}

export function analyzeMarketStructuralContext(params: {
  symbol: string;
  dailyCandles: Candle[];
  weeklyCandles?: Candle[];
}): MarketStructuralSummary | null {
  const { symbol, dailyCandles, weeklyCandles } = params;
  if (!Array.isArray(dailyCandles) || dailyCandles.length < 15) {
    return null;
  }

  const sortedDaily = [...dailyCandles].sort((a, b) => a.timestamp - b.timestamp);
  const spotPrice = sortedDaily[sortedDaily.length - 1].close;
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) return null;

  // Use Weekly bars when >= 20 weeks exist for macro Volume Profile + NWE Bands, else Daily
  const macroCandles =
    Array.isArray(weeklyCandles) && weeklyCandles.length >= 20
      ? [...weeklyCandles].sort((a, b) => a.timestamp - b.timestamp)
      : sortedDaily;

  const profile: VolumeProfileResult | null = computeVolumeProfile(macroCandles, {
    rows: 48,
    valueAreaPct: 0.7,
  });
  if (!profile) return null;

  const smc = calculateSmartMoneyConcepts(sortedDaily);
  const macroNwe = calculateNadarayaWatsonEnvelope(macroCandles, 8.0, 2.5);
  const nweLowerLatest =
    macroNwe.lower.length > 0 ? macroNwe.lower[macroNwe.lower.length - 1] : null;

  const superKumo = calculateSuperKumoMpro(sortedDaily);
  const volSpike = calculateVolumeSpikeDetector(sortedDaily);

  // 1. Identify HVN Support below/near spot (+2% tolerance); include POC since POC is the #1 volume shelf
  const sortedHvnAsc = Array.from(
    new Set([
      ...profile.hvnLevels,
      ...(profile.poc > 0 ? [profile.poc] : []),
    ])
  ).sort((a, b) => a - b);
  const hvnSupports = sortedHvnAsc
    .filter((lvl) => lvl <= spotPrice * 1.02)
    .sort((a, b) => b - a);
  const hvnResistances = sortedHvnAsc.filter((lvl) => lvl > spotPrice * 1.005);

  const nearestHvnSupport = hvnSupports[0] ?? null;
  const nearestHvnResistance = hvnResistances[0] ?? null;
  const fallbackMacroDemand = sortedHvnAsc[0] ?? (profile.val > 0 ? profile.val : null);

  // 2. Active Bullish Order Blocks near or below spot
  const bullishObs = smc.activeOrderBlocks
    .filter((ob) => ob.type === 'BULLISH_OB' && ob.bottomPrice <= spotPrice * 1.03)
    .sort((a, b) => b.topPrice - a.topPrice);
  const primaryOb = bullishObs[0] ?? null;

  // 3. Construct Institutional Buy Zone from real structural confluences
  const structuralAnchors: number[] = [];
  const anchorSources: string[] = [];

  if (nearestHvnSupport !== null) {
    structuralAnchors.push(nearestHvnSupport);
    anchorSources.push('Weekly/Macro HVN');
  } else if (fallbackMacroDemand !== null) {
    structuralAnchors.push(fallbackMacroDemand);
    anchorSources.push('Macro Value Floor');
  }
  if (profile.val > 0 && (profile.val <= spotPrice * 1.02 || nearestHvnSupport === null)) {
    structuralAnchors.push(profile.val);
    anchorSources.push('VAL 70%');
  }
  if (primaryOb) {
    structuralAnchors.push((primaryOb.bottomPrice + primaryOb.topPrice) / 2);
    anchorSources.push('Bullish OB');
  }
  if (nweLowerLatest !== null && nweLowerLatest > 0 && nweLowerLatest <= spotPrice * 1.03) {
    structuralAnchors.push(nweLowerLatest);
    anchorSources.push('Macro NWE Band');
  }
  if (superKumo.nearestSupport !== null) {
    structuralAnchors.push(superKumo.nearestSupport);
    anchorSources.push('SuperKumo Support');
  }

  let institutionalBuyZone: InstitutionalBuyZoneBand | null = null;
  if (structuralAnchors.length > 0) {
    const hvnAnchor = nearestHvnSupport ?? fallbackMacroDemand ?? structuralAnchors[0];
    // Anchor zone tightly around the HVN/VAL/OB cluster within 5.5% of anchor
    const rawClustered = structuralAnchors.filter(
      (a) => Math.abs(a - hvnAnchor) / Math.max(0.01, hvnAnchor) <= 0.055
    );
    const clustered = rawClustered.length > 0 ? rawClustered : [hvnAnchor];
    const baseLow = Math.min(...clustered);
    const baseHigh = Math.max(...clustered);
    const minBandHalf = Math.max(spotPrice * 0.006, (superKumo.dashboard.atr || spotPrice * 0.01) * 0.45);
    const zoneLow = Number((primaryOb ? Math.min(baseLow, primaryOb.bottomPrice) : baseLow - minBandHalf * 0.5).toFixed(2));
    const zoneHigh = Number(Math.max(zoneLow + minBandHalf, baseHigh + minBandHalf * 0.5).toFixed(2));
    const midpoint = Number(((zoneLow + zoneHigh) / 2).toFixed(2));

    let distancePct = 0;
    if (spotPrice > zoneHigh) {
      distancePct = Number((((spotPrice - zoneHigh) / spotPrice) * 100).toFixed(2));
    } else if (spotPrice < zoneLow) {
      distancePct = Number((((spotPrice - zoneLow) / spotPrice) * 100).toFixed(2));
    }

    const strengthScore = Math.min(
      100,
      35 + anchorSources.length * 14 + (volSpike.dashboard.recentChurn3Bars ? 15 : 0)
    );

    institutionalBuyZone = {
      low: zoneLow,
      high: zoneHigh,
      midpoint,
      hvnAnchor: Number(hvnAnchor.toFixed(2)),
      anchorSources: Array.from(new Set(anchorSources)),
      strengthScore,
      distancePct,
    };
  }

  // 4. Detect contiguous Volume Gaps (LVN Air Pockets = adjacent bins < 45% mean volume)
  const bins = profile.bins;
  const meanBinVol =
    bins.length > 0 ? bins.reduce((s, b) => s + b.volume, 0) / bins.length : 0;
  const lvnThreshold = meanBinVol * 0.45;
  const volumeGaps: VolumeGapBand[] = [];

  if (meanBinVol > 0 && bins.length >= 6) {
    let runStart = -1;
    // Skip extreme top/bottom 2 tail bins to avoid empty wicks counting as mid-structure air pockets
    for (let i = 2; i < bins.length - 2; i++) {
      const isLowVol = bins[i].volume <= lvnThreshold;
      if (isLowVol && runStart === -1) {
        runStart = i;
      } else if ((!isLowVol || i === bins.length - 3) && runStart !== -1) {
        const endIdx = isLowVol && i === bins.length - 3 ? i : i - 1;
        if (endIdx - runStart >= 1) {
          const gapLow = Number(bins[runStart].bottom.toFixed(2));
          const gapHigh = Number(bins[endIdx].top.toFixed(2));
          const mid = Number(((gapLow + gapHigh) / 2).toFixed(2));
          const widthPct = Number((((gapHigh - gapLow) / Math.max(0.01, mid)) * 100).toFixed(2));
          // Only record meaningful structural air pockets (>= 1.2% wide)
          if (widthPct >= 1.2) {
            const isSpotInside = spotPrice >= gapLow && spotPrice <= gapHigh;
            volumeGaps.push({ low: gapLow, high: gapHigh, midpoint: mid, widthPct, isSpotInside });
          }
        }
        runStart = -1;
      }
    }
  }

  const activeVolumeGap = volumeGaps.find((g) => g.isSpotInside) ?? null;

  // 5. Classify Structural Regime
  const insideBuyZone =
    institutionalBuyZone !== null &&
    spotPrice >= institutionalBuyZone.low * 0.995 &&
    spotPrice <= institutionalBuyZone.high * 1.015;

  const belowAllSupport =
    (institutionalBuyZone !== null && spotPrice < institutionalBuyZone.low * 0.99) ||
    (profile.val > 0 && spotPrice < profile.val * 0.985 && nearestHvnSupport === null);

  let regime: StructuralRegime;
  if (insideBuyZone) {
    regime = 'AT_INSTITUTIONAL_BUY_ZONE';
  } else if (activeVolumeGap) {
    regime = 'IN_VOLUME_GAP';
  } else if (belowAllSupport) {
    regime = 'BELOW_STRUCTURAL_SUPPORT';
  } else {
    regime = 'ABOVE_VALUE_TREND';
  }

  const recommendedPutFloor =
    nearestHvnSupport !== null && institutionalBuyZone !== null
      ? institutionalBuyZone.low
      : nearestHvnSupport ?? (profile.val > 0 && profile.val <= spotPrice ? profile.val : null);

  const summaryBullet =
    regime === 'AT_INSTITUTIONAL_BUY_ZONE'
      ? `${symbol} at Institutional Buy Zone ($${institutionalBuyZone!.low.toFixed(2)}–$${institutionalBuyZone!.high.toFixed(2)}) · ${volSpike.dashboard.recentChurn3Bars ? 'Churn absorption active' : `Vol Sent ${volSpike.dashboard.mtfSentimentScore >= 0 ? '+' : ''}${volSpike.dashboard.mtfSentimentScore}/10`}`
      : regime === 'IN_VOLUME_GAP'
        ? `${symbol} inside LVN Volume Gap ($${activeVolumeGap!.low.toFixed(2)}–$${activeVolumeGap!.high.toFixed(2)}, ${activeVolumeGap!.widthPct}% air pocket) — next demand $${institutionalBuyZone?.high.toFixed(2) ?? 'N/A'}`
        : regime === 'BELOW_STRUCTURAL_SUPPORT'
          ? `${symbol} below HVN/VAL floor ($${(institutionalBuyZone?.low ?? profile.val).toFixed(2)}) — defensive posture`
          : `${symbol} holding constructive value ($${profile.val.toFixed(2)}–$${profile.vah.toFixed(2)}) · SuperKumo ${superKumo.dashboard.trend}`;

  return {
    symbol: symbol.toUpperCase(),
    spotPrice: Number(spotPrice.toFixed(2)),
    regime,
    institutionalBuyZone,
    volumeGaps,
    activeVolumeGap,
    nearestHvnSupport: nearestHvnSupport !== null ? Number(nearestHvnSupport.toFixed(2)) : null,
    nearestHvnResistance: nearestHvnResistance !== null ? Number(nearestHvnResistance.toFixed(2)) : null,
    poc: profile.poc,
    vah: profile.vah,
    val: profile.val,
    mtfVolumeSentiment: volSpike.dashboard.mtfSentimentScore,
    volumeSentimentLabel: volSpike.dashboard.sentimentLabel,
    isChurnAbsorption: volSpike.dashboard.isChurn || volSpike.dashboard.recentChurn3Bars,
    latestVolZScore: volSpike.dashboard.zScore,
    weeklyDeltaChgPct: volSpike.dashboard.weekDeltaChgPct,
    monthlyDeltaChgPct: volSpike.dashboard.monthDeltaChgPct,
    superKumoTrend: superKumo.dashboard.trend,
    superKumoRoomUpOk: superKumo.roomUpOk,
    recommendedPutFloor: recommendedPutFloor !== null ? Number(recommendedPutFloor.toFixed(2)) : null,
    summaryBullet,
  };
}
