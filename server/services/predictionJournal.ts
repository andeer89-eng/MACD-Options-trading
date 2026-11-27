import { createHash } from 'node:crypto';

export type PredictionAssetClass = 'STOCK' | 'OPTION';
export type PredictionOutcomeClass = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type PredictionProbabilities = { positive: number; neutral: number; negative: number };
export type PredictionSnapshotInput = {
  predictionId: string; assetClass: PredictionAssetClass; symbol: string; contractId?: string;
  createdAt: number; targetAt: number; evidencePackId: string; evidencePackSha256: string;
  committeeGeneratedAt: number; judgeGeneratedAt: number; disposition: 'APPROVE' | 'REDUCE' | 'REJECT';
  riskMultiplier: number; confidence: number; probabilities: PredictionProbabilities;
  sourceRefs: string[]; model?: { provider: string; model: string; promptVersion: string };
};
export type StockOutcome = { assetClass: 'STOCK'; realizedAt: number; observedAt: number; outcome: PredictionOutcomeClass; totalReturnPct: number; benchmarkReturnPct?: number; labelSource: string };
export type OptionOutcome = { assetClass: 'OPTION'; realizedAt: number; observedAt: number; outcome: PredictionOutcomeClass; contractReturnPct: number; underlyingReturnPct: number; exitMethod: 'CLOSED' | 'MARK_TO_MARKET' | 'EXPIRED'; entryPremium: number; exitValue: number; labelSource: string };
export type PredictionOutcome = StockOutcome | OptionOutcome;
export type PredictionSnapshot = PredictionSnapshotInput & { schemaVersion: '1.0.0'; recordedAt: number; inputSha256: string; snapshotSha256: string };
export type PredictionEvent =
  | { sequence: number; eventType: 'PREDICTION_RECORDED'; prediction: PredictionSnapshot; prevHash: string; eventHash: string }
  | { sequence: number; eventType: 'OUTCOME_LABELED'; predictionId: string; outcome: PredictionOutcome; prevHash: string; eventHash: string };
export type JournalErrorCode = 'INVALID_PREDICTION' | 'PREDICTION_ID_COLLISION' | 'PREDICTION_NOT_FOUND' | 'OUTCOME_ASSET_CLASS_MISMATCH' | 'OUTCOME_BEFORE_TARGET' | 'OUTCOME_ALREADY_LABELED' | 'INVALID_OUTCOME' | 'JOURNAL_CHAIN_INVALID';
export class PredictionJournalError extends Error {
  constructor(readonly code: JournalErrorCode) { super(code); this.name = 'PredictionJournalError'; }
}
const GENESIS = '0'.repeat(64);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}
function validProbabilities(p: PredictionProbabilities): boolean {
  return !!p && [p.positive, p.neutral, p.negative].every(v => finite(v) && v >= 0 && v <= 1) &&
    Math.abs(p.positive + p.neutral + p.negative - 1) < 1e-8;
}
function validatePrediction(p: PredictionSnapshotInput, now: number): void {
  if (!p || !text(p.predictionId) || p.predictionId.length > 128 ||
      !['STOCK', 'OPTION'].includes(p.assetClass) || !/^[A-Z0-9._-]{1,24}$/.test(p.symbol) ||
      !finite(p.createdAt) || !finite(p.targetAt) || p.createdAt <= 0 || p.targetAt <= p.createdAt || p.createdAt > now ||
      !text(p.evidencePackId) || !/^[a-f0-9]{64}$/.test(p.evidencePackSha256) ||
      !finite(p.committeeGeneratedAt) || !finite(p.judgeGeneratedAt) ||
      p.committeeGeneratedAt < p.createdAt || p.judgeGeneratedAt < p.committeeGeneratedAt || p.judgeGeneratedAt > now ||
      !['APPROVE', 'REDUCE', 'REJECT'].includes(p.disposition) || !finite(p.riskMultiplier) ||
      p.riskMultiplier < 0 || p.riskMultiplier > 1 || !finite(p.confidence) || p.confidence < 0 || p.confidence > 1 ||
      !validProbabilities(p.probabilities) || !Array.isArray(p.sourceRefs) || !p.sourceRefs.length || !p.sourceRefs.every(text) ||
      (p.assetClass === 'OPTION' && !text(p.contractId)) || (p.assetClass === 'STOCK' && p.contractId !== undefined) ||
      (p.model && (!text(p.model.provider) || !text(p.model.model) || !text(p.model.promptVersion)))) {
    throw new PredictionJournalError('INVALID_PREDICTION');
  }
}
function validateOutcome(o: PredictionOutcome, p: PredictionSnapshot, now: number): void {
  if (!o || o.assetClass !== p.assetClass) throw new PredictionJournalError('OUTCOME_ASSET_CLASS_MISMATCH');
  if (!finite(o.realizedAt) || !finite(o.observedAt) || o.realizedAt < p.targetAt) throw new PredictionJournalError('OUTCOME_BEFORE_TARGET');
  if (o.observedAt > now || o.realizedAt > o.observedAt || !['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(o.outcome) || !text(o.labelSource)) throw new PredictionJournalError('INVALID_OUTCOME');
  if (o.assetClass === 'STOCK') {
    if (!finite(o.totalReturnPct) || (o.benchmarkReturnPct !== undefined && !finite(o.benchmarkReturnPct))) throw new PredictionJournalError('INVALID_OUTCOME');
  } else if (!finite(o.contractReturnPct) || !finite(o.underlyingReturnPct) || !finite(o.entryPremium) || o.entryPremium <= 0 ||
    !finite(o.exitValue) || o.exitValue < 0 || !['CLOSED', 'MARK_TO_MARKET', 'EXPIRED'].includes(o.exitMethod)) {
    throw new PredictionJournalError('INVALID_OUTCOME');
  }
}
export function verifyPredictionJournal(events: PredictionEvent[]) {
  let previous = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const { eventHash, ...body } = events[i];
    if (events[i].sequence !== i + 1 || events[i].prevHash !== previous || hash(canonical(body)) !== eventHash) {
      return { valid: false, length: events.length, headHash: events.at(-1)?.eventHash || GENESIS, brokenAtSequence: events[i].sequence };
    }
    previous = eventHash;
  }
  return { valid: true, length: events.length, headHash: previous, brokenAtSequence: null };
}

/** In-memory reference implementation. Production persistence must use an atomic append-only adapter. */
export class InMemoryPredictionJournal {
  private events: PredictionEvent[] = [];
  private predictions = new Map<string, PredictionSnapshot>();
  private outcomes = new Map<string, PredictionOutcome>();
  constructor(private readonly now: () => number = Date.now) {}
  listEvents(): PredictionEvent[] { return structuredClone(this.events); }
  getPrediction(id: string): PredictionSnapshot | null { const p = this.predictions.get(id); return p ? structuredClone(p) : null; }
  getOutcome(id: string): PredictionOutcome | null { const o = this.outcomes.get(id); return o ? structuredClone(o) : null; }
  record(input: PredictionSnapshotInput): PredictionSnapshot {
    const now = this.now(); validatePrediction(input, now);
    const inputSha256 = hash(canonical(input));
    const body = { ...structuredClone(input), schemaVersion: '1.0.0' as const, recordedAt: now, inputSha256 };
    const snapshot = { ...body, snapshotSha256: hash(canonical(body)) };
    const old = this.predictions.get(input.predictionId);
    if (old) {
      if (old.inputSha256 === inputSha256) return structuredClone(old);
      throw new PredictionJournalError('PREDICTION_ID_COLLISION');
    }
    this.append({ eventType: 'PREDICTION_RECORDED', prediction: snapshot });
    this.predictions.set(input.predictionId, snapshot);
    return structuredClone(snapshot);
  }
  label(id: string, outcome: PredictionOutcome): PredictionOutcome {
    const p = this.predictions.get(id);
    if (!p) throw new PredictionJournalError('PREDICTION_NOT_FOUND');
    validateOutcome(outcome, p, this.now());
    const old = this.outcomes.get(id);
    if (old) {
      if (canonical(old) === canonical(outcome)) return structuredClone(old);
      throw new PredictionJournalError('OUTCOME_ALREADY_LABELED');
    }
    const value = structuredClone(outcome);
    this.append({ eventType: 'OUTCOME_LABELED', predictionId: id, outcome: value });
    this.outcomes.set(id, value);
    return structuredClone(value);
  }
  private append(body: Omit<PredictionEvent, 'sequence' | 'prevHash' | 'eventHash'>): void {
    const eventBody = { ...body, sequence: this.events.length + 1, prevHash: this.events.at(-1)?.eventHash || GENESIS };
    this.events.push({ ...eventBody, eventHash: hash(canonical(eventBody)) } as PredictionEvent);
    if (!verifyPredictionJournal(this.events).valid) throw new PredictionJournalError('JOURNAL_CHAIN_INVALID');
  }
}
export type CalibrationReport = { assetClass: PredictionAssetClass; sampleSize: number; brierScore: number; accuracy: number; meanConfidence: number; reliability: Array<{ bucket: string; count: number; meanPredictedPositive: number; observedPositiveRate: number }> };
/** One-vs-rest positive Brier score; STOCK and OPTION samples are never pooled. */
export function calculateCalibration(records: Array<{ prediction: PredictionSnapshot; outcome: PredictionOutcome }>, assetClass: PredictionAssetClass): CalibrationReport {
  const rows = records.filter(r => r.prediction.assetClass === assetClass && r.outcome.assetClass === assetClass);
  if (rows.some(r => r.outcome.realizedAt < r.prediction.targetAt)) throw new PredictionJournalError('OUTCOME_BEFORE_TARGET');
  const buckets = Array.from({ length: 5 }, (_, i) => ({ bucket: `${i * 20}-${(i + 1) * 20}%`, count: 0, predicted: 0, positive: 0 }));
  let brier = 0, correct = 0, confidence = 0;
  for (const { prediction, outcome } of rows) {
    const actual = outcome.outcome === 'POSITIVE' ? 1 : 0, predicted = prediction.probabilities.positive;
    brier += (predicted - actual) ** 2;
    if ((predicted >= 0.5) === (actual === 1)) correct++;
    confidence += prediction.confidence;
    const b = buckets[Math.min(4, Math.floor(predicted * 5))]; b.count++; b.predicted += predicted; b.positive += actual;
  }
  const n = rows.length;
  return { assetClass, sampleSize: n, brierScore: n ? brier / n : 0, accuracy: n ? correct / n : 0,
    meanConfidence: n ? confidence / n : 0, reliability: buckets.filter(b => b.count).map(b => ({
      bucket: b.bucket, count: b.count, meanPredictedPositive: b.predicted / b.count, observedPositiveRate: b.positive / b.count,
    })) };
}
