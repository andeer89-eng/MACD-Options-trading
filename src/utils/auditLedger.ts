/**
 * Tamper-Evident Hash-Chained Execution & Audit Provenance Ledger
 * Records Alpaca Paper order routing, position exits, and local journal sync
 * checkpoints in an append-only hash chain (`prevHash` -> `entryHash`).
 */

export type AuditEventType =
  | 'ALPACA_ORDER_SUBMITTED'
  | 'ALPACA_ORDER_REJECTED'
  | 'ALPACA_POSITION_CLOSED'
  | 'ALPACA_JOURNAL_SYNCED'
  | 'SETTINGS_SNAPSHOT';

export interface AuditLedgerEvent {
  sequence: number;
  timestamp: string;
  eventType: AuditEventType;
  symbol: string;
  clientOrderId?: string;
  configDigest: string;
  payload: Record<string, string | number | boolean | null>;
  prevHash: string;
  entryHash: string;
}

export interface AuditChainVerification {
  valid: boolean;
  length: number;
  headHash: string;
  brokenAtSequence: number | null;
  reason?: string;
}

export const GENESIS_HASH = '00000000000000000000000000000000';
const AUDIT_LEDGER_STORAGE_KEY = 'trullas_audit_ledger_v1';
const MAX_LOCAL_AUDIT_EVENTS = 500;

/**
 * Canonical deterministic JSON serialization with sorted object keys.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * Deterministic synchronous 128-bit digest (four independent 32-bit FNV-1a/avalanche lanes)
 * producing a 32-character hex fingerprint identical across browser & Node.
 */
export function computeDeterministicDigest(input: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x0100019b, 0x010001a3, 0x010001b1];
  const lanes = [...seeds];

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    for (let l = 0; l < 4; l++) {
      let h = lanes[l] ^ ((code + l * 31 + i * 17) & 0xff);
      h = Math.imul(h, primes[l]) >>> 0;
      h ^= h >>> 13;
      lanes[l] = Math.imul(h, 0x5bd1e995) >>> 0;
    }
  }

  return lanes
    .map((h) => {
      let f = h ^ (h >>> 16);
      f = Math.imul(f, 0x7feb352d) >>> 0;
      f ^= f >>> 15;
      return f.toString(16).padStart(8, '0');
    })
    .join('');
}

export function computeConfigDigest(settings: {
  simCapitalUsd?: number;
  maxRiskPerTradePct?: number;
  dailyLossLimitPct?: number;
  maxSectorExposurePct?: number;
  botStatus?: string;
  activeEpochId?: string;
}): string {
  return computeDeterministicDigest(canonicalStringify(settings)).slice(0, 16);
}

export function computeAuditEntryHash(
  fields: Omit<AuditLedgerEvent, 'entryHash'>
): string {
  return computeDeterministicDigest(canonicalStringify(fields));
}

export function appendAuditEvent(
  chain: AuditLedgerEvent[],
  input: {
    eventType: AuditEventType;
    symbol: string;
    clientOrderId?: string;
    configDigest: string;
    payload: Record<string, string | number | boolean | null>;
    timestamp?: string;
  }
): AuditLedgerEvent[] {
  const prev = chain.length > 0 ? chain[chain.length - 1] : null;
  const sequence = prev ? prev.sequence + 1 : 1;
  const prevHash = prev ? prev.entryHash : GENESIS_HASH;
  const baseFields: Omit<AuditLedgerEvent, 'entryHash'> = {
    sequence,
    timestamp: input.timestamp || new Date().toISOString(),
    eventType: input.eventType,
    symbol: input.symbol.trim().toUpperCase(),
    ...(input.clientOrderId ? { clientOrderId: input.clientOrderId } : {}),
    configDigest: input.configDigest,
    payload: input.payload,
    prevHash,
  };
  const entryHash = computeAuditEntryHash(baseFields);
  return [...chain, { ...baseFields, entryHash }];
}

export function verifyAuditChain(chain: AuditLedgerEvent[]): AuditChainVerification {
  if (!Array.isArray(chain) || chain.length === 0) {
    return {
      valid: true,
      length: 0,
      headHash: GENESIS_HASH,
      brokenAtSequence: null,
    };
  }

  // Note: allow truncated rolling tail chains where sequence > 1 only if prevHash isn't verified to GENESIS,
  // OR verify exact continuity between every adjacent link and recompute every entryHash.
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    const { entryHash, ...rest } = item;
    const expectedHash = computeAuditEntryHash(rest);
    if (entryHash !== expectedHash) {
      return {
        valid: false,
        length: chain.length,
        headHash: chain[chain.length - 1]?.entryHash || GENESIS_HASH,
        brokenAtSequence: item.sequence,
        reason: `Entry hash mismatch at sequence #${item.sequence}`,
      };
    }

    if (i === 0) {
      if (item.sequence === 1 && item.prevHash !== GENESIS_HASH) {
        return {
          valid: false,
          length: chain.length,
          headHash: chain[chain.length - 1]?.entryHash || GENESIS_HASH,
          brokenAtSequence: item.sequence,
          reason: 'Genesis prevHash mismatch at sequence #1',
        };
      }
    } else {
      const prev = chain[i - 1];
      if (item.prevHash !== prev.entryHash || item.sequence !== prev.sequence + 1) {
        return {
          valid: false,
          length: chain.length,
          headHash: chain[chain.length - 1]?.entryHash || GENESIS_HASH,
          brokenAtSequence: item.sequence,
          reason: `Chain link broken between sequence #${prev.sequence} and #${item.sequence}`,
        };
      }
    }
  }

  return {
    valid: true,
    length: chain.length,
    headHash: chain[chain.length - 1].entryHash,
    brokenAtSequence: null,
  };
}

export function loadAuditLedger(): AuditLedgerEvent[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = localStorage.getItem(AUDIT_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordAuditEventToLedger(input: {
  eventType: AuditEventType;
  symbol: string;
  clientOrderId?: string;
  configDigest: string;
  payload: Record<string, string | number | boolean | null>;
  timestamp?: string;
}): { chain: AuditLedgerEvent[]; verification: AuditChainVerification } {
  const existing = loadAuditLedger();
  const next = appendAuditEvent(existing, input);
  const bounded = next.length > MAX_LOCAL_AUDIT_EVENTS ? next.slice(-MAX_LOCAL_AUDIT_EVENTS) : next;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(AUDIT_LEDGER_STORAGE_KEY, JSON.stringify(bounded));
      window.dispatchEvent(new CustomEvent('trullas-audit-ledger-updated'));
    }
  } catch {
    // Ignore quota errors
  }
  return {
    chain: bounded,
    verification: verifyAuditChain(bounded),
  };
}

export function exportAuditLedgerJSON(chain: AuditLedgerEvent[]): string {
  const verification = verifyAuditChain(chain);
  return JSON.stringify(
    {
      schema: 'stageledger-hash-chain-v1',
      exportedAt: new Date().toISOString(),
      verification,
      events: chain,
    },
    null,
    2
  );
}
