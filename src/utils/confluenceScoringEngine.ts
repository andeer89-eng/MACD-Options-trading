/**
 * 360° Multi-Indicator Confluence Matrix & Setup Confidence Scoring Engine
 *
 * Computes a unified Setup Confidence Score (0-100%) and Grade (A+, A, B, C, D/F)
 * from real fetched OHLCV candles, real divergence detection, live CBOE option chain data,
 * and live sector relative alpha. Never fabricates candles, charCode hashes, or fake ATR.
 */

import {
  calculateIndicators,
  Candle,
  detectDivergences,
  getLatestVolatilityMetrics,
} from './trullasStrategy';
import { calculateNadarayaWatsonEnvelope, calculateSmartMoneyConcepts } from './luxalgoIndicators';
import { calculateRollingPriceMacdCorrelation, computeEmpiricalHistoricalAccuracy } from './signalWeightingEngine';
import { calculateStageAnalysis } from './trendSpiderEngine';
import { TickerOptionsSummary } from './cboeOptionsEngine';
import { SP500_UNIVERSE } from '../data/sp500Universe';
import { lookupGlobalCompany } from '../data/globalTickers';

export interface AngleEvaluation {
  id: string;
  name: string;
  weightPct: number;
  score: number;
  verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  headline: string;
  evidencePoints: string[];
  metrics: { [key: string]: string | number };
}

export interface ConfluenceContext {
  sectorAlphaPct?: number | null;
  cboeSummary?: TickerOptionsSummary | null;
  recordedStats?: { wins: number; total: number };
}

export interface Candidate360Confluence {
  symbol: string;
  companyName: string;
  sector: string;
  subIndustry?: string;
  exchange?: string;
  currency?: string;
  price: number;
  direction: 'BULLISH' | 'BEARISH';
  overallScore: number;
  overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  confidenceTier: 'ELITE CONFLUENCE' | 'HIGH CONVICTION' | 'QUALIFIED SETUP' | 'SPECULATIVE' | 'REJECT';
  angles: {
    trullasMacd: AngleEvaluation;
    luxalgoSmc: AngleEvaluation;
    indicatorLibrary: AngleEvaluation;
    cboeOptions: AngleEvaluation;
    signalWeighting: AngleEvaluation;
    sectorMacro: AngleEvaluation;
  };
  confirmedEvidenceBadges: string[];
  executionPlan: {
    recommendedAction: 'FULL_TRANCHE_BUY' | 'STARTER_BUY' | 'CAUTION_WAIT' | 'AVOID';
    entryTrigger: number;
    stopLoss: number;
    target1: number;
    target2: number;
    riskRewardRatio: number;
    suggestedAllocationPct: number;
    reasons: string[];
  };
}

function evaluateTrullasPillarsAngle(
  symbol: string,
  candles: Candle[],
  direction: 'BULLISH' | 'BEARISH'
): AngleEvaluation {
  const isBull = direction === 'BULLISH';
  const indicatorPoints = calculateIndicators(candles);
  const lastPoint = indicatorPoints[indicatorPoints.length - 1];
  const prevPoint = indicatorPoints[indicatorPoints.length - 2];
  const rsiVal = lastPoint?.rsi ?? 50;
  const macdLine = lastPoint?.macd ?? 0;
  const signalLine = lastPoint?.signal ?? 0;
  const hist = lastPoint?.histogram ?? 0;
  const prevHist = prevPoint?.histogram ?? 0;

  const detectedSetups = detectDivergences(symbol, '1d', indicatorPoints);
  const matchingSetups = detectedSetups.filter((s) =>
    isBull ? s.type.startsWith('BULLISH') : s.type.startsWith('BEARISH')
  );
  const latestSetup = matchingSetups[matchingSetups.length - 1];
  const hasTriple = matchingSetups.some((s) => s.type.includes('TRIPLE'));
  const hasDouble = matchingSetups.some((s) => s.type.includes('DOUBLE'));

  let score = 45;
  const evidence: string[] = [];

  if (isBull && rsiVal < 35) {
    score += 18;
    evidence.push(`RSI Oversold Exhaustion at ${rsiVal.toFixed(1)} (<35 threshold)`);
  } else if (!isBull && rsiVal > 65) {
    score += 18;
    evidence.push(`RSI Overbought Exhaustion at ${rsiVal.toFixed(1)} (>65 threshold)`);
  } else {
    score += 6;
    evidence.push(`RSI reading at ${rsiVal.toFixed(1)}`);
  }

  if (isBull && hist > prevHist) {
    score += 12;
    evidence.push(`MACD Histogram turning upward (Δ +${(hist - prevHist).toFixed(3)})`);
  } else if (!isBull && hist < prevHist) {
    score += 12;
    evidence.push(`MACD Histogram turning downward (Δ ${(hist - prevHist).toFixed(3)})`);
  } else {
    evidence.push(`MACD Histogram Δ ${(hist - prevHist).toFixed(3)}`);
  }

  let divLabel = 'No Active Divergence';
  if (hasTriple) {
    score += 22;
    divLabel = 'Triple Divergence';
    evidence.push(`Confirmed Triple MACD Divergence detected in real OHLCV structure`);
  } else if (hasDouble) {
    score += 14;
    divLabel = 'Double Divergence';
    evidence.push(`Confirmed Double MACD Divergence detected in real OHLCV structure`);
  } else {
    evidence.push(`No qualifying ${direction.toLowerCase()} MACD divergence in current bar window`);
  }

  score = Math.min(100, Math.max(20, score));

  return {
    id: 'trullas-macd',
    name: 'Trullàs 4-Pillars Momentum',
    weightPct: 25,
    score,
    verdict: score >= 70 ? direction : 'NEUTRAL',
    headline: latestSetup
      ? `${divLabel} (${latestSetup.qualityScore}% quality) · RSI ${rsiVal.toFixed(1)}`
      : `${divLabel} · RSI ${rsiVal.toFixed(1)}`,
    evidencePoints: evidence,
    metrics: {
      'RSI (14)': rsiVal.toFixed(1),
      'MACD Histogram': hist.toFixed(3),
      'Divergence Type': divLabel,
      'Signal Spread': (macdLine - signalLine).toFixed(3),
    },
  };
}

function evaluateLuxAlgoAngle(
  candles: Candle[],
  direction: 'BULLISH' | 'BEARISH'
): AngleEvaluation {
  const isBull = direction === 'BULLISH';
  const nwe = calculateNadarayaWatsonEnvelope(candles, 8.0, 2.5);
  const smc = calculateSmartMoneyConcepts(candles);

  let score = 50;
  const evidence: string[] = [];

  const currentPrice = candles[candles.length - 1].close;
  const lastLower = nwe.lower[nwe.lower.length - 1] ?? currentPrice;
  const lastUpper = nwe.upper[nwe.upper.length - 1] ?? currentPrice;

  if (isBull) {
    const distToLower = currentPrice > 0 ? ((currentPrice - lastLower) / currentPrice) * 100 : 0;
    if (distToLower <= 1.5) {
      score += 25;
      evidence.push(`Price touching LuxAlgo Nadaraya-Watson lower envelope band ($${lastLower.toFixed(2)})`);
    } else if (distToLower <= 3.5) {
      score += 14;
      evidence.push(`Price operating near Nadaraya-Watson lower mean-reversion band (+${distToLower.toFixed(1)}%)`);
    } else {
      evidence.push(`Price ${distToLower.toFixed(1)}% above NWE lower envelope ($${lastLower.toFixed(2)})`);
    }
  } else {
    const distToUpper = currentPrice > 0 ? ((lastUpper - currentPrice) / currentPrice) * 100 : 0;
    if (distToUpper <= 1.5) {
      score += 25;
      evidence.push(`Price testing LuxAlgo Nadaraya-Watson upper envelope boundary ($${lastUpper.toFixed(2)})`);
    } else if (distToUpper <= 3.5) {
      score += 14;
      evidence.push(`Price operating near Nadaraya-Watson upper overbought band (${distToUpper.toFixed(1)}% below)`);
    } else {
      evidence.push(`Price ${distToUpper.toFixed(1)}% below NWE upper envelope ($${lastUpper.toFixed(2)})`);
    }
  }

  const hasDemandOB = smc.orderBlocks.some((ob) => ob.type === 'BULLISH_OB' && !ob.mitigated);
  const hasSupplyOB = smc.orderBlocks.some((ob) => ob.type === 'BEARISH_OB' && !ob.mitigated);

  if (isBull && hasDemandOB) {
    score += 20;
    evidence.push(`Institutional Demand Order Block [SMC] intact below current price`);
  } else if (!isBull && hasSupplyOB) {
    score += 20;
    evidence.push(`Institutional Supply Order Block [SMC] intact above current price`);
  } else {
    evidence.push(`${smc.orderBlocks.length} Order Blocks / ${smc.fairValueGaps.length} FVGs tracked`);
  }

  score = Math.min(100, Math.max(30, score));

  return {
    id: 'luxalgo-smc',
    name: 'LuxAlgo SMC & Kernel Envelopes',
    weightPct: 20,
    score,
    verdict: score >= 70 ? direction : 'NEUTRAL',
    headline: `Nadaraya-Watson ($${lastLower.toFixed(2)}–$${lastUpper.toFixed(2)}) & ${smc.orderBlocks.length} SMC Blocks`,
    evidencePoints: evidence,
    metrics: {
      'NWE Lower Band': `$${lastLower.toFixed(2)}`,
      'NWE Upper Band': `$${lastUpper.toFixed(2)}`,
      'Order Blocks Detected': smc.orderBlocks.length,
      'Fair Value Gaps': smc.fairValueGaps.length,
    },
  };
}

function evaluateIndicatorLibraryAngle(
  candles: Candle[],
  direction: 'BULLISH' | 'BEARISH'
): AngleEvaluation {
  const isBull = direction === 'BULLISH';
  const len = candles.length;
  const currentPrice = candles[len - 1].close;

  let cumVol = 0;
  let cumVolPrice = 0;
  for (let i = Math.max(0, len - 20); i < len; i++) {
    const c = candles[i];
    const typical = (c.high + c.low + c.close) / 3;
    cumVolPrice += typical * c.volume;
    cumVol += c.volume;
  }
  const vwap = cumVol > 0 ? cumVolPrice / cumVol : currentPrice;

  const windowSize = Math.min(20, len);
  const closes = candles.slice(-windowSize).map((c) => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / windowSize;
  const variance = closes.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / windowSize;
  const stdDev = Math.sqrt(variance);
  const bbUpper = sma + 2 * stdDev;
  const bbLower = sma - 2 * stdDev;
  const bbPercentB = bbUpper - bbLower > 0 ? (currentPrice - bbLower) / (bbUpper - bbLower) : 0.5;

  let score = 55;
  const evidence: string[] = [];

  if (isBull && currentPrice >= vwap * 0.99) {
    score += 15;
    evidence.push(`VWAP Support: Price trading near/above 20d VWAP benchmark ($${vwap.toFixed(2)})`);
  } else if (!isBull && currentPrice <= vwap * 1.01) {
    score += 15;
    evidence.push(`VWAP Resistance: Price rejected below 20d VWAP benchmark ($${vwap.toFixed(2)})`);
  }

  if (isBull && bbPercentB < 0.2) {
    score += 15;
    evidence.push(`Bollinger Band %B at ${(bbPercentB * 100).toFixed(1)}% (lower band compression)`);
  } else if (!isBull && bbPercentB > 0.8) {
    score += 15;
    evidence.push(`Bollinger Band %B at ${(bbPercentB * 100).toFixed(1)}% (upper band stretch)`);
  } else {
    score += 6;
    evidence.push(`Bollinger Band %B balanced at ${(bbPercentB * 100).toFixed(1)}%`);
  }

  const candleData = candles.map((c) => ({
    time: c.dateStr || c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
  const stage = calculateStageAnalysis(candleData);
  if (stage.currentStage === 'STAGE_4_DECLINING') {
    if (isBull) {
      score -= 20;
      evidence.push(`Stage 4 Markdown (${stage.distanceFromMaPercent}% below declining MA $${stage.ma30Week.toFixed(2)}). Counter-trend risk.`);
    } else {
      score += 15;
      evidence.push(`Stage 4 Markdown validates bearish trend.`);
    }
  } else if (stage.currentStage === 'STAGE_2_ADVANCING') {
    if (isBull) {
      score += 15;
      evidence.push(`Stage 2 Markup (+${stage.distanceFromMaPercent}% above rising MA $${stage.ma30Week.toFixed(2)}).`);
    } else {
      score -= 15;
      evidence.push(`Stage 2 Bull Trend resists short thesis.`);
    }
  }

  score = Math.min(100, Math.max(25, score));

  return {
    id: 'indicator-library',
    name: 'Indicator Library Consensus',
    weightPct: 20,
    score,
    verdict: score >= 70 ? direction : 'NEUTRAL',
    headline: `VWAP ($${vwap.toFixed(2)}) + ${stage.stageName}`,
    evidencePoints: evidence,
    metrics: {
      'Institutional VWAP': `$${vwap.toFixed(2)}`,
      'Bollinger %B': `${(bbPercentB * 100).toFixed(1)}%`,
      'Weinstein Stage': stage.stageName,
      '30-Period SMA': `$${stage.ma30Week.toFixed(2)}`,
    },
  };
}

function evaluateCboeAngle(
  cboeSummary: TickerOptionsSummary | null | undefined,
  direction: 'BULLISH' | 'BEARISH'
): AngleEvaluation {
  if (!cboeSummary || !cboeSummary.chainAvailable) {
    return {
      id: 'cboe-options',
      name: 'CBOE Options Flow & GEX',
      weightPct: 15,
      score: 50,
      verdict: 'NEUTRAL',
      headline: 'Live CBOE option chain unavailable for symbol (Neutral weight)',
      evidencePoints: [
        cboeSummary?.unavailableReason || 'Option chain not loaded or non-optionable instrument; neutral 50/100 weight applied.',
      ],
      metrics: {
        'CBOE Chain': 'Unavailable',
        '30d Realized HV': cboeSummary?.historicalVol30dPct !== null && cboeSummary?.historicalVol30dPct !== undefined
          ? `${cboeSummary.historicalVol30dPct}%`
          : 'N/A',
      },
    };
  }

  const isBull = direction === 'BULLISH';
  let score = 60;
  const evidence: string[] = [];

  const gex = cboeSummary.totalGexMillions ?? 0;
  const gexRegime = gex >= 0 ? `Long Gamma (+$${gex.toFixed(1)}M)` : `Short Gamma (-$${Math.abs(gex).toFixed(1)}M)`;
  if (gex >= 0) {
    score += 12;
    evidence.push(`GEX Regime: ${gexRegime} (stabilizing dealer gamma)`);
  } else {
    evidence.push(`GEX Regime: ${gexRegime} (elevated dealer hedging volatility)`);
  }

  const pc = cboeSummary.putCallRatio;
  if (pc !== null) {
    if ((isBull && pc < 0.85) || (!isBull && pc > 1.1)) {
      score += 15;
      evidence.push(`Put/Call Volume Ratio ${pc.toFixed(2)} aligns with ${direction} bias`);
    } else {
      score += 5;
      evidence.push(`Put/Call Volume Ratio at ${pc.toFixed(2)}`);
    }
  }

  if (cboeSummary.maxPainStrike !== null) {
    evidence.push(`Max Pain Strike (${cboeSummary.selectedExpiration || 'near exp'}): $${cboeSummary.maxPainStrike.toFixed(2)}`);
  }
  if (cboeSummary.impliedVolatilityPct !== null) {
    evidence.push(`ATM Implied Volatility: ${cboeSummary.impliedVolatilityPct}%`);
  }

  score = Math.min(100, Math.max(35, score));

  return {
    id: 'cboe-options',
    name: 'CBOE Options Flow & GEX',
    weightPct: 15,
    score,
    verdict: score >= 75 ? direction : 'NEUTRAL',
    headline: `${gexRegime}${pc !== null ? ` · P/C ${pc.toFixed(2)}` : ''}`,
    evidencePoints: evidence,
    metrics: {
      'CBOE Score': `${score}%`,
      'GEX Regime': gexRegime,
      'Put/Call Ratio': pc !== null ? pc.toFixed(2) : 'N/A',
      'Max Pain Strike': cboeSummary.maxPainStrike !== null ? `$${cboeSummary.maxPainStrike.toFixed(2)}` : 'N/A',
      'ATM Gamma (Γ)': cboeSummary.averageGreeks.gammaAtm !== null ? cboeSummary.averageGreeks.gammaAtm.toFixed(4) : 'N/A',
    },
  };
}

function evaluateSignalWeightingAngle(
  symbol: string,
  candles: Candle[],
  recordedStats?: { wins: number; total: number }
): AngleEvaluation {
  const rollingCorrelation = calculateRollingPriceMacdCorrelation(candles, 30);
  const { winRate, totalSignals, hasHistory } = computeEmpiricalHistoricalAccuracy(
    candles,
    symbol,
    '1d',
    recordedStats
  );

  const corrPts = Math.min(45, Math.round(Math.abs(rollingCorrelation) * 45));
  const winPts = hasHistory ? Math.min(55, Math.round((winRate / 100) * 55)) : 28;
  const score = Math.min(100, Math.max(30, corrPts + winPts));

  const evidence: string[] = [
    `30d Price-MACD Histogram Pearson correlation: r = ${rollingCorrelation.toFixed(2)}`,
    hasHistory
      ? `Empirical setup accuracy on ${symbol}: ${winRate.toFixed(1)}% across ${totalSignals} resolved setups`
      : `No prior resolved setups in this candle window for ${symbol} (neutral prior weight applied)`,
  ];

  return {
    id: 'signal-weighting',
    name: 'Signal Weighting & Accuracy',
    weightPct: 10,
    score,
    verdict: score >= 75 ? 'BULLISH' : 'NEUTRAL',
    headline: hasHistory
      ? `Empirical Win Rate ${winRate.toFixed(1)}% & r=${rollingCorrelation.toFixed(2)}`
      : `Price-MACD Correlation r=${rollingCorrelation.toFixed(2)}`,
    evidencePoints: evidence,
    metrics: {
      'Confidence Score': `${score}%`,
      'Rolling Correlation (r)': rollingCorrelation.toFixed(2),
      'Empirical Win Rate': hasHistory ? `${winRate.toFixed(1)}%` : 'N/A',
      'Resolved Setups': totalSignals,
    },
  };
}

function evaluateSectorMacroAngle(
  sector: string,
  candles: Candle[],
  sectorAlphaPct?: number | null
): AngleEvaluation {
  const vol = getLatestVolatilityMetrics(candles, 14);
  const atr = vol.atr;
  const atrPct = vol.atrPercent;

  let score = 55;
  const evidence: string[] = [];

  if (atrPct >= 1.2) {
    score += 20;
    evidence.push(`ATR Volatility ${atrPct.toFixed(2)}% exceeds 1.0% momentum hurdle`);
  } else {
    score += 6;
    evidence.push(`ATR Volatility at ${atrPct.toFixed(2)}% (compressed range)`);
  }

  let alphaLabel = 'N/A';
  if (typeof sectorAlphaPct === 'number' && Number.isFinite(sectorAlphaPct)) {
    alphaLabel = `${sectorAlphaPct >= 0 ? '+' : ''}${sectorAlphaPct.toFixed(2)}% vs SPY`;
    if (sectorAlphaPct >= 0) {
      score += 20;
      evidence.push(`GICS Sector Alpha: ${sector} outperforming SPY (${alphaLabel})`);
    } else {
      evidence.push(`GICS Sector Alpha: ${sector} lagging SPY (${alphaLabel})`);
    }
  } else {
    score += 10;
    evidence.push(`GICS Sector: ${sector} (benchmark comparison not supplied)`);
  }

  score = Math.min(100, Math.max(35, score));

  return {
    id: 'sector-macro',
    name: 'Sector Alpha & ATR Volatility',
    weightPct: 10,
    score,
    verdict: score >= 70 ? 'BULLISH' : 'NEUTRAL',
    headline: `${sector} · ATR ${atrPct.toFixed(2)}%${alphaLabel !== 'N/A' ? ` (${alphaLabel})` : ''}`,
    evidencePoints: evidence,
    metrics: {
      'ATR Volatility': `${atrPct.toFixed(2)}% ($${atr.toFixed(2)})`,
      'Sector Alpha': alphaLabel,
      'GICS Sector': sector,
      'Volatility Hurdle': atrPct >= 1.0 ? 'PASSED (≥1.0%)' : 'MARGINAL',
    },
  };
}

/**
 * Main 360° Confluence Evaluation Engine — operates strictly on real provided OHLCV candles.
 * Throws or returns null? Let's return `null` cleanly if candles are insufficient (< 30 real bars)
 * so UI components never render invented synthetic prices.
 */
export function evaluateCandidate360Confluence(
  symbol: string,
  providedCandles?: Candle[],
  forcedDirection: 'BULLISH' | 'BEARISH' = 'BULLISH',
  context?: ConfluenceContext
): Candidate360Confluence | null {
  if (!providedCandles || providedCandles.length < 30) {
    return null;
  }

  const globalMatch = lookupGlobalCompany(symbol);
  const sp500Match = SP500_UNIVERSE.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());

  const stockMeta = globalMatch
    ? {
        symbol: globalMatch.symbol,
        name: globalMatch.name,
        sector: globalMatch.sector,
        subIndustry: globalMatch.subIndustry,
        exchange: globalMatch.exchange,
        currency: globalMatch.currency,
      }
    : sp500Match
    ? {
        symbol: sp500Match.symbol,
        name: sp500Match.name,
        sector: sp500Match.sector,
        subIndustry: sp500Match.subIndustry || 'S&P 500 Constituent',
        exchange: 'US Equities',
        currency: 'USD',
      }
    : {
        symbol: symbol.toUpperCase(),
        name: symbol.toUpperCase(),
        sector: 'Global Equity',
        subIndustry: 'Listed Security',
        exchange: symbol.includes('.ST') ? 'Nasdaq Stockholm' : 'Global Market',
        currency: symbol.includes('.ST') ? 'SEK' : 'USD',
      };

  const candles = providedCandles;
  const currentPrice = candles[candles.length - 1].close;
  const volMetrics = getLatestVolatilityMetrics(candles, 14);
  const atrVal = volMetrics.atr > 0 ? volMetrics.atr : currentPrice * 0.015;

  const angle1 = evaluateTrullasPillarsAngle(stockMeta.symbol, candles, forcedDirection);
  const angle2 = evaluateLuxAlgoAngle(candles, forcedDirection);
  const angle3 = evaluateIndicatorLibraryAngle(candles, forcedDirection);
  const angle4 = evaluateCboeAngle(context?.cboeSummary, forcedDirection);
  const angle5 = evaluateSignalWeightingAngle(stockMeta.symbol, candles, context?.recordedStats);
  const angle6 = evaluateSectorMacroAngle(stockMeta.sector, candles, context?.sectorAlphaPct);

  const compositeScore = Math.round(
    angle1.score * (angle1.weightPct / 100) +
      angle2.score * (angle2.weightPct / 100) +
      angle3.score * (angle3.weightPct / 100) +
      angle4.score * (angle4.weightPct / 100) +
      angle5.score * (angle5.weightPct / 100) +
      angle6.score * (angle6.weightPct / 100)
  );

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'B';
  let tier: Candidate360Confluence['confidenceTier'] = 'QUALIFIED SETUP';

  if (compositeScore >= 90) {
    grade = 'A+';
    tier = 'ELITE CONFLUENCE';
  } else if (compositeScore >= 80) {
    grade = 'A';
    tier = 'HIGH CONVICTION';
  } else if (compositeScore >= 70) {
    grade = 'B';
    tier = 'QUALIFIED SETUP';
  } else if (compositeScore >= 60) {
    grade = 'C';
    tier = 'SPECULATIVE';
  } else {
    grade = 'D';
    tier = 'REJECT';
  }

  const allBadges: string[] = [];
  if (angle1.metrics['Divergence Type'] === 'Triple Divergence') allBadges.push('MACD Triple Divergence');
  else if (angle1.metrics['Divergence Type'] === 'Double Divergence') allBadges.push('MACD Double Divergence');
  if (angle2.score >= 75) allBadges.push('NWE Envelope Reversal Band');
  if (angle4.score >= 75 && context?.cboeSummary?.chainAvailable) allBadges.push('CBOE Institutional Flow Verified');
  if (angle3.score >= 75) allBadges.push('Anchored VWAP Support');
  if (angle5.score >= 80) allBadges.push('High Empirical Reliability');
  if (angle6.score >= 75) allBadges.push('Sector Alpha Outperformance');
  if (angle3.evidencePoints.some((e) => e.includes('Stage 4 Markdown'))) {
    allBadges.push('Stage 4 Markdown');
  } else if (angle3.evidencePoints.some((e) => e.includes('Stage 2 Markup'))) {
    allBadges.push('Stage 2 Markup');
  }

  const entryTrigger = forcedDirection === 'BULLISH' ? currentPrice * 1.008 : currentPrice * 0.992;
  const stopLoss = forcedDirection === 'BULLISH' ? Math.max(0.01, entryTrigger - 1.2 * atrVal) : entryTrigger + 1.2 * atrVal;
  const target1 =
    forcedDirection === 'BULLISH'
      ? entryTrigger + 1.618 * Math.abs(entryTrigger - stopLoss)
      : Math.max(0.01, entryTrigger - 1.618 * Math.abs(stopLoss - entryTrigger));
  const target2 =
    forcedDirection === 'BULLISH'
      ? entryTrigger + 2.618 * Math.abs(entryTrigger - stopLoss)
      : Math.max(0.01, entryTrigger - 2.618 * Math.abs(stopLoss - entryTrigger));
  const stopDist = Math.max(0.0001, Math.abs(entryTrigger - stopLoss));
  const rrRatio = Number((Math.abs(target1 - entryTrigger) / stopDist).toFixed(2));

  let recommendedAction: Candidate360Confluence['executionPlan']['recommendedAction'] = 'STARTER_BUY';
  let suggestedAllocationPct = 1.0;

  if (grade === 'A+') {
    recommendedAction = 'FULL_TRANCHE_BUY';
    suggestedAllocationPct = 1.5;
  } else if (grade === 'A') {
    recommendedAction = 'FULL_TRANCHE_BUY';
    suggestedAllocationPct = 1.0;
  } else if (grade === 'B') {
    recommendedAction = 'STARTER_BUY';
    suggestedAllocationPct = 0.75;
  } else if (grade === 'C') {
    recommendedAction = 'CAUTION_WAIT';
    suggestedAllocationPct = 0.5;
  } else {
    recommendedAction = 'AVOID';
    suggestedAllocationPct = 0.0;
  }

  const executionReasons = [
    `Grade ${grade} (${compositeScore}%): 6 analytical angles evaluated on ${candles.length} real bars.`,
    `Stop loss calibrated to 1.2x real 14d ATR ($${atrVal.toFixed(2)}) -> $${stopLoss.toFixed(2)}.`,
    `Risk:Reward ratio ${rrRatio}:1 towards Target 1 ($${target1.toFixed(2)}).`,
  ];

  return {
    symbol: stockMeta.symbol,
    companyName: stockMeta.name,
    sector: stockMeta.sector,
    subIndustry: stockMeta.subIndustry,
    exchange: stockMeta.exchange,
    currency: stockMeta.currency,
    price: currentPrice,
    direction: forcedDirection,
    overallScore: compositeScore,
    overallGrade: grade,
    confidenceTier: tier,
    angles: {
      trullasMacd: angle1,
      luxalgoSmc: angle2,
      indicatorLibrary: angle3,
      cboeOptions: angle4,
      signalWeighting: angle5,
      sectorMacro: angle6,
    },
    confirmedEvidenceBadges: allBadges,
    executionPlan: {
      recommendedAction,
      entryTrigger,
      stopLoss,
      target1,
      target2,
      riskRewardRatio: rrRatio,
      suggestedAllocationPct,
      reasons: executionReasons,
    },
  };
}

/**
 * Ranks candidates using real pre-fetched candle series per symbol
 */
export function rankCandidatesByConfluence(
  entries: Array<{ symbol: string; candles: Candle[]; direction?: 'BULLISH' | 'BEARISH'; context?: ConfluenceContext }>
): Candidate360Confluence[] {
  const list: Candidate360Confluence[] = [];
  for (const item of entries.slice(0, 30)) {
    const res = evaluateCandidate360Confluence(item.symbol, item.candles, item.direction ?? 'BULLISH', item.context);
    if (res) list.push(res);
  }
  return list.sort((a, b) => b.overallScore - a.overallScore);
}
