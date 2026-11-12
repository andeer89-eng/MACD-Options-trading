/* =====================================================================
   TRULLAS Master Plan v3 — Core Definitions, Settings, Levels & canTrade()
   Strictly deterministic, zero Math.random(), anti look-ahead.
   ===================================================================== */

import { ENGINE_VERSION } from './trullasOutcomeEngine';

export type DataQuality = 'live' | 'cached' | 'estimated';

export type BotStateMode = 'paper' | 'live';
export type BotStateStatus = 'armed' | 'paused' | 'killed';

export type RegimeBandName = 'Risk-off' | 'Neutral' | 'Risk-on' | 'Extins';

export interface RegimeBand {
  name: RegimeBandName;
  minScore: number;
  maxScore: number;
  sizeMultiplier: number;
  minSetupScore: number;
  policyText: string;
  color: string;
  badgeCls: 'r' | 'a' | 'g' | 'v';
}

export const REGIME_BANDS: RegimeBand[] = [
  {
    name: 'Risk-off',
    minScore: 0,
    maxScore: 30,
    sizeMultiplier: 0,
    minSetupScore: 75,
    policyText: 'Fără intrări noi long; setup-urile long sunt blocate de regim; short doar la scor ≥ 75',
    color: '#f87171',
    badgeCls: 'r',
  },
  {
    name: 'Neutral',
    minScore: 30,
    maxScore: 60,
    sizeMultiplier: 0.5,
    minSetupScore: 75,
    policyText: 'Sizing ×0,5 · Scor setup ≥ 75',
    color: '#fbbf24',
    badgeCls: 'a',
  },
  {
    name: 'Risk-on',
    minScore: 60,
    maxScore: 85,
    sizeMultiplier: 1.0,
    minSetupScore: 60,
    policyText: 'Sizing ×1,0 · Scor setup ≥ 60',
    color: '#4ade80',
    badgeCls: 'g',
  },
  {
    name: 'Extins',
    minScore: 85,
    maxScore: 101,
    sizeMultiplier: 0.75,
    minSetupScore: 70,
    policyText: 'Sizing ×0,75 · Scor ≥ 70 · Stop-uri strânse (risc de reversal)',
    color: '#a78bfa',
    badgeCls: 'v',
  },
];

export function getRegimeBand(score: number): RegimeBand {
  for (const b of REGIME_BANDS) {
    if (score < b.maxScore) return b;
  }
  return REGIME_BANDS[3];
}

/* =====================================================================
   SETTINGS — Dynamic Capital and Risk Configuration (§1)
   No hardcoded EQUITY0 = 2000! All dollar figures derive dynamically.
   ===================================================================== */
export interface MasterPlanSettings {
  simCapitalUsd: number;       // default: $2,000 (bot_state.sim_capital_usd)
  maxRiskPerTradePct: number;  // default: 1.0% (bot_state.max_risk_per_trade_pct)
  dailyLossLimitPct: number;   // default: 2.0%
  maxSectorExposurePct: number;// default: 30.0%
  dataQuality: DataQuality;    // 'live' | 'cached' | 'estimated'
  botStatus: BotStateStatus;   // 'armed' | 'paused' | 'killed'
  activeEpochId: string;       // default: 'epoch-2k-virtual'
}

const STORAGE_KEYS = {
  SETTINGS: 'trullas_settings_v3',
  SIM_CAPITAL: 'trullas_sim_capital_v3',
  SIM_RISK: 'trullas_sim_risk_pct_v3',
  WATCHLISTS: 'trullas_watchlists_v1',
  ACTIVE_WATCHLIST_ID: 'trullas_active_watchlist_id_v1',
  AUTO_PORTFOLIO: 'trullas_automated_portfolio_v1',
  OPTIONS_PORTFOLIO: 'rich_sp500_options_portfolio_v1',
  TRADE_JOURNAL: 'trullas_trade_journal_v1',
  RISK_SETTINGS: 'trullas_risk_settings_v1',
};

export const DEFAULT_SETTINGS: MasterPlanSettings = {
  simCapitalUsd: 2000,
  maxRiskPerTradePct: 1.0,
  dailyLossLimitPct: 2.0,
  maxSectorExposurePct: 30.0,
  dataQuality: 'live',
  botStatus: 'armed',
  activeEpochId: 'epoch-2k-virtual',
};

let currentSettings: MasterPlanSettings = { ...DEFAULT_SETTINGS };
const settingsListeners = new Set<(s: MasterPlanSettings) => void>();

export function loadSettings(): MasterPlanSettings {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        const cap = localStorage.getItem(STORAGE_KEYS.SIM_CAPITAL);
        const rsk = localStorage.getItem(STORAGE_KEYS.SIM_RISK);
        if (cap) currentSettings.simCapitalUsd = Number(cap) || 2000;
        if (rsk) currentSettings.maxRiskPerTradePct = Number(rsk) || 1.0;
      }
    }
  } catch (err) {
    console.warn('Failed to load settings from storage, using defaults:', err);
  }
  return { ...currentSettings };
}

export function saveSettings(updated: Partial<MasterPlanSettings>): MasterPlanSettings {
  currentSettings = { ...currentSettings, ...updated };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(currentSettings));
      localStorage.setItem(STORAGE_KEYS.SIM_CAPITAL, String(currentSettings.simCapitalUsd));
      localStorage.setItem(STORAGE_KEYS.SIM_RISK, String(currentSettings.maxRiskPerTradePct));
    }
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
  settingsListeners.forEach((cb) => cb({ ...currentSettings }));
  return { ...currentSettings };
}

export function subscribeSettings(cb: (s: MasterPlanSettings) => void): () => void {
  settingsListeners.add(cb);
  cb({ ...currentSettings });
  return () => settingsListeners.delete(cb);
}

export function getRiskUsd(settings: MasterPlanSettings = currentSettings): number {
  return (settings.simCapitalUsd * settings.maxRiskPerTradePct) / 100;
}

/* =====================================================================
   Export / Import JSON of the 6 LocalStorage keys (§2 P0 item 2)
   ===================================================================== */
export function exportMasterPlanBackup(): string {
  const backup: Record<string, any> = {
    _schemaVersion: 'trullas-v3',
    _exportedAt: new Date().toISOString(),
    settings: currentSettings,
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    for (const [k, key] of Object.entries(STORAGE_KEYS)) {
      try {
        const val = localStorage.getItem(key);
        if (val) backup[k] = JSON.parse(val);
      } catch {
        backup[k] = localStorage.getItem(key);
      }
    }
  }
  return JSON.stringify(backup, null, 2);
}

export function importMasterPlanBackup(jsonStr: string): { success: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || (parsed._schemaVersion !== 'trullas-v3' && !parsed.settings)) {
      return { success: false, message: 'Invalid or incompatible backup format.' };
    }
    if (parsed.settings) {
      saveSettings(parsed.settings);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      for (const [k, key] of Object.entries(STORAGE_KEYS)) {
        if (parsed[k] !== undefined) {
          const val = typeof parsed[k] === 'string' ? parsed[k] : JSON.stringify(parsed[k]);
          localStorage.setItem(key, val);
        }
      }
    }
    return { success: true, message: 'Configuration successfully imported.' };
  } catch (err: any) {
    return { success: false, message: `Import error: ${err?.message || err}` };
  }
}

/* =====================================================================
   LEVELS OBJECT — Master Plan v3 Annex B
   Single source of truth consumed by Chart, Watchlist, Bot & Journal
   ===================================================================== */
export interface Levels {
  symbol: string;
  timeframe: '1w' | '1d' | '1h';
  asOf: string;
  engineVersion: string;
  dataQuality: DataQuality;
  direction: 'long' | 'short';
  entryZone: { lo: number; hi: number };
  trigger: number;
  stop: { price: number; basis: 'structure' | 'atr'; atr14: number };
  targets: { price: number; rMultiple: number }[];
  invalidation: { price: number; rule: string };
  riskPerUnit: number;
  rr: number;
  stopTooWide: boolean; // > 3×ATR
  anchors: { kind: 'earnings' | 'gap' | 'stage_pivot'; ts: string; avwap: number }[];
  stageBounds: { ma30: number; ma150: number };
  sr: { lo: number; hi: number }[];
  markers: { ts: string; kind: 'BUY' | 'REVERSAL'; pivotTs: string; confirmedTs: string }[];
}

export interface CalculateLevelsParams {
  symbol: string;
  timeframe?: '1w' | '1d' | '1h';
  direction: 'long' | 'short';
  currentPrice: number;
  atr14: number;
  recentBars: { o: number; h: number; l: number; c: number; ts?: string }[];
  dataQuality?: DataQuality;
  asOf?: string;
  ma30?: number;
  ma150?: number;
}

export function calculateLevels(p: CalculateLevelsParams): Levels {
  const tf = p.timeframe || '1d';
  const d = p.direction === 'long' ? 1 : -1;
  const dq = p.dataQuality || currentSettings.dataQuality;

  // Entry zone: ±0.4% around current price
  const loZone = p.direction === 'long' ? p.currentPrice * 0.996 : p.currentPrice * 0.994;
  const hiZone = p.direction === 'long' ? p.currentPrice * 1.006 : p.currentPrice * 1.004;
  const midEntry = (loZone + hiZone) / 2;

  // Stop loss determination (structural low vs 1.5×ATR)
  const lastBars = p.recentBars.slice(-10);
  let stopPrice = 0;
  let basis: 'structure' | 'atr' = 'structure';

  if (p.direction === 'long') {
    const structuralLow = lastBars.length
      ? Math.min(...lastBars.map((b) => b.l))
      : midEntry - 1.5 * p.atr14;
    const atrStop = midEntry - 1.5 * p.atr14;
    stopPrice = Math.min(structuralLow, atrStop);
    basis = structuralLow <= atrStop ? 'structure' : 'atr';
  } else {
    const structuralHigh = lastBars.length
      ? Math.max(...lastBars.map((b) => b.h))
      : midEntry + 1.5 * p.atr14;
    const atrStop = midEntry + 1.5 * p.atr14;
    stopPrice = Math.max(structuralHigh, atrStop);
    basis = structuralHigh >= atrStop ? 'structure' : 'atr';
  }

  const riskPerUnit = Math.abs(midEntry - stopPrice);
  const stopTooWide = riskPerUnit > 3 * p.atr14;

  // Targets
  const tp1 = midEntry + d * Math.max(2 * riskPerUnit, 2 * p.atr14);
  const tp2 = midEntry + d * Math.max(3 * riskPerUnit, 3.5 * p.atr14);
  const rr = riskPerUnit > 0 ? Math.abs(tp1 - midEntry) / riskPerUnit : 0;

  // Invalidation level
  const invalidationPrice = p.direction === 'long' ? stopPrice - 0.5 * p.atr14 : stopPrice + 0.5 * p.atr14;

  // S/R levels
  const sr = [
    { lo: midEntry * 0.98, hi: midEntry * 0.985 },
    { lo: midEntry * 1.015, hi: midEntry * 1.02 },
  ];

  const nowIso = p.asOf || new Date().toISOString();

  return {
    symbol: p.symbol,
    timeframe: tf,
    asOf: nowIso,
    engineVersion: ENGINE_VERSION,
    dataQuality: dq,
    direction: p.direction,
    entryZone: { lo: loZone, hi: hiZone },
    trigger: p.direction === 'long' ? hiZone : loZone,
    stop: {
      price: Number(stopPrice.toFixed(2)),
      basis,
      atr14: p.atr14,
    },
    targets: [
      { price: Number(tp1.toFixed(2)), rMultiple: Number(rr.toFixed(1)) },
      { price: Number(tp2.toFixed(2)), rMultiple: Number((rr * 1.5).toFixed(1)) },
    ],
    invalidation: {
      price: Number(invalidationPrice.toFixed(2)),
      rule: p.direction === 'long' ? 'Close below structure stop − 0.5×ATR' : 'Close above structure stop + 0.5×ATR',
    },
    riskPerUnit: Number(riskPerUnit.toFixed(2)),
    rr: Number(rr.toFixed(2)),
    stopTooWide,
    anchors: [
      {
        kind: 'stage_pivot',
        ts: nowIso,
        avwap: Number(midEntry.toFixed(2)),
      },
    ],
    stageBounds: {
      ma30: p.ma30 || midEntry * 0.97,
      ma150: p.ma150 || midEntry * 0.94,
    },
    sr,
    markers: [
      {
        ts: nowIso,
        kind: 'BUY',
        pivotTs: nowIso,
        confirmedTs: nowIso,
      },
    ],
  };
}

/* =====================================================================
   canTrade() — The 10 Gate Checks in EXACT Master Plan v3 Order (§3)
   ===================================================================== */
export interface GateCheck {
  number: number;
  name: string;
  shortName: string;
  ok: boolean;
  detail: string;
}

export interface GateResult {
  allow: boolean;
  sizeMultiplier: number;
  suggestedQty: number;
  checks: GateCheck[];
  fails: GateCheck[];
}

export interface CanTradeContext {
  symbol: string;
  direction: 'long' | 'short';
  sector?: string;
  strategyState?: 'active' | 'paused';
  setupScore: number;
  levels: Levels;
  currentPrice: number;
  marketOpenOverride?: boolean;
  dailyLossPct?: number;
  currentSectorExposurePct?: number;
  workerHeartbeatMinutesAgo?: number;
  isOptions?: boolean;
  optionsLiquidityOk?: boolean;
  regimeScore?: number;
  customSettings?: MasterPlanSettings;
}

/**
 * Checks if the NYSE regular market session is currently open (9:30 AM - 4:00 PM ET on business days).
 */
export function isNyseMarketOpen(now: Date = new Date()): { isOpen: boolean; sessionName: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts: Record<string, string> = {};
    formatter.formatToParts(now).forEach((p) => {
      parts[p.type] = p.value;
    });

    const wk = parts.weekday;
    const mins = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);

    if (wk === 'Sat' || wk === 'Sun') {
      return { isOpen: false, sessionName: 'ÎNCHIS (Weekend)' };
    }

    if (mins >= 570 && mins < 960) {
      return { isOpen: true, sessionName: 'REGULAR' };
    } else if (mins >= 240 && mins < 570) {
      return { isOpen: false, sessionName: 'PREMARKET' };
    } else if (mins >= 960 && mins < 1200) {
      return { isOpen: false, sessionName: 'AFTERHOURS' };
    }
    return { isOpen: false, sessionName: 'ÎNCHIS' };
  } catch {
    return { isOpen: true, sessionName: 'REGULAR (Fallback)' };
  }
}

export function canTrade(ctx: CanTradeContext): GateResult {
  const settings = ctx.customSettings || currentSettings;
  const checks: GateCheck[] = [];

  // Check 1: Calendar NYSE deschis
  const marketSession = isNyseMarketOpen();
  const sessionOk = ctx.marketOpenOverride !== undefined ? ctx.marketOpenOverride : marketSession.isOpen;
  checks.push({
    number: 1,
    name: 'Calendar NYSE deschis',
    shortName: 'calendar',
    ok: sessionOk,
    detail: sessionOk ? `${marketSession.sessionName} (Deschis)` : `${marketSession.sessionName} (Piață închisă)`,
  });

  // Check 2: Date LIVE și proaspete
  const isDataLive = settings.dataQuality === 'live' && ctx.levels.dataQuality === 'live';
  checks.push({
    number: 2,
    name: 'Date LIVE și proaspete',
    shortName: 'date',
    ok: isDataLive,
    detail: isDataLive ? 'LIVE' : settings.dataQuality.toUpperCase(),
  });

  // Check 3: Kill switch armat + stare bot ≠ paused/killed
  const isBotArmed = settings.botStatus === 'armed';
  checks.push({
    number: 3,
    name: 'Kill switch armat & Stare Bot',
    shortName: 'bot_state',
    ok: isBotArmed,
    detail: settings.botStatus === 'armed' ? 'ARMAT' : settings.botStatus === 'paused' ? 'PAUZĂ' : 'KILLED',
  });

  // Check 4: Pierdere zilnică sub limită
  const dailyLoss = ctx.dailyLossPct || 0;
  const isLossOk = Math.abs(dailyLoss) < settings.dailyLossLimitPct;
  checks.push({
    number: 4,
    name: 'Pierdere zilnică sub limită',
    shortName: 'daily_loss',
    ok: isLossOk,
    detail: `${dailyLoss.toFixed(1)}% / limită ${settings.dailyLossLimitPct.toFixed(1)}%`,
  });

  // Check 5: Expunere pe sector sub plafon
  const sectorExp = ctx.currentSectorExposurePct || 0;
  const isSectorOk = sectorExp <= settings.maxSectorExposurePct;
  checks.push({
    number: 5,
    name: 'Expunere sector sub plafon',
    shortName: 'sector_exposure',
    ok: isSectorOk,
    detail: `${sectorExp.toFixed(1)}% / plafon ${settings.maxSectorExposurePct.toFixed(1)}% (${ctx.sector || 'N/A'})`,
  });

  // Check 6: Strategia nu e în pauză
  const isStratActive = ctx.strategyState !== 'paused';
  checks.push({
    number: 6,
    name: 'Strategie activă',
    shortName: 'strategy',
    ok: isStratActive,
    detail: isStratActive ? 'Activă' : 'În pauză (tripwire)',
  });

  // Check 9 (Calculated early for Sizing check 7): Politica de regim
  const regScore = ctx.regimeScore !== undefined ? ctx.regimeScore : 70;
  const band = getRegimeBand(regScore);
  const isDirectionAllowed = !(band.name === 'Risk-off' && ctx.direction === 'long');
  const isScoreAboveThreshold = ctx.setupScore >= band.minSetupScore;
  const isRegimeOk = isDirectionAllowed && isScoreAboveThreshold && band.sizeMultiplier > 0;
  const sizeMultiplier = isRegimeOk ? band.sizeMultiplier : 0;

  // Check 7: Regula de mărime minimă (din capitalul curent din Settings!)
  const allocatedCapital = settings.simCapitalUsd;
  const maxRiskPerTrade = (allocatedCapital * settings.maxRiskPerTradePct) / 100;
  const unitRisk = ctx.levels.riskPerUnit;

  let suggestedQty = 0;
  let sizeOk = false;
  let sizeDetail = '';

  if (ctx.levels.stopTooWide) {
    sizeOk = false;
    sizeDetail = '0 buc. (Stop prea larg > 3×ATR)';
  } else if (unitRisk <= 0) {
    sizeOk = false;
    sizeDetail = '0 buc. (Risc unitar invalid)';
  } else {
    suggestedQty = Math.floor((maxRiskPerTrade * (sizeMultiplier || 1.0)) / unitRisk);
    if (suggestedQty >= 1) {
      sizeOk = true;
      sizeDetail = `${suggestedQty} buc. (Risc total $${(suggestedQty * unitRisk).toFixed(2)} ≤ max $${maxRiskPerTrade.toFixed(2)})`;
    } else {
      sizeOk = false;
      sizeDetail = `1 lot riscă $${unitRisk.toFixed(2)} > max $${maxRiskPerTrade.toFixed(2)} (${settings.maxRiskPerTradePct}% din $${allocatedCapital}) → skip:size`;
    }
  }

  checks.push({
    number: 7,
    name: 'Regula de mărime minimă (1 lot ≤ risc alocat)',
    shortName: 'size_min',
    ok: sizeOk,
    detail: sizeDetail,
  });

  // Check 8: Lichiditate opțiuni
  const isOptions = ctx.isOptions || false;
  const optOk = !isOptions || (ctx.optionsLiquidityOk ?? true);
  checks.push({
    number: 8,
    name: 'Lichiditate opțiuni',
    shortName: 'options_liq',
    ok: optOk,
    detail: isOptions ? (optOk ? 'OI ≥ 100, spread ≤ 10%' : 'Ilichid') : 'n/a — Acțiuni',
  });

  // Append Check 9 (Politica de regim)
  checks.push({
    number: 9,
    name: 'Politică de regim (Regime Band)',
    shortName: 'regime_policy',
    ok: isRegimeOk,
    detail: `${band.name} (${regScore}): ${
      !isDirectionAllowed
        ? 'Long blocat în Risk-off'
        : `Scor ${ctx.setupScore} ${isScoreAboveThreshold ? '≥' : '<'} ${band.minSetupScore}`
    }`,
  });

  // Check 10: Heartbeat worker în limită (< 10 min)
  const hbMin = ctx.workerHeartbeatMinutesAgo || 3;
  const isHbOk = hbMin < 10;
  checks.push({
    number: 10,
    name: 'Heartbeat worker',
    shortName: 'heartbeat',
    ok: isHbOk,
    detail: `${hbMin} min / limită 10 min`,
  });

  const fails = checks.filter((c) => !c.ok);

  return {
    allow: fails.length === 0,
    sizeMultiplier: fails.length === 0 ? sizeMultiplier : 0,
    suggestedQty: fails.length === 0 ? suggestedQty : 0,
    checks,
    fails,
  };
}
