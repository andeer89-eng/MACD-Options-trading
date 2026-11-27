import type { MultiAssetEvidencePack } from './multiAssetEvidencePack.ts';
import type { AgentAssessment, CommitteeResult } from './multiAgentCommittee.ts';

export type JudgeDisposition = 'APPROVE' | 'REDUCE' | 'REJECT';
export type JudgeAssessment = {
  schemaVersion: '1.0.0';
  packId: string;
  packSha256: string;
  assetClass: 'STOCK' | 'OPTION';
  committeeGeneratedAt: number;
  generatedAt: number;
  disposition: JudgeDisposition;
  summary: string;
  confidence: number;
  sourceRefs: string[];
  conflictDetected: boolean;
  evidenceCompleteness: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';
  riskMultiplier: number;
  reasons: string[];
  stockReview?: { thesisInvalidationReviewed: boolean; fundamentalsReviewed: boolean };
  optionReview?: {
    occSymbol: string;
    expirationDate: string;
    strike: number;
    bidAskSpreadPct: number;
    liquidityReviewed: boolean;
    ivAndGreeksReviewed: boolean;
    assignmentAndExerciseReviewed: boolean;
  };
};
export type JudgeResult = {
  schemaVersion: '1.0.0';
  packId: string;
  assetClass: 'STOCK' | 'OPTION';
  disposition: JudgeDisposition;
  assessment: JudgeAssessment | null;
  riskMultiplierCeiling: number;
  reasons: string[];
  generatedAt: number;
  executionEligible: false;
};
export type JudgeContext = {
  assetClass: 'STOCK' | 'OPTION';
  allowedSourceRefs: string[];
  generatedAt: number;
  riskMultiplierCeiling: number;
  reviewChecklist: string[];
};
export type IndependentJudge = (
  pack: MultiAssetEvidencePack,
  committee: CommitteeResult,
  context: JudgeContext,
) => Promise<unknown>;
export type JudgePolicy = {
  maxStockMarketAgeMs: number;
  maxOptionQuoteAgeMs: number;
  maxOptionSpreadPct: number;
  minOptionOpenInterest: number;
  minOptionVolume: number;
};
const DEFAULT_POLICY: JudgePolicy = {
  maxStockMarketAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxOptionQuoteAgeMs: 2 * 60 * 1000,
  maxOptionSpreadPct: 0.35,
  minOptionOpenInterest: 10,
  minOptionVolume: 1,
};
const ROLES = ['STRATEGIST', 'BULL', 'BEAR', 'RISK'] as const;
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isText);
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function validateCommittee(pack: MultiAssetEvidencePack, committee: CommitteeResult): string[] {
  const failures: string[] = [];
  if (!committee || committee.packId !== pack.packId || committee.assetClass !== pack.assetClass ||
      committee.schemaVersion !== '1.0.0' || committee.executionEligible !== false ||
      committee.decision !== 'ADVANCE_TO_JUDGE' || !Array.isArray(committee.assessments) || !Number.isFinite(committee.generatedAt) ||
      committee.generatedAt < pack.generatedAt || !Number.isFinite(committee.riskMultiplierCeiling) ||
      committee.riskMultiplierCeiling < 0 || committee.riskMultiplierCeiling > 1) {
    failures.push('COMMITTEE_RESULT_NOT_ELIGIBLE_OR_PACK_MISMATCH');
    return failures;
  }
  const allowed = new Set(pack.sources.map((_, i) => 'source:' + i));
  const seen = new Set<string>();
  for (const assessment of committee.assessments ?? []) {
    if (!assessment || !ROLES.includes(assessment.role) || seen.has(assessment.role) ||
        assessment.assetClass !== pack.assetClass || assessment.packSha256 !== pack.canonicalSha256 ||
        assessment.generatedAt !== committee.generatedAt || !isRecord(assessment.finding) ||
        !isText(assessment.finding.summary) || !isStringArray(assessment.finding.sourceRefs) ||
        assessment.finding.sourceRefs.some((ref) => !allowed.has(ref)) ||
        !isStringArray(assessment.finding.risks) ||
        !['BULLISH', 'BEARISH', 'NEUTRAL'].includes(assessment.finding.stance) ||
        typeof assessment.finding.confidence !== 'number' || !Number.isFinite(assessment.finding.confidence) ||
        assessment.finding.confidence < 0 || assessment.finding.confidence > 1) {
      failures.push('INVALID_COMMITTEE_ASSESSMENT');
      continue;
    }
    seen.add(assessment.role);
    if (assessment.role === 'RISK') {
      const controls = assessment.riskControls;
      if (!controls || typeof controls.vetoNewRisk !== 'boolean' ||
          !Number.isFinite(controls.maxRiskMultiplier) || controls.maxRiskMultiplier < 0 ||
          controls.maxRiskMultiplier > 1 || controls.maxRiskMultiplier !== committee.riskMultiplierCeiling) {
        failures.push('INVALID_COMMITTEE_RISK_CONTROLS');
      }
    } else if (assessment.riskControls !== undefined) failures.push('UNAUTHORIZED_ROLE_RISK_CONTROLS');
  }
  if (seen.size !== ROLES.length) failures.push('COMMITTEE_ROLE_SET_INCOMPLETE');
  if (committee.assessments.some((a: AgentAssessment) => a.role === 'RISK' && a.riskControls?.vetoNewRisk)) {
    failures.push('COMMITTEE_RISK_AGENT_VETO');
  }
  if (!pack.risk.allowNewEntries || pack.risk.status === 'HALTED' || pack.risk.status === 'DATA_INVALID') {
    failures.push('DETERMINISTIC_RISK_SNAPSHOT_VETO');
  }
  return failures;
}
function deterministicReview(pack: MultiAssetEvidencePack, now: number, policy: JudgePolicy) {
  const reject: string[] = [];
  const reduce: string[] = [];
  for (const source of pack.sources) {
    if (!Number.isFinite(source.retrievedAt) || source.retrievedAt > pack.generatedAt || source.retrievedAt > pack.asOf) {
      reject.push('SOURCE_TIMESTAMP_OUTSIDE_AS_OF_WINDOW');
      break;
    }
  }
  if (pack.assetClass === 'STOCK') {
    const age = pack.asOf - pack.evidence.market.retrievedAt;
    if (age < 0 || age > policy.maxStockMarketAgeMs) reject.push('STOCK_MARKET_EVIDENCE_STALE');
    if (!pack.evidence.market.candles.length) reject.push('STOCK_MARKET_CANDLES_MISSING');
    if (pack.evidence.fundamentals) {
      for (const fact of pack.evidence.fundamentals.facts) {
        if (fact.filingDate > pack.evidence.fundamentals.asOfDate || fact.filingDate > new Date(pack.asOf).toISOString().slice(0, 10)) {
          reject.push('POINT_IN_TIME_FUNDAMENTAL_VIOLATION');
          break;
        }
      }
    }
  } else {
    const { contract, quote } = pack.evidence;
    const quoteAge = pack.asOf - quote.quoteAt;
    if (quoteAge < 0 || quoteAge > policy.maxOptionQuoteAgeMs) reject.push('OPTION_QUOTE_STALE');
    if (Date.parse(contract.expirationDate + 'T00:00:00.000Z') <= Date.parse(new Date(pack.asOf).toISOString().slice(0, 10) + 'T00:00:00.000Z')) {
      reject.push('OPTION_EXPIRED_OR_EXPIRING_TODAY');
    }
    if (quote.ask <= 0) reject.push('OPTION_ASK_NOT_EXECUTABLE');
    const mid = (quote.bid + quote.ask) / 2;
    const spreadPct = mid > 0 ? (quote.ask - quote.bid) / mid : 1;
    if (spreadPct > policy.maxOptionSpreadPct) reduce.push('OPTION_BID_ASK_SPREAD_TOO_WIDE');
    if (quote.openInterest < policy.minOptionOpenInterest) reduce.push('OPTION_OPEN_INTEREST_BELOW_POLICY');
    if (quote.volume < policy.minOptionVolume) reduce.push('OPTION_VOLUME_BELOW_POLICY');
  }
  if (pack.sources.length === 0) reject.push('EVIDENCE_PROVENANCE_MISSING');
  return { reject, reduce };
}
function validateJudgeOutput(
  value: unknown,
  pack: MultiAssetEvidencePack,
  committee: CommitteeResult,
  generatedAt: number,
  allowed: Set<string>,
): JudgeAssessment | null {
  if (!isRecord(value) || value.packId !== pack.packId || value.packSha256 !== pack.canonicalSha256 ||
      value.assetClass !== pack.assetClass || value.committeeGeneratedAt !== committee.generatedAt ||
      value.generatedAt !== generatedAt || !['APPROVE', 'REDUCE', 'REJECT'].includes(String(value.disposition)) ||
      !isText(value.summary) || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) ||
      value.confidence < 0 || value.confidence > 1 || !isStringArray(value.sourceRefs) ||
      value.sourceRefs.some((ref) => !allowed.has(ref)) || typeof value.conflictDetected !== 'boolean' ||
      !['COMPLETE', 'PARTIAL', 'INSUFFICIENT'].includes(String(value.evidenceCompleteness)) ||
      typeof value.riskMultiplier !== 'number' || !Number.isFinite(value.riskMultiplier) ||
      value.riskMultiplier < 0 || value.riskMultiplier > committee.riskMultiplierCeiling ||
      !isStringArray(value.reasons)) return null;
  const common = {
    schemaVersion: '1.0.0' as const, packId: pack.packId, packSha256: pack.canonicalSha256,
    assetClass: pack.assetClass, committeeGeneratedAt: committee.generatedAt, generatedAt,
    disposition: value.disposition as JudgeDisposition, summary: value.summary, confidence: value.confidence,
    sourceRefs: [...value.sourceRefs], conflictDetected: value.conflictDetected,
    evidenceCompleteness: value.evidenceCompleteness as JudgeAssessment['evidenceCompleteness'],
    riskMultiplier: value.riskMultiplier, reasons: [...value.reasons],
  };
  if (pack.assetClass === 'STOCK') {
    if (!isRecord(value.stockReview) || typeof value.stockReview.thesisInvalidationReviewed !== 'boolean' ||
        typeof value.stockReview.fundamentalsReviewed !== 'boolean' || value.optionReview !== undefined) return null;
    return { ...common, stockReview: { thesisInvalidationReviewed: value.stockReview.thesisInvalidationReviewed, fundamentalsReviewed: value.stockReview.fundamentalsReviewed } };
  }
  const { contract, quote } = pack.evidence;
  const mid = (quote.bid + quote.ask) / 2;
  const spreadPct = mid > 0 ? (quote.ask - quote.bid) / mid : 1;
  if (!isRecord(value.optionReview) || value.optionReview.occSymbol !== contract.occSymbol ||
      value.optionReview.expirationDate !== contract.expirationDate || value.optionReview.strike !== contract.strike ||
      typeof value.optionReview.bidAskSpreadPct !== 'number' || !Number.isFinite(value.optionReview.bidAskSpreadPct) ||
      Math.abs(value.optionReview.bidAskSpreadPct - spreadPct) > 0.000001 ||
      typeof value.optionReview.liquidityReviewed !== 'boolean' ||
      typeof value.optionReview.ivAndGreeksReviewed !== 'boolean' ||
      typeof value.optionReview.assignmentAndExerciseReviewed !== 'boolean' || value.stockReview !== undefined) return null;
  return { ...common, optionReview: {
    occSymbol: contract.occSymbol, expirationDate: contract.expirationDate, strike: contract.strike,
    bidAskSpreadPct: spreadPct, liquidityReviewed: value.optionReview.liquidityReviewed,
    ivAndGreeksReviewed: value.optionReview.ivAndGreeksReviewed,
    assignmentAndExerciseReviewed: value.optionReview.assignmentAndExerciseReviewed,
  } };
}
export async function runIndependentJudge(
  pack: MultiAssetEvidencePack,
  committee: CommitteeResult,
  judge: IndependentJudge,
  options: { now?: () => number; policy?: Partial<JudgePolicy> } = {},
): Promise<JudgeResult> {
  const generatedAt = (options.now ?? Date.now)();
  const policy = { ...DEFAULT_POLICY, ...options.policy };
  const committeeFailures = validateCommittee(pack, committee);
  const deterministic = deterministicReview(pack, generatedAt, policy);
  const preflightFailures = [...committeeFailures, ...deterministic.reject];
  if (preflightFailures.length || committee.riskMultiplierCeiling <= 0) {
    return { schemaVersion: '1.0.0', packId: pack.packId, assetClass: pack.assetClass, disposition: 'REJECT',
      assessment: null, riskMultiplierCeiling: 0, reasons: [...preflightFailures, ...(committee.riskMultiplierCeiling <= 0 ? ['ZERO_RISK_BUDGET'] : [])],
      generatedAt, executionEligible: false };
  }
  const allowedSourceRefs = pack.sources.map((_, i) => 'source:' + i);
  const immutablePack = deepFreeze(pack);
  const immutableCommittee = deepFreeze(committee);
  let raw: unknown;
  try {
    raw = await judge(immutablePack, immutableCommittee, {
      assetClass: pack.assetClass, allowedSourceRefs, generatedAt,
      riskMultiplierCeiling: committee.riskMultiplierCeiling,
      reviewChecklist: pack.assetClass === 'STOCK'
        ? ['independently challenge Bull and Bear arguments', 'detect thesis conflicts and counter-evidence',
          'check source provenance and point-in-time fundamentals', 'review thesis invalidation and market freshness']
        : ['independently challenge Bull and Bear arguments', 'verify OCC symbol, expiration, strike and contract multiplier',
          'review bid/ask spread, volume and open interest', 'review IV and all supplied Greeks',
          'consider assignment, exercise style and early-exercise risks', 'check quote freshness and time to expiration'],
    });
  } catch {
    raw = null;
  }
  const assessment = validateJudgeOutput(raw, pack, committee, generatedAt, new Set(allowedSourceRefs));
  if (!assessment) {
    return { schemaVersion: '1.0.0', packId: pack.packId, assetClass: pack.assetClass, disposition: 'REJECT',
      assessment: null, riskMultiplierCeiling: 0, reasons: ['INVALID_OR_MISSING_INDEPENDENT_JUDGE_OUTPUT'],
      generatedAt, executionEligible: false };
  }
  const forcedReduce = deterministic.reduce.length > 0 ||
    (pack.assetClass === 'STOCK' && !assessment.stockReview?.thesisInvalidationReviewed) ||
    (pack.assetClass === 'OPTION' && (!assessment.optionReview?.liquidityReviewed ||
      !assessment.optionReview?.ivAndGreeksReviewed || !assessment.optionReview?.assignmentAndExerciseReviewed)) ||
    assessment.evidenceCompleteness !== 'COMPLETE';
  const disposition: JudgeDisposition = assessment.disposition === 'REJECT' ? 'REJECT' :
    (assessment.disposition === 'REDUCE' || forcedReduce ? 'REDUCE' : 'APPROVE');
  const reasons = [...assessment.reasons, ...deterministic.reduce];
  if (forcedReduce) reasons.push('INDEPENDENT_REVIEW_REQUIRES_REDUCED_RISK');
  return { schemaVersion: '1.0.0', packId: pack.packId, assetClass: pack.assetClass, disposition,
    assessment, riskMultiplierCeiling: Math.min(committee.riskMultiplierCeiling, assessment.riskMultiplier),
    reasons, generatedAt, executionEligible: false };
}
