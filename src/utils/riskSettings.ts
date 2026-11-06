import { DivergenceSetup } from './trullasStrategy';

export interface RiskSettings {
  accountEquity: number;
  fixedRiskPercent: number; // e.g. 1.0 = 1%
  maxPortfolioLeverage: number; // e.g. 1.5 = 150% equity cap
  maxPositionCapDollar: number; // Absolute max dollar cap per trade
  maxRiskDollarCap: number; // Absolute max dollar risk allowed per trade
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  accountEquity: 25000,
  fixedRiskPercent: 1.0,
  maxPortfolioLeverage: 1.5,
  maxPositionCapDollar: 15000,
  maxRiskDollarCap: 1000,
};

const STORAGE_KEY = 'trullas_risk_settings_v1';

export function loadRiskSettings(): RiskSettings {
  if (typeof window === 'undefined') return DEFAULT_RISK_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RISK_SETTINGS;
    return { ...DEFAULT_RISK_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load risk settings:', e);
    return DEFAULT_RISK_SETTINGS;
  }
}

export function saveRiskSettings(settings: RiskSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save risk settings:', e);
  }
}

export interface PositionSizeResult {
  entryPrice: number;
  stopLossPrice: number;
  stopLossDistance: number; // |Entry - SL|
  stopLossPercent: number; // % distance
  calculatedDollarRisk: number; // Min(Account * Risk%, RiskCap)
  recommendedShares: number;
  totalPositionValue: number;
  portfolioWeightPercent: number;
  isLeverageCapped: boolean;
  isPositionCapApplied: boolean;
  tranche1Shares: number;
  tranche2Shares: number;
  tranche3Shares: number;
  projectedProfitTP1: number;
  projectedProfitTP2: number;
  projectedProfitTP3: number;
}

export function computePositionSizeFromSetup(
  setup: DivergenceSetup,
  settings: RiskSettings
): PositionSizeResult {
  const isBull = setup.type.includes('BULLISH');
  const entryPrice = setup.triggerPrice;
  const stopLossPrice = setup.stopLoss;

  const stopLossDistance = Math.max(0.01, Math.abs(entryPrice - stopLossPrice));
  const stopLossPercent = Number(((stopLossDistance / entryPrice) * 100).toFixed(2));

  // 1. Calculate Risk Budget
  const rawRiskDollar = settings.accountEquity * (settings.fixedRiskPercent / 100);
  const calculatedDollarRisk = Math.min(rawRiskDollar, settings.maxRiskDollarCap);

  // 2. Shares based on Stop Loss Distance
  const rawSharesFromRisk = Math.floor(calculatedDollarRisk / stopLossDistance);

  // 3. Apply Portfolio Leverage & Max Position Cap
  const maxAllowedPositionDollar = Math.min(
    settings.accountEquity * settings.maxPortfolioLeverage,
    settings.maxPositionCapDollar
  );

  const rawSharesFromCap = Math.floor(maxAllowedPositionDollar / entryPrice);

  const recommendedShares = Math.max(
    1,
    Math.min(rawSharesFromRisk, rawSharesFromCap)
  );

  const totalPositionValue = Number((recommendedShares * entryPrice).toFixed(2));
  const portfolioWeightPercent = Number(
    ((totalPositionValue / settings.accountEquity) * 100).toFixed(1)
  );

  const isLeverageCapped = rawSharesFromCap < rawSharesFromRisk;
  const isPositionCapApplied = totalPositionValue >= settings.maxPositionCapDollar;

  // 3-Tranche Scaling
  const tranche1Shares = Math.floor(recommendedShares * 0.33);
  const tranche2Shares = Math.floor(recommendedShares * 0.33);
  const tranche3Shares = recommendedShares - tranche1Shares - tranche2Shares;

  // Projected Profits ($)
  const tp1 = setup.targets.tp1;
  const tp2 = setup.targets.tp2;
  const tp3 = setup.targets.tp3;

  const projectedProfitTP1 = Number((Math.abs(tp1 - entryPrice) * recommendedShares).toFixed(2));
  const projectedProfitTP2 = Number((Math.abs(tp2 - entryPrice) * recommendedShares).toFixed(2));
  const projectedProfitTP3 = Number((Math.abs(tp3 - entryPrice) * recommendedShares).toFixed(2));

  return {
    entryPrice,
    stopLossPrice,
    stopLossDistance: Number(stopLossDistance.toFixed(2)),
    stopLossPercent,
    calculatedDollarRisk: Number(calculatedDollarRisk.toFixed(2)),
    recommendedShares,
    totalPositionValue,
    portfolioWeightPercent,
    isLeverageCapped,
    isPositionCapApplied,
    tranche1Shares,
    tranche2Shares,
    tranche3Shares,
    projectedProfitTP1,
    projectedProfitTP2,
    projectedProfitTP3,
  };
}
