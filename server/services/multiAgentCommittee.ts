import type { MultiAssetEvidencePack } from './multiAssetEvidencePack.ts';

export const COMMITTEE_ROLES = ['STRATEGIST', 'BULL', 'BEAR', 'RISK'] as const;
export type CommitteeRole = typeof COMMITTEE_ROLES[number];
export type AgentStance = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type AgentFinding = {
  summary: string;
  stance: AgentStance;
  confidence: number;
  sourceRefs: string[];
  risks: string[];
};
export type AgentAssessment = {
  role: CommitteeRole;
  assetClass: 'STOCK' | 'OPTION';
  packSha256: string;
  generatedAt: number;
  finding: AgentFinding;
  riskControls?: {
    vetoNewRisk: boolean;
    maxRiskMultiplier: number;
    reasons: string[];
  };
};
export type CommitteeDecision = 'HOLD' | 'ADVANCE_TO_JUDGE' | 'VETO';
export type CommitteeResult = {
  schemaVersion: '1.0.0';
  packId: string;
  assetClass: 'STOCK' | 'OPTION';
  decision: CommitteeDecision;
  assessments: AgentAssessment[];
  riskMultiplierCeiling: number;
  reasons: string[];
  generatedAt: number;
  executionEligible: false;
};
export type CommitteeAgent = (
  role: CommitteeRole,
  pack: MultiAssetEvidencePack,
  context: { allowedSourceRefs: string[]; assetClass: 'STOCK' | 'OPTION' }
) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const validStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);

function validateAssessment(
  value: unknown,
  role: CommitteeRole,
  pack: MultiAssetEvidencePack,
  allowedSourceRefs: Set<string>,
  generatedAt: number,
): AgentAssessment | null {
  if (!isRecord(value) || value.role !== role || value.assetClass !== pack.assetClass ||
      value.packSha256 !== pack.canonicalSha256 || value.generatedAt !== generatedAt ||
      !isRecord(value.finding)) return null;

  const finding = value.finding;
  if (!isText(finding.summary) || !['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(finding.stance)) ||
      typeof finding.confidence !== 'number' || !Number.isFinite(finding.confidence) ||
      finding.confidence < 0 || finding.confidence > 1 || !validStringArray(finding.sourceRefs) ||
      !validStringArray(finding.risks) || finding.sourceRefs.some((ref) => !allowedSourceRefs.has(ref))) {
    return null;
  }

  let riskControls: AgentAssessment['riskControls'];
  if (role === 'RISK') {
    if (!isRecord(value.riskControls) || typeof value.riskControls.vetoNewRisk !== 'boolean' ||
        typeof value.riskControls.maxRiskMultiplier !== 'number' ||
        !Number.isFinite(value.riskControls.maxRiskMultiplier) ||
        value.riskControls.maxRiskMultiplier < 0 || value.riskControls.maxRiskMultiplier > 1 ||
        !validStringArray(value.riskControls.reasons)) return null;
    riskControls = {
      vetoNewRisk: value.riskControls.vetoNewRisk,
      maxRiskMultiplier: value.riskControls.maxRiskMultiplier,
      reasons: value.riskControls.reasons,
    };
  } else if (value.riskControls !== undefined) {
    return null;
  }

  return {
    role,
    assetClass: pack.assetClass,
    packSha256: pack.canonicalSha256,
    generatedAt,
    finding: {
      summary: finding.summary,
      stance: finding.stance as AgentStance,
      confidence: finding.confidence,
      sourceRefs: [...finding.sourceRefs],
      risks: [...finding.risks],
    },
    ...(riskControls ? { riskControls } : {}),
  };
}

/**
 * Executes the four isolated analyst roles against the same immutable evidence pack.
 * This is research-only: it never calls a broker or mutates portfolio state.
 */
export async function runMultiAgentCommittee(
  pack: MultiAssetEvidencePack,
  runAgent: CommitteeAgent,
  options: { now?: () => number } = {},
): Promise<CommitteeResult> {
  const generatedAt = (options.now ?? Date.now)();
  const allowedSourceRefs = pack.sources.map((_, index) => `source:${index}`);
  const allowed = new Set(allowedSourceRefs);

  const raw = await Promise.all(COMMITTEE_ROLES.map(async (role) => {
    try {
      return { role, value: await runAgent(role, pack, { allowedSourceRefs, assetClass: pack.assetClass }) };
    } catch {
      return { role, value: null };
    }
  }));

  const assessments: AgentAssessment[] = [];
  const failures: string[] = [];
  for (const item of raw) {
    const assessment = validateAssessment(item.value, item.role, pack, allowed, generatedAt);
    if (!assessment) failures.push(`INVALID_OR_MISSING_${item.role}_ASSESSMENT`);
    else assessments.push(assessment);
  }

  const risk = assessments.find((assessment) => assessment.role === 'RISK');
  const riskVeto = risk?.riskControls?.vetoNewRisk === true;
  const riskMultiplier = risk?.riskControls?.maxRiskMultiplier ?? 0;
  const reasons = [...failures];
  if (riskVeto) reasons.push(...(risk?.riskControls?.reasons ?? ['RISK_AGENT_VETO']));
  if (risk && riskMultiplier < 1) reasons.push('RISK_AGENT_REDUCED_RISK_BUDGET');

  const decision: CommitteeDecision = failures.length > 0 || riskVeto
    ? 'VETO'
    : assessments.some((assessment) => assessment.role === 'BEAR' && assessment.finding.stance === 'BEARISH') &&
      assessments.some((assessment) => assessment.role === 'BULL' && assessment.finding.stance === 'BEARISH')
      ? 'HOLD'
      : 'ADVANCE_TO_JUDGE';

  return {
    schemaVersion: '1.0.0',
    packId: pack.packId,
    assetClass: pack.assetClass,
    decision,
    assessments,
    riskMultiplierCeiling: riskMultiplier,
    reasons,
    generatedAt,
    executionEligible: false,
  };
}
