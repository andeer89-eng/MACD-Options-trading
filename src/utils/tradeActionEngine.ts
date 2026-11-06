import { Candle, DivergenceSetup } from './trullasStrategy';
import {
  calculateNadarayaWatsonEnvelope,
  calculateSmartMoneyConcepts,
  calculateLuxAlgoOscillatorMatrix,
  calculateLuxAlgoConfluence,
  NadarayaWatsonResult,
  SmartMoneyConceptsResult,
} from './luxalgoIndicators';

export type TradeActionZone =
  | 'STRONG_BUY'
  | 'PRE_BREAKOUT'
  | 'BREAKOUT_CONFIRMED'
  | 'HOLD_PROFIT'
  | 'LATE_TO_BUY'
  | 'SELL_TAKE_PROFIT'
  | 'NEUTRAL_CHOP';

export interface TradeAdvice {
  symbol: string;
  companyName?: string;
  sector?: string;
  currentPrice: number;
  actionZone: TradeActionZone;
  headline: string;
  subAdvice: string;
  confidenceScore: number; // 0 - 100%
  
  // Execution Levels
  triggerPrice: number;
  distanceToTriggerPct: number; // Positive = above trigger, Negative = below trigger
  stopLoss: number;
  target1: number;
  target2: number;
  riskRewardRatio: number;
  
  // Indicator Confluence Checks
  trullasSetup: DivergenceSetup | null;
  luxAlgoConfluenceScore: number;
  nweBandPosition: 'LOWER_DEMAND' | 'UPPER_SUPPLY' | 'INSIDE_CHANNEL';
  smcZone: 'DISCOUNT' | 'PREMIUM' | 'EQUILIBRIUM';
  hasActiveOrderBlock: boolean;
  orderBlockType?: 'BULLISH_OB' | 'BEARISH_OB';
  
  // Action Rationale Bullets
  rationale: string[];
  keyRisks: string[];
  suggestedAction: string;
}

export interface TradeAdviceFilters {
  zones: TradeActionZone[];
  minConfidence: number;
  searchQuery: string;
  sector?: string;
}

export const DEFAULT_TRADE_FILTERS: TradeAdviceFilters = {
  zones: [
    'STRONG_BUY',
    'PRE_BREAKOUT',
    'BREAKOUT_CONFIRMED',
    'HOLD_PROFIT',
    'LATE_TO_BUY',
    'SELL_TAKE_PROFIT',
  ],
  minConfidence: 0,
  searchQuery: '',
};

export function getActionZoneMeta(zone: TradeActionZone): {
  label: string;
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  iconType: 'buy' | 'pre' | 'breakout' | 'hold' | 'warning' | 'sell' | 'neutral';
  shortDesc: string;
} {
  switch (zone) {
    case 'STRONG_BUY':
      return {
        label: 'Strong Buy / Demand',
        badgeBg: 'bg-emerald-500/15',
        badgeBorder: 'border-emerald-500/40',
        textColor: 'text-emerald-400',
        iconType: 'buy',
        shortDesc: 'Prime reversal accumulation in institutional demand zone with verified 3rd wave exhaustion.',
      };
    case 'PRE_BREAKOUT':
      return {
        label: 'Pre-Breakout Coiled',
        badgeBg: 'bg-cyan-500/15',
        badgeBorder: 'border-cyan-500/40',
        textColor: 'text-cyan-400',
        iconType: 'pre',
        shortDesc: 'Price coiled 0.5% - 1.5% beneath neckline trigger with volume dry-up. Set limit orders.',
      };
    case 'BREAKOUT_CONFIRMED':
      return {
        label: 'Breakout Confirmed',
        badgeBg: 'bg-indigo-500/15',
        badgeBorder: 'border-indigo-500/40',
        textColor: 'text-indigo-400',
        iconType: 'breakout',
        shortDesc: 'Neckline breached with MACD histogram acceleration. Enter Tranche 1 (33% size).',
      };
    case 'HOLD_PROFIT':
      return {
        label: 'Hold / Run Profit',
        badgeBg: 'bg-blue-500/15',
        badgeBorder: 'border-blue-500/40',
        textColor: 'text-blue-400',
        iconType: 'hold',
        shortDesc: 'In profit past 23.6% trigger. Move stop to breakeven, trailing towards 61.8% Golden Pocket.',
      };
    case 'LATE_TO_BUY':
      return {
        label: 'Late To Buy / Chase Risk',
        badgeBg: 'bg-amber-500/15',
        badgeBorder: 'border-amber-500/40',
        textColor: 'text-amber-400',
        iconType: 'warning',
        shortDesc: 'Extended past 38.2% target. Risk/Reward degraded. DO NOT FOMO — wait for retest.',
      };
    case 'SELL_TAKE_PROFIT':
      return {
        label: 'Sell / Take Profit',
        badgeBg: 'bg-rose-500/15',
        badgeBorder: 'border-rose-500/40',
        textColor: 'text-rose-400',
        iconType: 'sell',
        shortDesc: 'Reached TP2 (61.8%) / TP3 retest target, or hitting LuxAlgo supply ceiling. Scale out.',
      };
    case 'NEUTRAL_CHOP':
      return {
        label: 'Stand Aside / Chop',
        badgeBg: 'bg-zinc-800/80',
        badgeBorder: 'border-zinc-700',
        textColor: 'text-zinc-400',
        iconType: 'neutral',
        shortDesc: 'No statistical edge. Asset trapped in consolidation channel with neutral momentum.',
      };
  }
}

/**
 * Pure evaluation function that synthesizes David Trullas divergence geometry,
 * Fibonacci targets, LuxAlgo NWE kernel bands, and SMC institutional order blocks into unambiguous trade advice.
 */
export function evaluateTradeAdvice(
  symbol: string,
  candles: Candle[],
  setup: DivergenceSetup | null,
  companyName?: string,
  sector?: string
): TradeAdvice {
  const n = candles.length;
  const lastCandle = candles[n - 1] || { close: 100, high: 100, low: 100, open: 100, volume: 10000 };
  const currentPrice = lastCandle.close;

  // Run LuxAlgo analytics
  const nwe = calculateNadarayaWatsonEnvelope(candles, 8.0, 2.5);
  const smc = calculateSmartMoneyConcepts(candles);
  const confluence = calculateLuxAlgoConfluence(
    symbol,
    candles,
    setup ? setup.type : 'BULLISH_TRIPLE'
  );

  const lastNweUpper = nwe.upper[nwe.upper.length - 1] || currentPrice * 1.05;
  const lastNweLower = nwe.lower[nwe.lower.length - 1] || currentPrice * 0.95;

  let nweBandPosition: 'LOWER_DEMAND' | 'UPPER_SUPPLY' | 'INSIDE_CHANNEL' = 'INSIDE_CHANNEL';
  if (currentPrice <= lastNweLower * 1.015) {
    nweBandPosition = 'LOWER_DEMAND';
  } else if (currentPrice >= lastNweUpper * 0.985) {
    nweBandPosition = 'UPPER_SUPPLY';
  }

  const smcZone = smc.premiumDiscountZone.currentZone;
  const activeBullishOB = smc.activeOrderBlocks.find((ob) => ob.type === 'BULLISH_OB');
  const activeBearishOB = smc.activeOrderBlocks.find((ob) => ob.type === 'BEARISH_OB');

  // If no divergence setup exists, formulate baseline channel advice
  if (!setup) {
    if (nweBandPosition === 'LOWER_DEMAND' && smcZone === 'DISCOUNT') {
      const estimatedTrigger = Number((currentPrice * 1.02).toFixed(2));
      const stop = Number((lastNweLower * 0.98).toFixed(2));
      const tp = Number((currentPrice * 1.06).toFixed(2));
      const rr = Number(((tp - currentPrice) / Math.max(0.1, currentPrice - stop)).toFixed(2));

      return {
        symbol,
        companyName,
        sector,
        currentPrice,
        actionZone: 'STRONG_BUY',
        headline: 'Institutional Accumulation Zone Reached',
        subAdvice: 'Rebound from LuxAlgo NWE lower envelope band inside SMC discount territory.',
        confidenceScore: 68,
        triggerPrice: estimatedTrigger,
        distanceToTriggerPct: Number((((estimatedTrigger - currentPrice) / currentPrice) * 100).toFixed(2)),
        stopLoss: stop,
        target1: Number((currentPrice * 1.035).toFixed(2)),
        target2: tp,
        riskRewardRatio: rr,
        trullasSetup: null,
        luxAlgoConfluenceScore: confluence.confluenceScore,
        nweBandPosition,
        smcZone,
        hasActiveOrderBlock: !!activeBullishOB,
        orderBlockType: activeBullishOB ? 'BULLISH_OB' : undefined,
        rationale: [
          `Priced at LuxAlgo Nadaraya-Watson lower envelope boundary ($${lastNweLower.toFixed(2)})`,
          'Institutional SMC Discount accumulation zone active',
          'Mean-reversion bounce anticipated back toward center yHat curve',
        ],
        keyRisks: [
          'No formal MACD triple divergence confirmed yet on current timeframe',
          'Wait for first green candle close above previous bar high',
        ],
        suggestedAction: 'Scale 25% starter position with strict stop below lower envelope band.',
      };
    }

    if (nweBandPosition === 'UPPER_SUPPLY' || smcZone === 'PREMIUM') {
      return {
        symbol,
        companyName,
        sector,
        currentPrice,
        actionZone: 'SELL_TAKE_PROFIT',
        headline: 'Overextended into Institutional Supply Ceiling',
        subAdvice: 'Asset touching LuxAlgo upper envelope boundary in premium distribution zone.',
        confidenceScore: 70,
        triggerPrice: currentPrice,
        distanceToTriggerPct: 0,
        stopLoss: Number((lastNweUpper * 1.02).toFixed(2)),
        target1: Number((currentPrice * 0.97).toFixed(2)),
        target2: Number((currentPrice * 0.94).toFixed(2)),
        riskRewardRatio: 2.1,
        trullasSetup: null,
        luxAlgoConfluenceScore: confluence.confluenceScore,
        nweBandPosition,
        smcZone,
        hasActiveOrderBlock: !!activeBearishOB,
        orderBlockType: activeBearishOB ? 'BEARISH_OB' : undefined,
        rationale: [
          `Tested LuxAlgo upper envelope ($${lastNweUpper.toFixed(2)})`,
          'Trading in SMC Premium Distribution territory',
          'Oscillator momentum displaying topping divergence',
        ],
        keyRisks: [
          'Strong trend breakouts can ride upper envelope bands during hyper-momentum',
        ],
        suggestedAction: 'Trim 50% profits, tighten trailing stops to previous candle lows.',
      };
    }

    return {
      symbol,
      companyName,
      sector,
      currentPrice,
      actionZone: 'NEUTRAL_CHOP',
      headline: 'Mid-Channel Consolidation (Stand Aside)',
      subAdvice: 'Asset oscillating within neutral equilibrium. No high-probability edge detected.',
      confidenceScore: 40,
      triggerPrice: currentPrice,
      distanceToTriggerPct: 0,
      stopLoss: Number((currentPrice * 0.97).toFixed(2)),
      target1: Number((currentPrice * 1.02).toFixed(2)),
      target2: Number((currentPrice * 1.04).toFixed(2)),
      riskRewardRatio: 1.0,
      trullasSetup: null,
      luxAlgoConfluenceScore: 45,
      nweBandPosition: 'INSIDE_CHANNEL',
      smcZone: 'EQUILIBRIUM',
      hasActiveOrderBlock: false,
      rationale: [
        'MACD histogram shows flat consolidation with no divergence signal',
        'Price located between Nadaraya-Watson regression boundaries',
      ],
      keyRisks: ['Entering here exposes capital to random chop with low risk/reward ratio'],
      suggestedAction: 'Keep on scanner watchlist and wait for 3rd-wave MACD divergence alert.',
    };
  }

  // --- WE HAVE AN ACTIVE TRULLAS SETUP ---
  const isBull = setup.type.includes('BULLISH');
  const trigger = setup.triggerPrice;
  const stop = setup.stopLoss;
  const tp1 = setup.targets.tp1;
  const tp2 = setup.targets.tp2;
  const tp3 = setup.targets.tp3;

  const distanceToTriggerPct = Number((((currentPrice - trigger) / trigger) * 100).toFixed(2));
  const rawRR = Math.abs(tp2 - trigger) / Math.max(0.1, Math.abs(trigger - stop));
  const riskRewardRatio = Number(rawRR.toFixed(2));

  // Determine specific Action Zone
  let actionZone: TradeActionZone;
  let headline = '';
  let subAdvice = '';
  let rationale: string[] = [];
  let keyRisks: string[] = [];
  let suggestedAction = '';
  let confidence = Math.max(setup.qualityScore, confluence.confluenceScore);

  if (isBull) {
    // 1. Check if already near or beyond TP2 / TP3 (Take Profit / Sell)
    if (currentPrice >= tp2 * 0.99) {
      actionZone = 'SELL_TAKE_PROFIT';
      headline = 'Take Profit Target 2 Tagged (61.8% Golden Pocket)';
      subAdvice = 'Full David Trullas divergence expansion achieved. Lock in core profits.';
      suggestedAction = 'Liquidate Tranche 1 & 2 (66% total). Leave 34% runner with stop at TP1.';
      rationale = [
        `Reached Target 2 Golden Pocket ($${tp2.toFixed(2)}) from trigger ($${trigger.toFixed(2)})`,
        'Reward profile exhausted, high probability of corrective wave 4 retrace',
      ];
      keyRisks = ['Giving back open gains if hold through reversal pullbacks'];
    }
    // 2. Check if between TP1 and TP2 (Late to Buy)
    else if (currentPrice >= tp1 * 1.01) {
      actionZone = 'LATE_TO_BUY';
      headline = 'Late to Buy — Chase Warning Active';
      subAdvice = 'Asset already +38.2% extended above breakout trigger. Unfavorable R:R.';
      suggestedAction = 'DO NOT FOMO BUY. Wait for pullbacks to retest trigger level ($' + trigger.toFixed(2) + ').';
      rationale = [
        `Price is $${currentPrice.toFixed(2)}, well above initial breakout trigger of $${trigger.toFixed(2)}`,
        `Current remaining upside to TP2 ($${tp2.toFixed(2)}) is smaller than downside stop ($${stop.toFixed(2)})`,
        'Trullas 4-Pillars strategy prohibits entering after Target 1 is crossed',
      ];
      keyRisks = ['Entering late exposes positions to immediate mean-reversion retests'];
    }
    // 3. Check if freshly broken out (Breakout Confirmed: 0% to +1.5% above trigger)
    else if (currentPrice >= trigger && currentPrice < trigger * 1.025) {
      actionZone = 'BREAKOUT_CONFIRMED';
      headline = 'Neckline Breakout Validated (23.6% Trigger)';
      subAdvice = 'Price has freshly crossed breakout neckline with active MACD bullish slope.';
      suggestedAction = 'Deploy Tranche 1 allocation (33% of position size). Stop placed at $' + stop.toFixed(2) + '.';
      rationale = [
        `Active breach above $${trigger.toFixed(2)} trigger level`,
        `Favorable 1:${riskRewardRatio} Risk/Reward to TP2 ($${tp2.toFixed(2)})`,
        'MACD histogram flipped positive with confirmed volume divergence',
      ];
      keyRisks = ['Watch for false wick breakout: keep initial stop strictly at $' + stop.toFixed(2)];
      confidence = Math.min(100, confidence + 5);
    }
    // 4. Check if running in profit between breakout and TP1 (Hold / Run Profit)
    else if (currentPrice >= trigger * 1.025 && currentPrice < tp1) {
      actionZone = 'HOLD_PROFIT';
      headline = 'Hold Long Position — In Profit Moving to Target 1';
      subAdvice = 'Trade working smoothly. Trail stop to breakeven or trigger level.';
      suggestedAction = 'Hold position. Move protective stop to entry trigger ($' + trigger.toFixed(2) + ') for risk-free run.';
      rationale = [
        `Trading between trigger ($${trigger.toFixed(2)}) and TP1 ($${tp1.toFixed(2)})`,
        'Bullish trend continuation intact toward Golden Pocket ($' + tp2.toFixed(2) + ')',
      ];
      keyRisks = ['Mid-run chop: avoid prematurely cutting winners before TP1'];
    }
    // 5. Check if within 0.5% - 2.0% beneath trigger (Pre-Breakout Coiled)
    else if (currentPrice >= trigger * 0.98 && currentPrice < trigger) {
      actionZone = 'PRE_BREAKOUT';
      headline = 'Pre-Breakout Coiled Setup (Immediate Radar)';
      subAdvice = `Only ${Math.abs(distanceToTriggerPct)}% below trigger level. Volume compression preceding breakout.`;
      suggestedAction = 'Prepare order ticket. Place buy-stop at $' + trigger.toFixed(2) + ' or buy 20% starter pre-market.';
      rationale = [
        `Compression bar forming directly beneath 23.6% Fibonacci neckline ($${trigger.toFixed(2)})`,
        '3rd-wave MACD trough exhaustion fully formed and locked',
        'High likelihood of impulsive breakout within next 1-3 bars',
      ];
      keyRisks = ['Trigger must be crossed to confirm trend confirmation'];
      confidence = Math.min(100, confidence + 8);
    }
    // 6. Deep in reversal demand zone before trigger (Strong Buy / Accumulate)
    else {
      actionZone = 'STRONG_BUY';
      headline = 'Deep Reversal Accumulation Zone (Maximum R:R)';
      subAdvice = 'Exhaustion trough bottomed with massive risk/reward ratio to breakout targets.';
      suggestedAction = 'Accumulate starter position (33%) near lower support. Upside to TP2 is 1:' + riskRewardRatio + ' R:R.';
      rationale = [
        `David Trullas 4-Pillars Triple Divergence confirmed with ${setup.qualityScore}% score`,
        `Tight stop at $${stop.toFixed(2)} provides outstanding asymmetry to TP2 ($${tp2.toFixed(2)})`,
        nweBandPosition === 'LOWER_DEMAND'
          ? 'Aligned with LuxAlgo Nadaraya-Watson lower envelope boundary'
          : 'SMC Discount Accumulation zone verified',
      ];
      keyRisks = ['Requires patience as neckline trigger is still being approached'];
    }
  } else {
    // --- BEARISH DIVERGENCE SETUP ---
    if (currentPrice <= tp2 * 1.01) {
      actionZone = 'SELL_TAKE_PROFIT';
      headline = 'Bearish Short Target 2 Tagged (61.8% Golden Pocket)';
      subAdvice = 'Full bearish divergence downward extension reached. Cover short positions.';
      suggestedAction = 'Cover 66% short position. Protect remaining with tight stop.';
      rationale = [`Reached Bearish Target 2 ($${tp2.toFixed(2)})`];
      keyRisks = ['Oversold bounce risk after tagging 61.8% extension'];
    } else if (currentPrice <= tp1 * 0.99) {
      actionZone = 'LATE_TO_BUY';
      headline = 'Late to Short — Downside Extended';
      subAdvice = 'Short expansion already completed past TP1. Do not short the bottom.';
      suggestedAction = 'Do not open fresh short positions. Wait for bear flag pullback.';
      rationale = [`Price ($${currentPrice.toFixed(2)}) is extended below trigger ($${trigger.toFixed(2)})`];
      keyRisks = ['Short squeeze risk on oversold bounces'];
    } else if (currentPrice <= trigger && currentPrice > trigger * 0.975) {
      actionZone = 'BREAKOUT_CONFIRMED';
      headline = 'Bearish Breakdown Confirmed Below Trigger';
      subAdvice = 'Neckline support broken down. Short tranche 1 validated.';
      suggestedAction = 'Enter short Tranche 1 with stop at $' + stop.toFixed(2) + '.';
      rationale = [`Breakdown below $${trigger.toFixed(2)} confirmed by MACD histogram slope`];
      keyRisks = ['Bull trap recovery above neckline'];
    } else if (currentPrice <= trigger * 0.975 && currentPrice > tp1) {
      actionZone = 'HOLD_PROFIT';
      headline = 'Hold Short — In Profit Moving Toward TP1';
      subAdvice = 'Downward momentum accelerating. Trail stop to entry trigger.';
      suggestedAction = 'Hold short. Trail stop to $' + trigger.toFixed(2) + '.';
      rationale = ['Bearish divergence playing out toward Golden Pocket'];
      keyRisks = ['Trail stop to protect open paper gains'];
    } else if (currentPrice <= trigger * 1.02 && currentPrice > trigger) {
      actionZone = 'PRE_BREAKOUT';
      headline = 'Pre-Breakdown Setup (Imminent Drop)';
      subAdvice = `Hovering ${Math.abs(distanceToTriggerPct)}% above breakdown neckline trigger.`;
      suggestedAction = 'Prepare short limit/stop orders at $' + trigger.toFixed(2) + '.';
      rationale = ['Testing 23.6% neckline breakdown support from above'];
      keyRisks = ['Must break $' + trigger.toFixed(2) + ' to trigger breakdown'];
    } else {
      actionZone = 'STRONG_BUY';
      headline = 'Bearish Distribution Exhaustion Peak';
      subAdvice = 'Top exhaustion peak confirmed. Prime R:R short entry at resistance.';
      suggestedAction = 'Scale short near upper peak stop $' + stop.toFixed(2) + '.';
      rationale = ['Bearish triple divergence at peak with high R:R'];
      keyRisks = ['Keep hard stop at $' + stop.toFixed(2)];
    }
  }

  return {
    symbol,
    companyName,
    sector,
    currentPrice,
    actionZone,
    headline,
    subAdvice,
    confidenceScore: confidence,
    triggerPrice: trigger,
    distanceToTriggerPct,
    stopLoss: stop,
    target1: tp1,
    target2: tp2,
    riskRewardRatio,
    trullasSetup: setup,
    luxAlgoConfluenceScore: confluence.confluenceScore,
    nweBandPosition,
    smcZone,
    hasActiveOrderBlock: isBull ? !!activeBullishOB : !!activeBearishOB,
    orderBlockType: isBull
      ? activeBullishOB
        ? 'BULLISH_OB'
        : undefined
      : activeBearishOB
      ? 'BEARISH_OB'
      : undefined,
    rationale,
    keyRisks,
    suggestedAction,
  };
}

/**
 * Filter list of trade advice objects based on user criteria.
 */
export function filterTradeAdviceList(
  list: TradeAdvice[],
  filters: TradeAdviceFilters
): TradeAdvice[] {
  if (!list || list.length === 0) return [];
  const query = filters.searchQuery.trim().toUpperCase();

  return list.filter((item) => {
    // 1. Zone filter
    if (filters.zones.length > 0 && !filters.zones.includes(item.actionZone)) {
      return false;
    }

    // 2. Minimum Confidence
    if (filters.minConfidence > 0 && item.confidenceScore < filters.minConfidence) {
      return false;
    }

    // 3. Sector
    if (filters.sector && filters.sector !== 'ALL' && item.sector !== filters.sector) {
      return false;
    }

    // 4. Query
    if (query) {
      const matchSym = item.symbol.toUpperCase().includes(query);
      const matchName = item.companyName ? item.companyName.toUpperCase().includes(query) : false;
      const matchHead = item.headline.toUpperCase().includes(query);
      if (!matchSym && !matchName && !matchHead) {
        return false;
      }
    }

    return true;
  });
}
