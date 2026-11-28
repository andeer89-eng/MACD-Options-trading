import { createHash, createSign } from 'node:crypto';
import {
  createDefaultTradingControlState,
  normalizeTradingControlState,
  applyTradingControlUpdate,
  type PersistentTradingControlState,
  type PersistentTradingControlUpdate,
} from './tradingControl.ts';

export type ExecutionEventType =
  | 'ORDER_SUBMITTED'
  | 'ORDER_REPLAYED'
  | 'ORDER_REJECTED'
  | 'ORDER_CANCELED'
  | 'FILL_RECORDED'
  | 'RECONCILIATION';

export interface ExecutionLedgerEvent {
  eventId: string;
  sequence: number;
  eventType: ExecutionEventType;
  clientOrderId: string;
  brokerOrderId?: string;
  symbol: string;
  occurredAt: string;
  payload: Record<string, string | number | boolean | null>;
  prevHash: string;
  entryHash: string;
}

export interface TrackedExecutionOrder {
  clientOrderId: string;
  brokerOrderId?: string;
  symbol: string;
  lastEventType: ExecutionEventType;
  status?: string;
  updatedAt: string;
}

export interface ExecutionLedgerOptions {
  projectId: string;
  serviceAccountJson: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class ExecutionLedgerUnavailableError extends Error {
  constructor(message = 'Persistent execution ledger is unavailable.') {
    super(message);
    this.name = 'ExecutionLedgerUnavailableError';
  }
}

export class ExecutionLedgerConflictError extends Error {
  constructor(message = 'Trading control state changed concurrently. Reload and retry.') {
    super(message);
    this.name = 'ExecutionLedgerConflictError';
  }
}

export type TradingControlState = PersistentTradingControlState;
export type TradingControlUpdate = PersistentTradingControlUpdate;

const GENESIS = '0'.repeat(64);
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().filter(k => obj[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

export function verifyExecutionLedgerChain(events: ExecutionLedgerEvent[]): { valid: boolean; length: number; headHash: string; brokenAtSequence: number | null } {
  let previous = GENESIS;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const { entryHash, ...base } = event;
    const expected = createHash('sha256').update(canonical(base)).digest('hex');
    if (event.sequence !== index + 1 || event.prevHash !== previous || entryHash !== expected) {
      return { valid: false, length: events.length, headHash: events[events.length - 1]?.entryHash || GENESIS, brokenAtSequence: event.sequence };
    }
    previous = entryHash;
  }
  return { valid: true, length: events.length, headHash: previous, brokenAtSequence: null };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function encodeFirestore(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestore) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encodeFirestore(v)])) } };
  }
  return { nullValue: null };
}

function decodeFirestore(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeFirestore(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestore);
  return null;
}

function fields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestore(value)]));
}

function fromDocument(document: any): Record<string, any> {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeFirestore(value)]));
}

export function createExecutionLedger(options: ExecutionLedgerOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let accessToken = '';
  let tokenExpiresAt = 0;
  let serviceAccount: { client_email: string; private_key: string; token_uri?: string };

  try {
    serviceAccount = JSON.parse(options.serviceAccountJson);
    if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Missing service account fields');
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain a valid service-account JSON document.');
  }

  const databaseRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/databases/(default)/documents`;

  async function getAccessToken(): Promise<string> {
    if (accessToken && now() < tokenExpiresAt - 60_000) return accessToken;
    const issued = Math.floor(now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
      iss: serviceAccount.client_email, scope: SCOPE,
      aud: serviceAccount.token_uri || TOKEN_URI,
      iat: issued, exp: issued + 3600,
    }));
    const unsigned = header + '.' + claim;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + '.' + signer.sign(serviceAccount.private_key, 'base64url');
    let response: Response;
    try {
      response = await fetchImpl(serviceAccount.token_uri || TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ExecutionLedgerUnavailableError('Google OAuth token endpoint is unreachable.');
    }
    if (!response.ok) throw new ExecutionLedgerUnavailableError(`Google OAuth returned HTTP ${response.status}.`);
    const token = await response.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token) throw new ExecutionLedgerUnavailableError('Google OAuth did not return an access token.');
    accessToken = token.access_token;
    tokenExpiresAt = now() + Math.max(60, token.expires_in || 3600) * 1000;
    return accessToken;
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken();
    let response: Response;
    try {
      response = await fetchImpl(databaseRoot + path, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
        signal: init.signal || AbortSignal.timeout(8000),
      });
    } catch {
      throw new ExecutionLedgerUnavailableError('Firestore request failed.');
    }
    if (!response.ok && response.status !== 400 && response.status !== 404 && response.status !== 409 && response.status !== 412) {
      throw new ExecutionLedgerUnavailableError(`Firestore returned HTTP ${response.status}.`);
    }
    return response;
  }

  async function append(input: Omit<ExecutionLedgerEvent, 'eventId' | 'sequence' | 'prevHash' | 'entryHash'>): Promise<ExecutionLedgerEvent> {
    if (!input.clientOrderId || input.clientOrderId.length > 128) throw new Error('Invalid client_order_id.');
    const orderKey = createHash('sha256').update(input.clientOrderId).digest('hex');
    const basePath = `alpacaExecutionLedger/${orderKey}`;
    const headPath = basePath + '/metadata/head';
    const eventPath = basePath + '/events';
    const indexPath = `alpacaExecutionOrderIndex/${orderKey}`;
    const occurredAt = input.occurredAt || new Date(now()).toISOString();
    const eventId = createHash('sha256').update(canonical({
      eventType: input.eventType, clientOrderId: input.clientOrderId,
      brokerOrderId: input.brokerOrderId || null, payload: input.payload,
    })).digest('hex');
    const existingResponse = await request('/' + eventPath + '/' + eventId);
    if (existingResponse.ok) return fromDocument(await existingResponse.json()) as ExecutionLedgerEvent;

    for (let attempt = 0; attempt < 5; attempt++) {
      const headResponse = await request('/' + headPath);
      const headDoc = headResponse.ok ? await headResponse.json() as any : null;
      const head = fromDocument(headDoc);
      const indexResponse = await request('/' + indexPath);
      const indexDoc = indexResponse.ok ? await indexResponse.json() as any : null;
      const sequence = (Number(head.sequence) || 0) + 1;
      const prevHash = typeof head.entryHash === 'string' ? head.entryHash : GENESIS;
      const base = { ...input, occurredAt, sequence, prevHash };
      const entryHash = createHash('sha256').update(canonical({ ...base, eventId })).digest('hex');
      const event: ExecutionLedgerEvent = { ...base, eventId, entryHash };

      const writes: any[] = [{
        update: {
          name: `${databaseRoot}/${eventPath}/${eventId}`,
          fields: fields(event as unknown as Record<string, unknown>),
        },
        currentDocument: { exists: false },
      }, {
        update: {
          name: `${databaseRoot}/${headPath}`,
          fields: fields({ sequence, entryHash, updatedAt: occurredAt }),
        },
        currentDocument: headDoc?.updateTime ? { updateTime: headDoc.updateTime } : { exists: false },
      }, {
        update: {
          name: `${databaseRoot}/${indexPath}`,
          fields: fields({
            clientOrderId: input.clientOrderId,
            brokerOrderId: input.brokerOrderId || String(fromDocument(indexDoc).brokerOrderId || ''),
            symbol: input.symbol,
            lastEventType: input.eventType,
            status: String(input.payload.status || fromDocument(indexDoc).status || ''),
            updatedAt: occurredAt,
          }),
        },
        currentDocument: indexDoc?.updateTime ? { updateTime: indexDoc.updateTime } : { exists: false },
      }];
      const commit = await request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
      if (commit.ok) return event;
      const commitError = commit.status === 400 ? await commit.clone().json().catch(() => null) as any : null;
      const isConflict = commit.status === 409 || commit.status === 412 || commitError?.error?.status === 'FAILED_PRECONDITION' || commitError?.error?.status === 'ALREADY_EXISTS';
      if (isConflict) {
        const existing = await request('/' + eventPath + '/' + eventId);
        if (existing.ok) return fromDocument(await existing.json()) as ExecutionLedgerEvent;
      }
      if (!isConflict) {
        throw new ExecutionLedgerUnavailableError('Firestore ledger commit failed.');
      }
    }
    throw new ExecutionLedgerUnavailableError('Execution ledger contention exceeded retry limit.');
  }

  async function readEvents(clientOrderId: string): Promise<ExecutionLedgerEvent[]> {
    if (!clientOrderId || clientOrderId.length > 128) throw new Error('Invalid client_order_id.');
    const orderKey = createHash('sha256').update(clientOrderId).digest('hex');
    const collectionPath = `/alpacaExecutionLedger/${orderKey}/events`;
    const events: ExecutionLedgerEvent[] = [];
    const seenTokens = new Set<string>();
    let pageToken = '';

    // Firestore caps a page at 1,000 documents. Continue until the server
    // explicitly reports there are no more pages; never verify a truncated chain.
    for (let page = 0; page < 10_000; page++) {
      const query = new URLSearchParams({ pageSize: '1000', orderBy: 'sequence' });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await request(`${collectionPath}?${query.toString()}`);
      if (response.status === 404 && page === 0) return [];
      if (!response.ok) {
        throw new ExecutionLedgerUnavailableError('Firestore ledger history could not be read.');
      }
      const body = await response.json() as { documents?: any[]; nextPageToken?: string };
      events.push(...(body.documents || []).map(doc => fromDocument(doc) as ExecutionLedgerEvent));
      const next = body.nextPageToken || '';
      if (!next) return events.sort((a, b) => a.sequence - b.sequence);
      if (seenTokens.has(next)) {
        throw new ExecutionLedgerUnavailableError('Firestore returned a repeated ledger page token.');
      }
      seenTokens.add(next);
      pageToken = next;
    }
    throw new ExecutionLedgerUnavailableError('Execution ledger history exceeded the safe pagination limit.');
  }

  function tradingControlDocumentPath(ownerId: string): string {
    const cleanOwner = String(ownerId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(cleanOwner)) throw new Error('Invalid Firebase owner UID.');
    const ownerKey = createHash('sha256').update(cleanOwner).digest('hex');
    return `/alpacaExecutionControl/tradingControl_${ownerKey}`;
  }

  function defaultTradingControl(ownerId: string): TradingControlState {
    return createDefaultTradingControlState(ownerId, new Date(now()).toISOString());
  }

  async function getTradingControl(ownerId: string): Promise<TradingControlState> {
    const path = tradingControlDocumentPath(ownerId);
    const response = await request(path);
    if (response.status === 404) return defaultTradingControl(ownerId);
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Trading control state could not be read.');
    const document = await response.json() as any;
    const stored = fromDocument(document);
    return normalizeTradingControlState(ownerId, stored, new Date(now()).toISOString());
  }

  async function setTradingControl(ownerId: string, update: TradingControlUpdate): Promise<TradingControlState> {
    if (!Number.isInteger(update.expectedVersion) || update.expectedVersion < 0 ||
        typeof update.stockBotEnabled !== 'boolean' ||
        typeof update.optionBotEnabled !== 'boolean' ||
        typeof update.killSwitchEnabled !== 'boolean') {
      throw new Error('Invalid trading control update.');
    }
    const path = tradingControlDocumentPath(ownerId);
    const response = await request(path);
    const document = response.ok ? await response.json() as any : null;
    if (!response.ok && response.status !== 404) {
      throw new ExecutionLedgerUnavailableError('Trading control state could not be loaded for update.');
    }
    const current = document ? fromDocument(document) : defaultTradingControl(ownerId);
    const currentVersion = Math.max(0, Math.floor(Number(current.version) || 0));
    if (currentVersion !== update.expectedVersion) throw new ExecutionLedgerConflictError();

    const timestamp = new Date(now()).toISOString();
    const currentState = normalizeTradingControlState(ownerId, current, timestamp);
    const next: TradingControlState = applyTradingControlUpdate(currentState, update, timestamp);
    const commit = await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: { name: databaseRoot + path, fields: fields(next as unknown as Record<string, unknown>) },
        currentDocument: document?.updateTime ? { updateTime: document.updateTime } : { exists: false },
      }] }),
    });
    if (commit.status === 409 || commit.status === 412) throw new ExecutionLedgerConflictError();
    if (!commit.ok) throw new ExecutionLedgerUnavailableError('Trading control state could not be persisted.');
    return next;
  }

  async function acquireReconciliationLease(ownerId: string, leaseMs: number): Promise<boolean> {
    if (!ownerId || !Number.isFinite(leaseMs) || leaseMs < 10_000) throw new Error('Invalid reconciliation lease parameters.');
    const path = '/alpacaExecutionControl/reconciliationLease';
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(path);
      const doc = response.ok ? await response.json() as any : null;
      const current = fromDocument(doc);
      const nowMs = now();
      if (doc && Number(current.expiresAt || 0) > nowMs && current.ownerId !== ownerId) return false;
      const expiresAt = nowMs + leaseMs;
      const commit = await request(':commit', {
        method: 'POST',
        body: JSON.stringify({ writes: [{
          update: {
            name: databaseRoot + path,
            fields: fields({ ownerId, expiresAt, updatedAt: new Date(nowMs).toISOString() }),
          },
          currentDocument: doc?.updateTime ? { updateTime: doc.updateTime } : { exists: false },
        }] }),
      });
      if (commit.ok) return true;
      if (commit.status !== 400 && commit.status !== 409 && commit.status !== 412) {
        throw new ExecutionLedgerUnavailableError('Reconciliation lease could not be acquired.');
      }
    }
    return false;
  }

  async function renewReconciliationLease(ownerId: string, leaseMs: number): Promise<boolean> {
    const path = '/alpacaExecutionControl/reconciliationLease';
    const response = await request(path);
    if (!response.ok) return false;
    const doc = await response.json() as any;
    const current = fromDocument(doc);
    if (current.ownerId !== ownerId || Number(current.expiresAt || 0) <= now()) return false;
    const nowMs = now();
    const commit = await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: {
          name: databaseRoot + path,
          fields: fields({ ownerId, expiresAt: nowMs + leaseMs, updatedAt: new Date(nowMs).toISOString() }),
        },
        currentDocument: { updateTime: doc.updateTime },
      }] }),
    });
    return commit.ok;
  }

  async function releaseReconciliationLease(ownerId: string): Promise<void> {
    const path = '/alpacaExecutionControl/reconciliationLease';
    const response = await request(path);
    if (!response.ok) return;
    const doc = await response.json() as any;
    const current = fromDocument(doc);
    if (current.ownerId !== ownerId) return;
    const nowMs = now();
    await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: {
          name: databaseRoot + path,
          fields: fields({ ownerId: '', expiresAt: 0, updatedAt: new Date(nowMs).toISOString() }),
        },
        currentDocument: { updateTime: doc.updateTime },
      }] }),
    });
  }

  async function recordReconciliationRun(run: {
    runId: string;
    startedAt: string;
    completedAt: string;
    status: 'completed' | 'partial' | 'failed' | 'skipped';
    scanned: number;
    reconciled: number;
    skippedTerminal: number;
    failed: number;
    errorCount: number;
    errors: Array<{ clientOrderId: string; error: string }>;
    runType?: string;
    summary?: Record<string, number>;
    rows?: Array<Record<string, string | number>>;
  }): Promise<void> {
    if (!run.runId || run.runId.length > 128) throw new Error('Invalid reconciliation run ID.');
    const path = '/alpacaExecutionRuns/' + encodeURIComponent(run.runId);
    const response = await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: { name: databaseRoot + path, fields: fields(run as unknown as Record<string, unknown>) },
        currentDocument: { exists: false },
      }] }),
    });
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Reconciliation run audit record could not be persisted.');
  }

  async function listReconciliationRuns(options: { limit?: number } = {}): Promise<Record<string, any>[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit || 50)));
    const runs: Record<string, any>[] = [];
    const seenTokens = new Set<string>();
    let pageToken = '';
    for (let page = 0; page < 100; page++) {
      const query = new URLSearchParams({ pageSize: String(Math.min(100, limit - runs.length)), orderBy: 'startedAt desc' });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await request('/alpacaExecutionRuns?' + query.toString());
      if (response.status === 404 && page === 0) return [];
      if (!response.ok) throw new ExecutionLedgerUnavailableError('Reconciliation run history could not be listed.');
      const body = await response.json() as { documents?: any[]; nextPageToken?: string };
      runs.push(...(body.documents || []).map(doc => fromDocument(doc)));
      if (runs.length >= limit) return runs.slice(0, limit);
      const next = body.nextPageToken || '';
      if (!next) return runs;
      if (seenTokens.has(next)) throw new ExecutionLedgerUnavailableError('Firestore returned a repeated reconciliation-run page token.');
      seenTokens.add(next);
      pageToken = next;
    }
    throw new ExecutionLedgerUnavailableError('Reconciliation run history exceeded the safe pagination limit.');
  }

  async function upsertOperationalAlert(input: {
    alertId: string;
    type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    source: string;
    evidence?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    if (!input.alertId || input.alertId.length > 128) throw new Error('Invalid alert ID.');
    const path = '/alpacaExecutionAlerts/' + encodeURIComponent(input.alertId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(path);
      const doc = response.ok ? await response.json() as any : null;
      const current = fromDocument(doc);
      const nowIso = new Date(now()).toISOString();
      const data = {
        alertId: input.alertId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        source: input.source,
        status: 'ACTIVE',
        firstSeenAt: current.firstSeenAt || nowIso,
        lastSeenAt: nowIso,
        occurrenceCount: (Number(current.occurrenceCount) || 0) + 1,
        evidence: input.evidence || {},
        createdAt: current.createdAt || nowIso,
        updatedAt: nowIso,
        resolvedAt: null,
      };
      const commit = await request(':commit', {
        method: 'POST',
        body: JSON.stringify({ writes: [{
          update: { name: databaseRoot + path, fields: fields(data) },
          currentDocument: doc?.updateTime ? { updateTime: doc.updateTime } : { exists: false },
        }] }),
      });
      if (commit.ok) return;
      if (commit.status !== 400 && commit.status !== 409 && commit.status !== 412) {
        throw new ExecutionLedgerUnavailableError('Operational alert could not be persisted.');
      }
    }
    throw new ExecutionLedgerUnavailableError('Operational alert update contention exceeded retry limit.');
  }

  async function resolveOperationalAlert(alertId: string, resolution: string): Promise<void> {
    const path = '/alpacaExecutionAlerts/' + encodeURIComponent(alertId);
    const response = await request(path);
    if (!response.ok) return;
    const doc = await response.json() as any;
    const current = fromDocument(doc);
    if (current.status !== 'ACTIVE') return;
    const nowIso = new Date(now()).toISOString();
    const data = { ...current, status: 'RESOLVED', resolvedAt: nowIso, updatedAt: nowIso, resolution };
    const commit = await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: { name: databaseRoot + path, fields: fields(data) },
        currentDocument: { updateTime: doc.updateTime },
      }] }),
    });
    if (!commit.ok && commit.status !== 400 && commit.status !== 409 && commit.status !== 412) {
      throw new ExecutionLedgerUnavailableError('Operational alert resolution could not be persisted.');
    }
  }

  async function listOperationalAlerts(options: { status?: string; limit?: number } = {}): Promise<Record<string, any>[]> {
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit || 100)));
    const query = new URLSearchParams({ pageSize: String(limit), orderBy: 'updatedAt desc' });
    const response = await request('/alpacaExecutionAlerts?' + query.toString());
    if (response.status === 404) return [];
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Operational alerts could not be listed.');
    const body = await response.json() as { documents?: any[] };
    return (body.documents || []).map(doc => fromDocument(doc))
      .filter(alert => !options.status || alert.status === options.status);
  }

  async function backfillTrackedOrderIndex(options: { maxEvents?: number } = {}): Promise<{
    scannedEvents: number;
    indexedOrders: number;
    alreadyIndexed: number;
    skippedInvalid: number;
  }> {
    const maxEvents = Math.max(1, Math.min(1_000_000, options.maxEvents ?? 500_000));
    const orders = new Map<string, {
      clientOrderId: string;
      brokerOrderId: string;
      symbol: string;
      lastEventType: ExecutionEventType;
      updatedAt: string;
      latestSequence: number;
      status?: string;
      statusSequence: number;
    }>();
    const seenCursors = new Set<string>();
    let cursorName = '';
    let scannedEvents = 0;
    let skippedInvalid = 0;

    for (let page = 0; page < 10_000; page++) {
      const structuredQuery = {
        from: [{ collectionId: 'events', allDescendants: true }],
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: 1000,
        ...(cursorName ? { startAt: { values: [{ referenceValue: cursorName }], before: false } } : {}),
      };
      const response = await request(':runQuery', {
        method: 'POST',
        body: JSON.stringify({ structuredQuery }),
      });
      if (!response.ok) throw new ExecutionLedgerUnavailableError('Historical execution events could not be enumerated for index backfill.');
      const rows = await response.json() as Array<{ document?: any }>;
      const documents = rows.map(row => row.document).filter(Boolean);
      if (!documents.length) break;

      for (const document of documents) {
        scannedEvents++;
        if (scannedEvents > maxEvents) {
          throw new ExecutionLedgerUnavailableError('Historical index backfill exceeded its configured event safety limit.');
        }
        const name = String(document.name || '');
        const match = name.match(/\/alpacaExecutionLedger\/([a-f0-9]{64})\/events\/[^/]+$/);
        const event = fromDocument(document);
        const clientOrderId = String(event.clientOrderId || '');
        if (!match || !clientOrderId || createHash('sha256').update(clientOrderId).digest('hex') !== match[1]) {
          skippedInvalid++;
          continue;
        }
        const sequence = Number(event.sequence);
        if (!Number.isSafeInteger(sequence) || sequence < 1 || !event.symbol || !event.eventType) {
          skippedInvalid++;
          continue;
        }
        const current = orders.get(match[1]);
        const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
        const occurredAt = String(event.occurredAt || '');
        if (!current || sequence > current.latestSequence) {
          orders.set(match[1], {
            clientOrderId,
            brokerOrderId: String(event.brokerOrderId || current?.brokerOrderId || ''),
            symbol: String(event.symbol).toUpperCase(),
            lastEventType: event.eventType as ExecutionEventType,
            updatedAt: occurredAt,
            latestSequence: sequence,
            status: current?.status,
            statusSequence: current?.statusSequence || 0,
          });
        }
        const aggregate = orders.get(match[1])!;
        if (payload.status !== undefined && sequence >= aggregate.statusSequence) {
          aggregate.status = String(payload.status);
          aggregate.statusSequence = sequence;
        }
      }

      const lastName = String(documents[documents.length - 1]?.name || '');
      if (!lastName || seenCursors.has(lastName)) {
        throw new ExecutionLedgerUnavailableError('Historical index backfill encountered a repeated or invalid Firestore cursor.');
      }
      seenCursors.add(lastName);
      cursorName = lastName;
      if (documents.length < 1000) break;
      if (page === 9_999) throw new ExecutionLedgerUnavailableError('Historical index backfill exceeded the safe pagination limit.');
    }

    let indexedOrders = 0;
    let alreadyIndexed = 0;
    for (const [orderKey, order] of orders) {
      const indexPath = '/alpacaExecutionOrderIndex/' + orderKey;
      const existing = await request(indexPath);
      if (existing.ok) {
        alreadyIndexed++;
        continue;
      }
      if (existing.status !== 404) throw new ExecutionLedgerUnavailableError('Existing order index could not be checked during backfill.');
      const nowMs = now();
      const commit = await request(':commit', {
        method: 'POST',
        body: JSON.stringify({ writes: [{
          update: {
            name: databaseRoot + indexPath,
            fields: fields({
              clientOrderId: order.clientOrderId,
              brokerOrderId: order.brokerOrderId,
              symbol: order.symbol,
              lastEventType: order.lastEventType,
              status: order.status || '',
              updatedAt: order.updatedAt || new Date(nowMs).toISOString(),
              backfilledAt: new Date(nowMs).toISOString(),
              backfillSource: 'historical-ledger-events',
            }),
          },
          currentDocument: { exists: false },
        }] }),
      });
      if (commit.ok) indexedOrders++;
      else {
        const errorBody = commit.status === 400 ? await commit.json().catch(() => null) as any : null;
        const conflict = commit.status === 409 || commit.status === 412 ||
          errorBody?.error?.status === 'ALREADY_EXISTS' || errorBody?.error?.status === 'FAILED_PRECONDITION';
        if (conflict) alreadyIndexed++;
        else throw new ExecutionLedgerUnavailableError('Historical order index backfill commit failed.');
      }
    }
    return { scannedEvents, indexedOrders, alreadyIndexed, skippedInvalid };
  }

  async function listTrackedOrdersPage(options: { limit?: number; pageToken?: string } = {}): Promise<{ orders: Array<TrackedExecutionOrder & { indexKey: string }>; nextPageToken: string }> {
    const limit = Math.max(1, Math.min(1000, Math.floor(options.limit || 500)));
    const query = new URLSearchParams({ pageSize: String(limit) });
    if (options.pageToken) query.set('pageToken', options.pageToken);
    const response = await request('/alpacaExecutionOrderIndex?' + query.toString());
    if (response.status === 404) return { orders: [], nextPageToken: '' };
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Tracked execution order index page could not be read.');
    const body = await response.json() as { documents?: any[]; nextPageToken?: string };
    const orders = (body.documents || []).map(doc => ({
      ...fromDocument(doc),
      indexKey: String(doc.name || '').split('/').pop() || '',
    })) as Array<TrackedExecutionOrder & { indexKey: string }>;
    return { orders, nextPageToken: body.nextPageToken || '' };
  }

  async function recordIntegrityAudit(report: Record<string, unknown>): Promise<void> {
    const auditId = String(report.auditId || '');
    if (!auditId || auditId.length > 128) throw new Error('Invalid integrity audit ID.');
    const path = '/alpacaExecutionIntegrityAudits/' + encodeURIComponent(auditId);
    const response = await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: { name: databaseRoot + path, fields: fields(report) },
        currentDocument: { exists: false },
      }] }),
    });
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Integrity audit report could not be persisted.');
  }

  async function recordCoverageAudit(report: Record<string, unknown>): Promise<void> {
    const auditId = String(report.auditId || '');
    if (!auditId || auditId.length > 128) throw new Error('Invalid broker coverage audit ID.');
    const path = '/alpacaExecutionCoverageAudits/' + encodeURIComponent(auditId);
    const response = await request(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [{
        update: { name: databaseRoot + path, fields: fields(report) },
        currentDocument: { exists: false },
      }] }),
    });
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Broker coverage audit report could not be persisted.');
  }

  async function listCoverageAudits(options: { limit?: number } = {}): Promise<Record<string, any>[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit || 20)));
    const query = new URLSearchParams({ pageSize: String(limit), orderBy: 'startedAt desc' });
    const response = await request('/alpacaExecutionCoverageAudits?' + query.toString());
    if (response.status === 404) return [];
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Broker coverage audit history could not be listed.');
    const body = await response.json() as { documents?: any[] };
    return (body.documents || []).map(doc => fromDocument(doc));
  }

  async function listIntegrityAudits(options: { limit?: number } = {}): Promise<Record<string, any>[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit || 20)));
    const query = new URLSearchParams({ pageSize: String(limit), orderBy: 'startedAt desc' });
    const response = await request('/alpacaExecutionIntegrityAudits?' + query.toString());
    if (response.status === 404) return [];
    if (!response.ok) throw new ExecutionLedgerUnavailableError('Integrity audit history could not be listed.');
    const body = await response.json() as { documents?: any[] };
    return (body.documents || []).map(doc => fromDocument(doc));
  }

  async function listTrackedOrders(): Promise<TrackedExecutionOrder[]> {
    const orders: TrackedExecutionOrder[] = [];
    const seenTokens = new Set<string>();
    let pageToken = '';
    for (let page = 0; page < 10_000; page++) {
      const query = new URLSearchParams({ pageSize: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await request(`/alpacaExecutionOrderIndex?${query.toString()}`);
      if (response.status === 404 && page === 0) return [];
      if (!response.ok) throw new ExecutionLedgerUnavailableError('Tracked execution orders could not be listed.');
      const body = await response.json() as { documents?: any[]; nextPageToken?: string };
      for (const doc of body.documents || []) {
        const item = fromDocument(doc);
        if (item.clientOrderId && item.symbol) orders.push(item as TrackedExecutionOrder);
      }
      const next = body.nextPageToken || '';
      if (!next) return orders;
      if (seenTokens.has(next)) throw new ExecutionLedgerUnavailableError('Firestore returned a repeated order-index page token.');
      seenTokens.add(next);
      pageToken = next;
    }
    throw new ExecutionLedgerUnavailableError('Tracked execution order index exceeded the safe pagination limit.');
  }

  return { append, readEvents, listTrackedOrders, listTrackedOrdersPage, recordIntegrityAudit, listIntegrityAudits, recordCoverageAudit, listCoverageAudits, backfillTrackedOrderIndex, getTradingControl, setTradingControl, acquireReconciliationLease, renewReconciliationLease, releaseReconciliationLease, recordReconciliationRun, listReconciliationRuns, upsertOperationalAlert, resolveOperationalAlert, listOperationalAlerts };
}
