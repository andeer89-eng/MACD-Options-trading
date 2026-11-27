import { createHash } from 'node:crypto';

export type EvidenceSource = { kind: string; provider: string; retrievedAt: number; publishedAt?: number; uri?: string; sha256?: string };
export type EvidenceRiskSnapshot = { evaluatedAt: number; allowNewEntries: boolean; status: 'OK'|'CAUTION'|'HALTED'|'DATA_INVALID'; reasons: string[]; policyVersion: string; snapshotSha256?: string };
export type StockEvidenceInput = {
  symbol: string;
  market: { provider: string; retrievedAt: number; timeframe: string; candles: Array<Record<string, unknown>>; payloadSha256: string };
  technical?: Record<string, unknown>;
  fundamentals?: { asOfDate: string; facts: Array<{ metric: string; value: number|null; unit: string; periodEnd: string; filingDate: string; accession: string; sourceUri: string }> };
};
export type OptionEvidenceInput = {
  contract: { occSymbol: string; underlyingSymbol: string; optionType: 'CALL'|'PUT'; expirationDate: string; strike: number; multiplier: number };
  quote: { bid: number; ask: number; bidSize?: number; askSize?: number; last?: number; volume: number; openInterest: number; impliedVolatility: number; greeks: { delta: number; gamma: number; theta: number; vega: number; rho?: number }; quoteAt: number; underlyingPrice: number };
  market: { provider: string; retrievedAt: number; payloadSha256: string };
};
export type MultiAssetEvidencePackInput =
  | { assetClass:'STOCK'; symbol:string; generatedAt:number; asOf:number; sources:EvidenceSource[]; risk:EvidenceRiskSnapshot; stock:StockEvidenceInput; option?:never }
  | { assetClass:'OPTION'; symbol:string; generatedAt:number; asOf:number; sources:EvidenceSource[]; risk:EvidenceRiskSnapshot; option:OptionEvidenceInput; stock?:never };
export type MultiAssetEvidencePack = {
  schemaVersion:'1.0.0'; packId:string; assetClass:'STOCK'|'OPTION'; symbol:string;
  generatedAt:number; asOf:number; sources:EvidenceSource[]; risk:EvidenceRiskSnapshot;
  evidence:StockEvidenceInput|OptionEvidenceInput; canonicalSha256:string;
};
export type EvidencePackBuildResult = { ok:true; pack:MultiAssetEvidencePack } | { ok:false; reason:string };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b));
    return '{' + entries.map(([k,v])=>JSON.stringify(k)+':'+canonicalJson(v)).join(',') + '}';
  }
  throw new Error('NON_JSON_EVIDENCE_VALUE');
}
const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const digestOk = (value:string) => /^[a-f0-9]{64}$/.test(value);
const nonEmpty = (value:unknown): value is string => typeof value==='string' && value.trim().length>0;
const timestampOk = (value:number, ceiling:number) => Number.isFinite(value) && value>0 && value<=ceiling;
const isoDate = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;

export function buildMultiAssetEvidencePack(input: MultiAssetEvidencePackInput): EvidencePackBuildResult {
  if (!input || !['STOCK','OPTION'].includes(input.assetClass)) return {ok:false,reason:'UNSUPPORTED_ASSET_CLASS'};
  const symbol=String(input.symbol||'').trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,24}$/.test(symbol)) return {ok:false,reason:'INVALID_SYMBOL'};
  if (!Number.isFinite(input.generatedAt)||input.generatedAt<=0||!timestampOk(input.asOf,input.generatedAt)) return {ok:false,reason:'INVALID_EVIDENCE_TIME'};
  const risk=input.risk;
  if (!risk||!timestampOk(risk.evaluatedAt,input.generatedAt)||typeof risk.allowNewEntries!=='boolean'||
    !['OK','CAUTION','HALTED','DATA_INVALID'].includes(risk.status)||!Array.isArray(risk.reasons)||
    !nonEmpty(risk.policyVersion)||(risk.allowNewEntries&&['HALTED','DATA_INVALID'].includes(risk.status))||(risk.snapshotSha256!==undefined&&!digestOk(risk.snapshotSha256))) return {ok:false,reason:'INVALID_RISK_SNAPSHOT'};
  if (!Array.isArray(input.sources)||input.sources.length===0) return {ok:false,reason:'EVIDENCE_SOURCES_REQUIRED'};
  for (const s of input.sources) if (!s||!nonEmpty(s.kind)||!nonEmpty(s.provider)||
    !timestampOk(s.retrievedAt,input.generatedAt)||(s.publishedAt!==undefined&&!timestampOk(s.publishedAt,input.generatedAt))||
    (s.sha256!==undefined&&!digestOk(s.sha256))) return {ok:false,reason:'INVALID_EVIDENCE_SOURCE'};

  let evidence: StockEvidenceInput|OptionEvidenceInput;
  if (input.assetClass==='STOCK') {
    const s=input.stock;
    if (input.option!==undefined||!s) return {ok:false,reason:'STOCK_OPTION_EVIDENCE_MISMATCH'};
    if (!nonEmpty(s.symbol)||s.symbol.trim().toUpperCase()!==symbol||!nonEmpty(s.market?.provider)||
      !timestampOk(s.market.retrievedAt,input.generatedAt)||!nonEmpty(s.market.timeframe)||
      !Array.isArray(s.market.candles)||s.market.candles.length===0||!digestOk(s.market.payloadSha256))
      return {ok:false,reason:'INVALID_STOCK_EVIDENCE'};
    if (s.fundamentals) {
      if (!isoDate(s.fundamentals.asOfDate)||s.fundamentals.asOfDate>new Date(input.asOf).toISOString().slice(0,10)||!Array.isArray(s.fundamentals.facts)) return {ok:false,reason:'INVALID_STOCK_FUNDAMENTALS'};
      for (const f of s.fundamentals.facts) if (!f||!nonEmpty(f.metric)||(f.value!==null&&!Number.isFinite(f.value))||
        !nonEmpty(f.unit)||!isoDate(f.periodEnd)||!isoDate(f.filingDate)||f.filingDate>s.fundamentals.asOfDate||
        !nonEmpty(f.accession)||!nonEmpty(f.sourceUri)||!/^https:\/\//.test(f.sourceUri)) return {ok:false,reason:'INVALID_STOCK_FUNDAMENTAL_FACT'};
    }
    evidence=s;
  } else {
    const o=input.option;
    if (input.stock!==undefined||!o) return {ok:false,reason:'OPTION_STOCK_EVIDENCE_MISMATCH'};
    const c=o.contract,q=o.quote;
    const occ=typeof c?.occSymbol==='string'?c.occSymbol:'';
    const occMatch=occ.match(/^([A-Z0-9]{1,6})(\d{6})([CP])(\d{8})$/);
    const expectedExpiry=typeof c?.expirationDate==='string'?c.expirationDate.slice(2,4)+c.expirationDate.slice(5,7)+c.expirationDate.slice(8,10):'';
    const expectedType=c?.optionType==='CALL'?'C':c?.optionType==='PUT'?'P':'';
    if (!occMatch||!nonEmpty(c.underlyingSymbol)||c.underlyingSymbol.trim().toUpperCase()!==symbol||
      !occMatch[1].startsWith(symbol)||occMatch[2]!==expectedExpiry||occMatch[3]!==expectedType||
      Number(occMatch[4])!==Math.round(Number(c.strike)*1000)||
      !['CALL','PUT'].includes(c.optionType)||!isoDate(c.expirationDate)||!Number.isFinite(c.strike)||c.strike<=0||!Number.isFinite(c.multiplier)||c.multiplier<=0||
      !q||!Number.isFinite(q.bid)||q.bid<0||!Number.isFinite(q.ask)||q.ask<q.bid||
      !Number.isFinite(q.volume)||q.volume<0||!Number.isFinite(q.openInterest)||q.openInterest<0||
      !Number.isFinite(q.impliedVolatility)||q.impliedVolatility<0||!timestampOk(q.quoteAt,input.asOf)||
      !Number.isFinite(q.underlyingPrice)||q.underlyingPrice<=0||
      ![q.greeks?.delta,q.greeks?.gamma,q.greeks?.theta,q.greeks?.vega].every(Number.isFinite)||
      (q.greeks.rho!==undefined&&!Number.isFinite(q.greeks.rho))||
      !nonEmpty(o.market?.provider)||!timestampOk(o.market.retrievedAt,input.generatedAt)||!digestOk(o.market.payloadSha256))
      return {ok:false,reason:'INVALID_OPTION_EVIDENCE'};
    if ((q.bidSize!==undefined&&(!Number.isFinite(q.bidSize)||q.bidSize<0))||
      (q.askSize!==undefined&&(!Number.isFinite(q.askSize)||q.askSize<0))||
      (q.last!==undefined&&(!Number.isFinite(q.last)||q.last<0))) return {ok:false,reason:'INVALID_OPTION_QUOTE_FIELDS'};
    evidence=o;
  }
  let body:string;
  try { body=canonicalJson({schemaVersion:'1.0.0',assetClass:input.assetClass,symbol,generatedAt:input.generatedAt,asOf:input.asOf,sources:input.sources,risk,evidence}); }
  catch { return {ok:false,reason:'NON_CANONICAL_EVIDENCE_VALUE'}; }
  const canonicalSha256=hash(body);
  return {ok:true,pack:{schemaVersion:'1.0.0',packId:canonicalSha256,assetClass:input.assetClass,symbol,
    generatedAt:input.generatedAt,asOf:input.asOf,sources:input.sources,risk,evidence,canonicalSha256}};
}
