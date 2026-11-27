import { createHash, createSign } from 'node:crypto';

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
    if (!response.ok && response.status !== 404 && response.status !== 409 && response.status !== 412) {
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
      }];
      const commit = await request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
      if (commit.ok) return event;
      const commitError = commit.status === 400 ? await commit.clone().json().catch(() => null) as any : null;
      const isConflict = commit.status === 409 || commit.status === 412 || commitError?.error?.status === 'FAILED_PRECONDITION' || commitError?.error?.status === 'ALREADY_EXISTS';
      if (isConflict) {
        const existing = await request('/' + eventPath + '/' + eventId);
        if (existing.ok) return event;
      }
      if (!isConflict) {
        throw new ExecutionLedgerUnavailableError('Firestore ledger commit failed.');
      }
    }
    throw new ExecutionLedgerUnavailableError('Execution ledger contention exceeded retry limit.');
  }

  async function readEvents(clientOrderId: string): Promise<ExecutionLedgerEvent[]> {
    const orderKey = createHash('sha256').update(clientOrderId).digest('hex');
    const response = await request(`/alpacaExecutionLedger/${orderKey}/events?pageSize=1000&orderBy=sequence`);
    if (!response.ok) return [];
    const body = await response.json() as { documents?: any[] };
    return (body.documents || []).map(doc => fromDocument(doc) as ExecutionLedgerEvent)
      .sort((a, b) => a.sequence - b.sequence);
  }

  return { append, readEvents };
}
