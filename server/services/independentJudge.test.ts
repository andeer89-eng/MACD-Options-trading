import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMultiAssetEvidencePack } from './multiAssetEvidencePack.ts';
import { COMMITTEE_ROLES, type CommitteeResult } from './multiAgentCommittee.ts';
import { runIndependentJudge, type IndependentJudge } from './independentJudge.ts';

const now = Date.UTC(2026, 10, 27, 18);
const digest = 'a'.repeat(64);
function stockPack() {
  const result = buildMultiAssetEvidencePack({
    assetClass: 'STOCK', symbol: 'AAPL', generatedAt: now, asOf: now - 1000,
    sources: [{ kind: 'market', provider: 'fixture', retrievedAt: now - 1000, sha256: digest }],
    risk: { evaluatedAt: now - 500, allowNewEntries: true, status: 'OK', reasons: [], policyVersion: 'risk-v1' },
    stock: { symbol: 'AAPL', market: { provider: 'fixture', retrievedAt: now - 1000, timeframe: '1d',
      candles: [{ close: 200 }], payloadSha256: digest } },
  });
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}
function optionPack(overrides: Record<string, unknown> = {}) {
  const quote = { bid: 5, ask: 5.2, volume: 100, openInterest: 500, impliedVolatility: 0.3,
    greeks: { delta: 0.55, gamma: 0.02, theta: -0.08, vega: 0.12 }, quoteAt: now - 1000, underlyingPrice: 252, ...overrides };
  const result = buildMultiAssetEvidencePack({
    assetClass: 'OPTION', symbol: 'AAPL', generatedAt: now, asOf: now - 1000,
    sources: [{ kind: 'option_quote', provider: 'fixture', retrievedAt: now - 1000, sha256: digest }],
    risk: { evaluatedAt: now - 500, allowNewEntries: true, status: 'OK', reasons: [], policyVersion: 'risk-v1' },
    option: { contract: { occSymbol: 'AAPL261218C00250000', underlyingSymbol: 'AAPL', optionType: 'CALL',
      expirationDate: '2026-12-18', strike: 250, multiplier: 100 },
      quote: quote as any, market: { provider: 'fixture', retrievedAt: now - 1000, payloadSha256: digest } },
  });
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}
function committeeFor(pack: ReturnType<typeof stockPack>): CommitteeResult {
  const generatedAt = now + 10;
  const assessments = COMMITTEE_ROLES.map(role => ({
    role, assetClass: pack.assetClass, packSha256: pack.canonicalSha256, generatedAt,
    finding: { summary: role + ' independent view', stance: role === 'BEAR' ? 'BEARISH' as const : 'BULLISH' as const,
      confidence: 0.7, sourceRefs: ['source:0'], risks: ['market uncertainty'] },
    ...(role === 'RISK' ? { riskControls: { vetoNewRisk: false, maxRiskMultiplier: 0.8, reasons: ['reduced risk budget'] } } : {}),
  }));
  return { schemaVersion: '1.0.0', packId: pack.packId, assetClass: pack.assetClass, decision: 'ADVANCE_TO_JUDGE',
    assessments, riskMultiplierCeiling: 0.8, reasons: [], generatedAt, executionEligible: false };
}
function validJudge(pack: ReturnType<typeof stockPack>, committee: CommitteeResult, context: any, overrides: Record<string, unknown> = {}) {
  const common = {
    packId: pack.packId, packSha256: pack.canonicalSha256, assetClass: pack.assetClass,
    committeeGeneratedAt: committee.generatedAt, generatedAt: context.generatedAt,
    disposition: 'APPROVE', summary: 'Independent review confirms a coherent, evidence-backed thesis.',
    confidence: 0.75, sourceRefs: ['source:0'], conflictDetected: true,
    evidenceCompleteness: 'COMPLETE', riskMultiplier: 0.7, reasons: ['Bull and Bear cases independently reconciled'],
  };
  if (pack.assetClass === 'STOCK') return { ...common,
    stockReview: { thesisInvalidationReviewed: true, fundamentalsReviewed: false }, ...overrides };
  const { contract, quote } = pack.evidence;
  const mid = (quote.bid + quote.ask) / 2;
  return { ...common, optionReview: { occSymbol: contract.occSymbol, expirationDate: contract.expirationDate,
    strike: contract.strike, bidAskSpreadPct: (quote.ask - quote.bid) / mid,
    liquidityReviewed: true, ivAndGreeksReviewed: true, assignmentAndExerciseReviewed: true }, ...overrides };
}
test('independent judge approves STOCK research without enabling execution', async () => {
  const pack = stockPack(); const committee = committeeFor(pack);
  const judge: IndependentJudge = async (p, c, context) => validJudge(p, c, context);
  const result = await runIndependentJudge(pack, committee, judge, { now: () => now + 20 });
  assert.equal(result.disposition, 'APPROVE');
  assert.equal(result.assetClass, 'STOCK');
  assert.equal(result.riskMultiplierCeiling, 0.7);
  assert.equal(result.executionEligible, false);
});
test('independent judge reviews OPTION contract, quote, IV, Greeks and assignment risk', async () => {
  const pack = optionPack(); const committee = committeeFor(pack);
  const judge: IndependentJudge = async (p, c, context) => validJudge(p, c, context);
  const result = await runIndependentJudge(pack, committee, judge, { now: () => now + 20 });
  assert.equal(result.disposition, 'APPROVE');
  assert.equal(result.assetClass, 'OPTION');
  assert.equal(result.assessment?.optionReview?.occSymbol, 'AAPL261218C00250000');
  assert.equal(result.executionEligible, false);
});
test('wide option spread forces REDUCE even if judge says APPROVE', async () => {
  const pack = optionPack({ bid: 3, ask: 7 }); const committee = committeeFor(pack);
  const judge: IndependentJudge = async (p, c, context) => validJudge(p, c, context);
  const result = await runIndependentJudge(pack, committee, judge, { now: () => now + 20 });
  assert.equal(result.disposition, 'REDUCE');
  assert.ok(result.reasons.includes('OPTION_BID_ASK_SPREAD_TOO_WIDE'));
});
test('missing or malformed independent judge output fails closed', async () => {
  const pack = stockPack(); const committee = committeeFor(pack);
  const missing: IndependentJudge = async () => { throw new Error('provider timeout'); };
  const result = await runIndependentJudge(pack, committee, missing, { now: () => now + 20 });
  assert.equal(result.disposition, 'REJECT');
  assert.equal(result.assessment, null);
  assert.equal(result.executionEligible, false);
});
test('judge cannot exceed committee risk ceiling or cite unsupported sources', async () => {
  const pack = stockPack(); const committee = committeeFor(pack);
  const overBudget: IndependentJudge = async (p, c, context) => validJudge(p, c, context, { riskMultiplier: 0.9 });
  const invalid = await runIndependentJudge(pack, committee, overBudget, { now: () => now + 20 });
  assert.equal(invalid.disposition, 'REJECT');
  const fabricatedSource: IndependentJudge = async (p, c, context) => validJudge(p, c, context, { sourceRefs: ['source:99'] });
  const unsupported = await runIndependentJudge(pack, committee, fabricatedSource, { now: () => now + 20 });
  assert.equal(unsupported.disposition, 'REJECT');
});
test('committee veto and deterministic risk veto always dominate judge approval', async () => {
  const pack = stockPack(); const committee = committeeFor(pack);
  const vetoed = { ...committee, decision: 'VETO' as const };
  const judge: IndependentJudge = async (p, c, context) => validJudge(p, c, context);
  const committeeResult = await runIndependentJudge(pack, vetoed, judge, { now: () => now + 20 });
  assert.equal(committeeResult.disposition, 'REJECT');
  const blockedPack = { ...pack, risk: { ...pack.risk, allowNewEntries: false } };
  const riskResult = await runIndependentJudge(blockedPack, committee, judge, { now: () => now + 20 });
  assert.equal(riskResult.disposition, 'REJECT');
});
test('judge output with incomplete asset-specific review is reduced', async () => {
  const pack = optionPack(); const committee = committeeFor(pack);
  const judge: IndependentJudge = async (p, c, context) => validJudge(p, c, context, {
    optionReview: { ...validJudge(p, c, context).optionReview, assignmentAndExerciseReviewed: false },
  });
  const result = await runIndependentJudge(pack, committee, judge, { now: () => now + 20 });
  assert.equal(result.disposition, 'REDUCE');
});
