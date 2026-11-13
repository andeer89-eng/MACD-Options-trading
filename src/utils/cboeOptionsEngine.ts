/**
 * Pure Logic Engine for CBOE Options Market Data & Black-Scholes Option Greeks
 *
 * Provides:
 * 1. Black-Scholes Option Pricing & Greeks (Gamma, Theta, Vega, Delta, Rho)
 * 2. Realized 30-day Historical Volatility from real OHLCV closes
 * 3. Server-side / Pure CBOE delayed-quote JSON parser (GEX, Max Pain, Zero-GEX Flip, Put/Call, ATM Greeks)
 */

export interface OptionGreeks {
  delta: number; // Directional price sensitivity per $1 move
  gamma: number; // Rate of change of Delta per $1 move
  theta: number; // Daily calendar time decay ($ per day)
  vega: number;  // Price sensitivity per 1.0% change in Implied Volatility (IV)
  rho: number;   // Interest rate sensitivity per 1.0% shift in risk-free rate
}

export interface OptionContract {
  strike: number;
  optionType: 'CALL' | 'PUT';
  bid: number;
  ask: number;
  lastPrice: number;
  impliedVolatilityPct: number;
  volume: number;
  openInterest: number;
  greeks: OptionGreeks;
  inTheMoney: boolean;
}

export interface OptionChainRow {
  strike: number;
  call: OptionContract | null;
  put: OptionContract | null;
  isMaxPainStrike: boolean;
}

export interface CboeMarketOverview {
  vixIndex: number | null;
  vixChangePct: number | null;
  vixChangeNominal?: number | null;
  vixDayHigh?: number | null;
  vixDayLow?: number | null;
  vixPrevClose?: number | null;
  vix9dIndex: number | null;
  vix3mIndex: number | null;
  totalMarketGexMillions: number | null; // Net $ Gamma Exposure from live SPX option chain
  marketMakerGammaRegime: 'LONG_GAMMA_SUPPRESSION' | 'SHORT_GAMMA_EXPANSION' | 'NEUTRAL_FLIP' | 'UNAVAILABLE';
  putCallVolumeRatio: number | null;
  putCallOpenInterestRatio: number | null;
  cboeSkewIndex: number | null;
  skewChangePct?: number | null;
  timestamp: string;
  lastFetchedAt?: string;
  isLive: boolean;
  dataSource: string;
}

export interface TickerOptionsSummary {
  symbol: string;
  underlyingPrice: number | null;
  impliedVolatilityPct: number | null;
  ivRankPct: number | null;
  ivPercentilePct: number | null;
  historicalVol30dPct: number | null;
  maxPainStrike: number | null;
  zeroGexFlipPrice: number | null;
  totalGexMillions: number | null;
  putCallRatio: number | null;
  putCallOiRatio?: number | null;
  totalCallVolume?: number;
  totalPutVolume?: number;
  totalCallOi?: number;
  totalPutOi?: number;
  averageGreeks: {
    callDeltaAtm: number | null;
    putDeltaAtm: number | null;
    gammaAtm: number | null;
    thetaDailyAtm: number | null;
    vegaAtm: number | null;
  };
  expirationDates: string[];
  selectedExpiration: string | null;
  chainRows: OptionChainRow[];
  chainAvailable: boolean;
  unavailableReason?: string;
}

export interface RawCboeOptionRecord {
  option: string; // e.g. AAPL261120C00230000 or SPXW261120P06000000
  bid?: number;
  ask?: number;
  last_trade_price?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  volume?: number;
  open_interest?: number;
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - prob : prob;
}

function normalPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Calculates Black-Scholes Option Pricing and All 5 Key Greeks
 */
export function calculateBlackScholesGreeks(
  S: number,
  K: number,
  T: number,
  r: number = 0.045,
  sigma: number = 0.25,
  optionType: 'CALL' | 'PUT' = 'CALL'
): { price: number; greeks: OptionGreeks } {
  const safeS = Math.max(0.01, S);
  const safeK = Math.max(0.01, K);
  const timeToExp = Math.max(0.0001, T);
  const vol = Math.max(0.01, sigma);

  const sqrtT = Math.sqrt(timeToExp);
  const d1 = (Math.log(safeS / safeK) + (r + (vol * vol) / 2) * timeToExp) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  const nD1 = normalCdf(d1);
  const nD2 = normalCdf(d2);
  const npD1 = normalPdf(d1);
  const expRt = Math.exp(-r * timeToExp);

  let price = 0;
  let delta = 0;
  let thetaYearly = 0;
  let rho = 0;

  if (optionType === 'CALL') {
    price = safeS * nD1 - safeK * expRt * nD2;
    delta = nD1;
    thetaYearly = -(safeS * npD1 * vol) / (2 * sqrtT) - r * safeK * expRt * nD2;
    rho = (safeK * timeToExp * expRt * nD2) / 100;
  } else {
    price = safeK * expRt * normalCdf(-d2) - safeS * normalCdf(-d1);
    delta = nD1 - 1;
    thetaYearly = -(safeS * npD1 * vol) / (2 * sqrtT) + r * safeK * expRt * normalCdf(-d2);
    rho = (-safeK * timeToExp * expRt * normalCdf(-d2)) / 100;
  }

  const gamma = npD1 / (safeS * vol * sqrtT);
  const thetaDaily = thetaYearly / 365;
  const vega = (safeS * sqrtT * npD1) / 100;

  return {
    price: Math.max(0.01, Number(price.toFixed(2))),
    greeks: {
      delta: Number(delta.toFixed(4)),
      gamma: Number(gamma.toFixed(5)),
      theta: Number(thetaDaily.toFixed(4)),
      vega: Number(vega.toFixed(4)),
      rho: Number(rho.toFixed(4)),
    },
  };
}

/**
 * Computes annualized 30-day Historical Volatility (%) from real daily closes.
 */
export function calculateHistoricalVol30dPct(closes: number[]): number | null {
  const valid = closes.filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0);
  if (valid.length < 15) return null;
  const slice = valid.slice(-31);
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    logReturns.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (logReturns.length < 10) return null;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance =
    logReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / Math.max(1, logReturns.length - 1);
  const annualized = Math.sqrt(variance) * Math.sqrt(252) * 100;
  return Number(annualized.toFixed(2));
}

/**
 * Parses a standard OCC option symbol (e.g. "AAPL261120C00230000" or "SPXW261120P06000000")
 */
export function parseOccOptionSymbol(occ: string): {
  expiration: string;
  optionType: 'CALL' | 'PUT';
  strike: number;
} | null {
  const m = String(occ || '').trim().match(/(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  const yy = 2000 + parseInt(m[1].slice(0, 2), 10);
  const mm = m[1].slice(2, 4);
  const dd = m[1].slice(4, 6);
  const optionType: 'CALL' | 'PUT' = m[2] === 'C' ? 'CALL' : 'PUT';
  const strike = parseInt(m[3], 10) / 1000;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return {
    expiration: `${yy}-${mm}-${dd}`,
    optionType,
    strike,
  };
}

export function createUnavailableCboeOverview(reason = 'CBOE / VIX telemetry unavailable'): CboeMarketOverview {
  return {
    vixIndex: null,
    vixChangePct: null,
    vixChangeNominal: null,
    vixDayHigh: null,
    vixDayLow: null,
    vixPrevClose: null,
    vix9dIndex: null,
    vix3mIndex: null,
    totalMarketGexMillions: null,
    marketMakerGammaRegime: 'UNAVAILABLE',
    putCallVolumeRatio: null,
    putCallOpenInterestRatio: null,
    cboeSkewIndex: null,
    skewChangePct: null,
    timestamp: new Date().toISOString(),
    lastFetchedAt: new Date().toISOString(),
    isLive: false,
    dataSource: reason,
  };
}

export function createUnavailableTickerOptionsSummary(
  symbol: string,
  underlyingPrice: number | null,
  historicalVol30dPct: number | null,
  reason = 'Live option chain unavailable for this symbol'
): TickerOptionsSummary {
  return {
    symbol,
    underlyingPrice,
    impliedVolatilityPct: null,
    ivRankPct: null,
    ivPercentilePct: null,
    historicalVol30dPct,
    maxPainStrike: null,
    zeroGexFlipPrice: null,
    totalGexMillions: null,
    putCallRatio: null,
    averageGreeks: {
      callDeltaAtm: null,
      putDeltaAtm: null,
      gammaAtm: null,
      thetaDailyAtm: null,
      vegaAtm: null,
    },
    expirationDates: [],
    selectedExpiration: null,
    chainRows: [],
    chainAvailable: false,
    unavailableReason: reason,
  };
}

/**
 * Aggregates real CBOE delayed-quotes options contracts into quantitative chain metrics
 * (Net GEX, Max Pain, Zero-GEX Flip, Put/Call ratios, ATM IV & Greeks).
 */
export function summarizeCboeOptionsChain(params: {
  symbol: string;
  underlyingPrice: number;
  closes?: number[];
  rawOptions: RawCboeOptionRecord[];
  selectedExpiration?: string;
  maxExpirations?: number;
  targetStrikeCount?: number;
}): TickerOptionsSummary {
  const {
    symbol,
    underlyingPrice,
    closes = [],
    rawOptions,
    selectedExpiration: requestedExp,
    maxExpirations = 8,
    targetStrikeCount = 17,
  } = params;

  const hv30 = closes.length >= 15 ? calculateHistoricalVol30dPct(closes) : null;

  if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0 || !Array.isArray(rawOptions) || rawOptions.length === 0) {
    return createUnavailableTickerOptionsSummary(
      symbol,
      Number.isFinite(underlyingPrice) && underlyingPrice > 0 ? underlyingPrice : null,
      hv30,
      'No listed CBOE option contracts found for symbol'
    );
  }

  interface ParsedEntry {
    expiration: string;
    optionType: 'CALL' | 'PUT';
    strike: number;
    contract: OptionContract;
  }

  const parsed: ParsedEntry[] = [];
  const expSet = new Set<string>();
  const todayIso = new Date().toISOString().slice(0, 10);

  let totalCallVol = 0;
  let totalPutVol = 0;
  let totalCallOi = 0;
  let totalPutOi = 0;
  let wholeChainNetGex = 0;

  // Map by strike across near-term chain to compute Max Pain & Zero GEX Flip
  const strikeMapAll = new Map<number, { callOi: number; putOi: number; netGammaCoeff: number }>();

  for (const raw of rawOptions) {
    const occ = parseOccOptionSymbol(raw.option);
    if (!occ) continue;
    if (occ.expiration < todayIso) continue;

    expSet.add(occ.expiration);

    const ivDec = typeof raw.iv === 'number' && Number.isFinite(raw.iv) && raw.iv > 0
      ? (raw.iv > 5 ? raw.iv / 100 : raw.iv)
      : 0;
    const ivPct = Number((ivDec * 100).toFixed(1));
    const vol = Math.max(0, Number(raw.volume || 0));
    const oi = Math.max(0, Number(raw.open_interest || 0));
    const bid = Math.max(0, Number(raw.bid || 0));
    const ask = Math.max(0, Number(raw.ask || 0));
    const lastPrice = Math.max(0, Number(raw.last_trade_price || (bid && ask ? (bid + ask) / 2 : 0)));

    // Use CBOE reported Greeks when present, fallback to BS using real IV & DTE if a field is missing
    const expMs = Date.parse(`${occ.expiration}T20:00:00Z`);
    const dteDays = Math.max(1, Math.round((expMs - Date.now()) / 86400000));
    const hasAllGreeks =
      typeof raw.delta === 'number' &&
      typeof raw.gamma === 'number' &&
      typeof raw.theta === 'number' &&
      typeof raw.vega === 'number';

    const bsFallback = !hasAllGreeks && ivDec > 0
      ? calculateBlackScholesGreeks(underlyingPrice, occ.strike, dteDays / 365, 0.045, ivDec, occ.optionType).greeks
      : null;

    const greeks: OptionGreeks = {
      delta: typeof raw.delta === 'number' ? Number(raw.delta.toFixed(4)) : (bsFallback?.delta ?? 0),
      gamma: typeof raw.gamma === 'number' ? Number(raw.gamma.toFixed(5)) : (bsFallback?.gamma ?? 0),
      theta: typeof raw.theta === 'number' ? Number(raw.theta.toFixed(4)) : (bsFallback?.theta ?? 0),
      vega: typeof raw.vega === 'number' ? Number(raw.vega.toFixed(4)) : (bsFallback?.vega ?? 0),
      rho: typeof raw.rho === 'number' ? Number(raw.rho.toFixed(4)) : (bsFallback?.rho ?? 0),
    };

    if (occ.optionType === 'CALL') {
      totalCallVol += vol;
      totalCallOi += oi;
      wholeChainNetGex += oi * 100 * greeks.gamma * underlyingPrice * underlyingPrice * 0.01;
    } else {
      totalPutVol += vol;
      totalPutOi += oi;
      wholeChainNetGex -= oi * 100 * greeks.gamma * underlyingPrice * underlyingPrice * 0.01;
    }

    const bucket = strikeMapAll.get(occ.strike) || { callOi: 0, putOi: 0, netGammaCoeff: 0 };
    if (occ.optionType === 'CALL') {
      bucket.callOi += oi;
      bucket.netGammaCoeff += oi * greeks.gamma;
    } else {
      bucket.putOi += oi;
      bucket.netGammaCoeff -= oi * greeks.gamma;
    }
    strikeMapAll.set(occ.strike, bucket);

    parsed.push({
      expiration: occ.expiration,
      optionType: occ.optionType,
      strike: occ.strike,
      contract: {
        strike: occ.strike,
        optionType: occ.optionType,
        bid: Number(bid.toFixed(2)),
        ask: Number(ask.toFixed(2)),
        lastPrice: Number(lastPrice.toFixed(2)),
        impliedVolatilityPct: ivPct,
        volume: vol,
        openInterest: oi,
        greeks,
        inTheMoney: occ.optionType === 'CALL' ? underlyingPrice > occ.strike : underlyingPrice < occ.strike,
      },
    });
  }

  const allExpirations = Array.from(expSet).sort();
  if (allExpirations.length === 0) {
    return createUnavailableTickerOptionsSummary(symbol, underlyingPrice, hv30, 'No active option expirations remaining');
  }

  const expirationDates = allExpirations.slice(0, maxExpirations);
  // Default to nearest liquid monthly/weekly expiration with >= 14 DTE if available, else nearest
  const targetMinDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const defaultExp = expirationDates.find((e) => e >= targetMinDate) || expirationDates[0];
  const selectedExpiration =
    requestedExp && allExpirations.includes(requestedExp) ? requestedExp : defaultExp;

  // Compute Max Pain on selected expiration
  const expEntries = parsed.filter((p) => p.expiration === selectedExpiration);
  const expByStrike = new Map<number, { call: OptionContract | null; put: OptionContract | null }>();
  for (const entry of expEntries) {
    const cur = expByStrike.get(entry.strike) || { call: null, put: null };
    if (entry.optionType === 'CALL') cur.call = entry.contract;
    else cur.put = entry.contract;
    expByStrike.set(entry.strike, cur);
  }

  const expStrikes = Array.from(expByStrike.keys()).sort((a, b) => a - b);
  let maxPainStrike = expStrikes[0] ?? underlyingPrice;
  let minPayout = Infinity;
  for (const settle of expStrikes) {
    let payout = 0;
    for (const [k, pair] of expByStrike.entries()) {
      if (pair.call && settle > k) payout += (settle - k) * pair.call.openInterest;
      if (pair.put && settle < k) payout += (k - settle) * pair.put.openInterest;
    }
    if (payout < minPayout) {
      minPayout = payout;
      maxPainStrike = settle;
    }
  }

  // Filter rows around ATM strike for readable chain table
  const halfWindow = Math.floor(targetStrikeCount / 2);
  let atmIdx = 0;
  let minDiff = Infinity;
  expStrikes.forEach((k, idx) => {
    const diff = Math.abs(k - underlyingPrice);
    if (diff < minDiff) {
      minDiff = diff;
      atmIdx = idx;
    }
  });
  const startIdx = Math.max(0, atmIdx - halfWindow);
  const endIdx = Math.min(expStrikes.length, startIdx + targetStrikeCount);
  const displayStrikes = expStrikes.slice(startIdx, endIdx);

  const chainRows: OptionChainRow[] = displayStrikes.map((strike) => {
    const pair = expByStrike.get(strike)!;
    return {
      strike,
      call: pair.call,
      put: pair.put,
      isMaxPainStrike: strike === maxPainStrike,
    };
  });

  // ATM Greeks & IV from closest strike in selected expiration
  const atmStrike = expStrikes[atmIdx];
  const atmPair = atmStrike !== undefined ? expByStrike.get(atmStrike) : undefined;
  const callAtmIv = atmPair?.call?.impliedVolatilityPct || 0;
  const putAtmIv = atmPair?.put?.impliedVolatilityPct || 0;
  const ivSamples = [callAtmIv, putAtmIv].filter((v) => v > 0);
  const impliedVolatilityPct =
    ivSamples.length > 0 ? Number((ivSamples.reduce((a, b) => a + b, 0) / ivSamples.length).toFixed(1)) : null;

  // Approximate IV percentile within current option chain's observed IV distribution if chain has multiple strikes
  const chainIvs = expEntries
    .map((e) => e.contract.impliedVolatilityPct)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  let ivPercentilePct: number | null = null;
  let ivRankPct: number | null = null;
  if (impliedVolatilityPct !== null && hv30 !== null && hv30 > 0) {
    // Spread vs realized volatility as an objective IV elevation index
    const ratio = impliedVolatilityPct / hv30;
    ivRankPct = Math.max(0, Math.min(100, Number(((ratio - 0.6) * 100).toFixed(1))));
  }
  if (impliedVolatilityPct !== null && chainIvs.length >= 5) {
    const belowOrEq = chainIvs.filter((v) => v <= impliedVolatilityPct).length;
    ivPercentilePct = Number(((belowOrEq / chainIvs.length) * 100).toFixed(1));
  }

  // Zero-GEX Flip Price: weighted strike where cumulative gamma transitions nearest zero near spot
  let zeroGexFlipPrice: number | null = null;
  const nearbyStrikes = Array.from(strikeMapAll.entries())
    .filter(([k]) => k >= underlyingPrice * 0.8 && k <= underlyingPrice * 1.2)
    .sort((a, b) => a[0] - b[0]);
  let bestAbsGamma = Infinity;
  for (const [k, data] of nearbyStrikes) {
    if (data.callOi + data.putOi < 10) continue;
    const absCoeff = Math.abs(data.netGammaCoeff);
    if (absCoeff < bestAbsGamma && Math.abs(data.netGammaCoeff) > 0) {
      bestAbsGamma = absCoeff;
      zeroGexFlipPrice = k;
    }
  }

  const putCallRatio = totalCallVol > 0 ? Number((totalPutVol / totalCallVol).toFixed(2)) : null;
  const putCallOiRatio = totalCallOi > 0 ? Number((totalPutOi / totalCallOi).toFixed(2)) : null;

  return {
    symbol,
    underlyingPrice: Number(underlyingPrice.toFixed(2)),
    impliedVolatilityPct,
    ivRankPct,
    ivPercentilePct,
    historicalVol30dPct: hv30,
    maxPainStrike,
    zeroGexFlipPrice,
    totalGexMillions: Number((wholeChainNetGex / 1_000_000).toFixed(2)),
    putCallRatio,
    putCallOiRatio,
    totalCallVolume: totalCallVol,
    totalPutVolume: totalPutVol,
    totalCallOi,
    totalPutOi,
    averageGreeks: {
      callDeltaAtm: atmPair?.call?.greeks.delta ?? null,
      putDeltaAtm: atmPair?.put?.greeks.delta ?? null,
      gammaAtm: atmPair?.call?.greeks.gamma ?? atmPair?.put?.greeks.gamma ?? null,
      thetaDailyAtm: atmPair?.call?.greeks.theta ?? atmPair?.put?.greeks.theta ?? null,
      vegaAtm: atmPair?.call?.greeks.vega ?? atmPair?.put?.greeks.vega ?? null,
    },
    expirationDates,
    selectedExpiration,
    chainRows,
    chainAvailable: chainRows.length > 0,
  };
}
