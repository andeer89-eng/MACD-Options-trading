import type { MultiAssetEvidencePack } from './multiAssetEvidencePack.ts';
export const COMMITTEE_ROLES = ['STRATEGIST', 'BULL', 'BEAR', 'RISK'] as const;
export type CommitteeRole = typeof COMMITTEE_ROLES[number];
export type AgentStance = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type AgentAssessment = { role: CommitteeRole; assetClass: 'STOCK' | 'OPTION'; packSha256: string; generatedAt: number; finding: { summary: string; stance: AgentStance; confidence: number; sourceRefs: string[]; risks: string[] }; riskControls?: { vetoNewRisk: boolean; maxRiskMultiplier: number; reasons: string[] } };
export type CommitteeDecision = 'ADVANCE_TO_JUDGE' | 'VETO';
export type CommitteeResult = { schemaVersion: '1.0.0'; packId: string; assetClass: 'STOCK' | 'OPTION'; decision: CommitteeDecision; assessments: AgentAssessment[]; riskMultiplierCeiling: number; reasons: string[]; generatedAt: number; executionEligible: false };
export type CommitteeAgent = (role: CommitteeRole, pack: MultiAssetEvidencePack, context: { allowedSourceRefs: string[]; assetClass: 'STOCK' | 'OPTION'; generatedAt: number }) => Promise<unknown>;
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const validStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim().length > 0);\nfunction deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
function validateAssessment(value: unknown, role: CommitteeRole, pack: MultiAssetEvidencePack, allowed: Set<string>, generatedAt: number): AgentAssessment | null {
 if (!isRecord(value) || value.role !== role || value.assetClass !== pack.assetClass || value.packSha256 !== pack.canonicalSha256 || value.generatedAt !== generatedAt || !isRecord(value.finding)) return null;
 const f = value.finding;
 if (!isText(f.summary) || !['BULLISH','BEARISH','NEUTRAL'].includes(String(f.stance)) || typeof f.confidence !== 'number' || !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1 || !validStringArray(f.sourceRefs) || !validStringArray(f.risks) || f.sourceRefs.some((r) => !allowed.has(r))) return null;
 let riskControls: AgentAssessment['riskControls'];
 if (role === 'RISK') { if (!isRecord(value.riskControls) || typeof value.riskControls.vetoNewRisk !== 'boolean' || typeof value.riskControls.maxRiskMultiplier !== 'number' || !Number.isFinite(value.riskControls.maxRiskMultiplier) || value.riskControls.maxRiskMultiplier < 0 || value.riskControls.maxRiskMultiplier > 1 || !validStringArray(value.riskControls.reasons)) return null; riskControls = { vetoNewRisk: value.riskControls.vetoNewRisk, maxRiskMultiplier: value.riskControls.maxRiskMultiplier, reasons: [...value.riskControls.reasons] }; } else if (value.riskControls !== undefined) return null;
 return { role, assetClass: pack.assetClass, packSha256: pack.canonicalSha256, generatedAt, finding: { summary: f.summary, stance: f.stance as AgentStance, confidence: f.confidence, sourceRefs: [...f.sourceRefs], risks: [...f.risks] }, ...(riskControls ? { riskControls } : {}) };
}
export async function runMultiAgentCommittee(pack: MultiAssetEvidencePack, runAgent: CommitteeAgent, options: { now?: () => number } = {}): Promise<CommitteeResult> {
 const generatedAt = (options.now ?? Date.now)(); const allowedSourceRefs = pack.sources.map((_, i) => 'source:' + i); const allowed = new Set(allowedSourceRefs);\n const immutablePack = deepFreeze(pack);
 const raw = await Promise.all(COMMITTEE_ROLES.map(async (role) => { try { return { role, value: await runAgent(role, immutablePack, { allowedSourceRefs, assetClass: pack.assetClass, generatedAt }) }; } catch { return { role, value: null }; } }));
 const assessments: AgentAssessment[] = []; const failures: string[] = [];
 for (const item of raw) { const assessment = validateAssessment(item.value, item.role, pack, allowed, generatedAt); if (!assessment) failures.push('INVALID_OR_MISSING_' + item.role + '_ASSESSMENT'); else assessments.push(assessment); }
 const risk = assessments.find((a) => a.role === 'RISK'); const riskVeto = risk?.riskControls?.vetoNewRisk === true; const riskMultiplier = risk?.riskControls?.maxRiskMultiplier ?? 0;
 const deterministicRiskVeto = !pack.risk.allowNewEntries || pack.risk.status === 'HALTED' || pack.risk.status === 'DATA_INVALID';\n const reasons = [...failures]; if (riskVeto) reasons.push(...(risk?.riskControls?.reasons ?? ['RISK_AGENT_VETO'])); if (risk && riskMultiplier < 1) reasons.push('RISK_AGENT_REDUCED_RISK_BUDGET'); if (deterministicRiskVeto) reasons.push('DETERMINISTIC_RISK_SNAPSHOT_BLOCKS_NEW_RISK');
 return { schemaVersion: '1.0.0', packId: pack.packId, assetClass: pack.assetClass, decision: failures.length > 0 || riskVeto || deterministicRiskVeto ? 'VETO' : 'ADVANCE_TO_JUDGE', assessments, riskMultiplierCeiling: riskMultiplier, reasons, generatedAt, executionEligible: false };
}