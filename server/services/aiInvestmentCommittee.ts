import type { MultiAssetEvidencePack } from './multiAssetEvidencePack.ts';

export const AI_COMMITTEE_SCHEMA_VERSION = '1.0.0';
export const AI_COMMITTEE_ROLES = ['STRATEGIST', 'BULL', 'BEAR', 'RISK'] as const;
export type AICommitteeRole = typeof AI_COMMITTEE_ROLES[number];
export type RiskDisposition = 'ACCEPT' | 'RESTRICT' | 'VETO';
export type AgentAssessment = {
  role: AICommitteeRole; packId: string; assetClass: 'STOCK'|'OPTION'; symbol: string;
  thesis: string; score: number; confidence: number; keyPoints: string[]; risks: string[];
  evidenceSourceIndexes: number[]; riskDisposition?: RiskDisposition; restrictions?: string[];
  model: string; promptVersion: string;
};
export type AgentRequest = {
  role: AICommitteeRole; assetClass: 'STOCK'|'OPTION'; systemInstruction: string;
  evidencePack: MultiAssetEvidencePack;
  outputContract: { packId: string; requiredRole: AICommitteeRole; scoreRange: [-100,100];
    confidenceRange: [0,1]; evidenceSourceIndexRange: [0,number]; riskDispositionRequired: boolean };
};
export type AICommitteeAgent = { assess(request: AgentRequest): Promise<unknown> };
export type AICommitteeResult = {
  schemaVersion: typeof AI_COMMITTEE_SCHEMA_VERSION; committeeId: string; packId: string;
  assetClass: 'STOCK'|'OPTION'; symbol: string; status: 'COMPLETE'|'BLOCKED'|'INCOMPLETE';
  generatedAt: number; assessments: AgentAssessment[]; failedRoles: AICommitteeRole[];
  deterministicRiskVeto: boolean; deterministicRiskReasons: string[]; limitations: string[];
};

const ROLE_INSTRUCTIONS: Record<AICommitteeRole,string> = {
  STRATEGIST:'Develop the primary thesis, relevant horizon, catalysts and invalidation conditions. Do not recommend or construct a broker order.',
  BULL:'Construct the strongest evidence-grounded bullish case. Identify upside drivers and what could make the thesis wrong.',
  BEAR:'Construct the strongest evidence-grounded bearish case. Search for disconfirming evidence, fragility, downside catalysts and missing information.',
  RISK:'Independently assess capital, liquidity, volatility, gap, concentration and instrument-specific risks. For options assess spread, expiry, IV, Greeks, assignment/exercise and payoff uncertainty. Return ACCEPT, RESTRICT or VETO. Never loosen deterministic controls.',
};
const ASSET_CONTEXT = {
  STOCK:'Analyze this as an underlying equity/security. Do not invent options data or infer unavailable fundamentals.',
  OPTION:'Analyze this as a specific listed option contract. Treat the underlying as context only. Explicitly assess expiry, strike, multiplier, bid/ask, liquidity, IV and Greeks. Do not substitute stock-only return logic for option payoff.',
} as const;
function cloneAndFreeze<T>(value:T):T {
  const clone = structuredClone(value);
  const freeze = (item:unknown):void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    Object.freeze(item);
    for (const child of Object.values(item as Record<string,unknown>)) freeze(child);
  };
  freeze(clone);
  return clone;
}
function isRecord(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function nonEmpty(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0;}
function stringList(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=30&&value.every(v=>nonEmpty(v)&&v.length<=500);}

function validateAssessment(raw:unknown,role:AICommitteeRole,pack:MultiAssetEvidencePack):AgentAssessment|null{
  if(!isRecord(raw)||raw.role!==role||raw.packId!==pack.packId||raw.assetClass!==pack.assetClass||raw.symbol!==pack.symbol)return null;
  if(!nonEmpty(raw.thesis)||raw.thesis.length>4000||typeof raw.score!=='number'||!Number.isFinite(raw.score)||raw.score< -100||raw.score>100||
    typeof raw.confidence!=='number'||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1||
    !stringList(raw.keyPoints)||!stringList(raw.risks)||!Array.isArray(raw.evidenceSourceIndexes)||
    !raw.evidenceSourceIndexes.every(i=>Number.isInteger(i)&&i>=0&&i<pack.sources.length)||
    !nonEmpty(raw.model)||!nonEmpty(raw.promptVersion))return null;
  if(role==='RISK'){
    if(!['ACCEPT','RESTRICT','VETO'].includes(String(raw.riskDisposition))||!stringList(raw.restrictions))return null;
  }else if(raw.riskDisposition!==undefined||raw.restrictions!==undefined)return null;
  return {role,packId:pack.packId,assetClass:pack.assetClass,symbol:pack.symbol,thesis:raw.thesis,score:raw.score,
    confidence:raw.confidence,keyPoints:raw.keyPoints,risks:raw.risks,evidenceSourceIndexes:raw.evidenceSourceIndexes as number[],
    ...(role==='RISK'?{riskDisposition:raw.riskDisposition as RiskDisposition,restrictions:raw.restrictions as string[]}:{}),
    model:raw.model,promptVersion:raw.promptVersion};
}
function systemInstruction(role:AICommitteeRole,assetClass:'STOCK'|'OPTION'):string{
  return [
    'You are one independent analyst in a multi-agent investment research committee.',
    ROLE_INSTRUCTIONS[role],ASSET_CONTEXT[assetClass],
    'Use only the supplied evidence pack. Do not fabricate facts, prices, dates, Greeks, filings, source references or backtest results.',
    'If evidence is missing, stale, contradictory or insufficient, say so explicitly and lower confidence.',
    'Cite evidence by zero-based source indexes from the supplied sources array. Do not invent source indexes.',
    'Return one JSON object matching the output contract. No markdown fences or extra prose.',
    'Research only. You cannot authorize, create, modify or submit an order.',
  ].join('\n');
}

export async function runAIInvestmentCommittee(input:{
  evidencePack:MultiAssetEvidencePack;agent:AICommitteeAgent;now?:()=>number;
}):Promise<AICommitteeResult>{
  const pack=input.evidencePack,generatedAt=(input.now??Date.now)();
  const deterministicRiskReasons=[
    ...(!pack.risk.allowNewEntries?['EXISTING_RISK_ENGINE_BLOCKS_NEW_ENTRIES']:[]),
    ...(pack.risk.status==='HALTED'?['RISK_STATUS_HALTED']:[]),
    ...(pack.risk.status==='DATA_INVALID'?['RISK_STATUS_DATA_INVALID']:[]),
  ];
  const deterministicRiskVeto=deterministicRiskReasons.length>0;
  const roles=[...AI_COMMITTEE_ROLES];
  const outcomes=await Promise.all(roles.map(async role=>{
    try{
      const request:AgentRequest={role,assetClass:pack.assetClass,systemInstruction:systemInstruction(role,pack.assetClass),
        evidencePack:cloneAndFreeze(pack),outputContract:{packId:pack.packId,requiredRole:role,scoreRange:[-100,100],
          confidenceRange:[0,1],evidenceSourceIndexRange:[0,Math.max(0,pack.sources.length-1)],riskDispositionRequired:role==='RISK'}};
      return {role,assessment:validateAssessment(await input.agent.assess(request),role,pack)};
    }catch{return {role,assessment:null};}
  }));
  const assessments=outcomes.flatMap(o=>o.assessment?[o.assessment]:[]);
  const failedRoles=outcomes.filter(o=>!o.assessment).map(o=>o.role);
  const riskAssessment=assessments.find(a=>a.role==='RISK');
  const agentVeto=riskAssessment?.riskDisposition==='VETO';
  const status=failedRoles.length>0?'INCOMPLETE':(deterministicRiskVeto||agentVeto?'BLOCKED':'COMPLETE');
  return {
    schemaVersion:AI_COMMITTEE_SCHEMA_VERSION,
    committeeId:pack.packId+':'+AI_COMMITTEE_SCHEMA_VERSION+':'+generatedAt,
    packId:pack.packId,assetClass:pack.assetClass,symbol:pack.symbol,status,generatedAt,
    assessments,failedRoles,deterministicRiskVeto,deterministicRiskReasons,
    limitations:[
      'Committee output is research, not an order or trade authorization.',
      'COMPLETE means only that all four structured assessments were received and validated.',
      'Deterministic portfolio risk must be re-evaluated at execution time against current broker/account state.',
      'AI assessments are untrusted and must not loosen deterministic risk controls.',
      'Each agent receives the same evidence pack; missing evidence is not inferred.',
    ],
  };
}
