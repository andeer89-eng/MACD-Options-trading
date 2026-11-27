import { createHash, createSign } from 'node:crypto';

type FetchLike = typeof fetch;
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export type WatchlistEvaluationJournalInput = {
  ownerId: string;
  symbol: string;
  setupId: string;
  ruleVersion: string;
  status: 'TRIGGERED' | 'NOT_TRIGGERED' | 'INVALIDATED' | 'INVALID_INPUT';
  evaluatedAt: number;
  lastClosedCandleTimestamp: number;
  marketDataProvider: string;
  normalizedPayloadSha256: string;
  reason?: string;
  direction?: 'BULLISH' | 'BEARISH';
  threshold?: number;
  previousClose?: number;
  observedClose?: number;
  triggerCandleTimestamp?: number;
};

export type WatchlistEvaluationJournalResult = {
  evaluationId: string;
  replayed: boolean;
};

export class WatchlistEvaluationJournalError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'WatchlistEvaluationJournalError';
  }
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function encodeString(value: string) {
  return { stringValue: value };
}

function decodeString(document: any, field: string): string | undefined {
  const value = document?.fields?.[field]?.stringValue;
  return typeof value === 'string' ? value : undefined;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return '{' + entries.map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function createWatchlistEvaluationId(input: WatchlistEvaluationJournalInput): string {
  const identity = [
    input.ownerId,
    input.symbol.trim().toUpperCase(),
    input.setupId,
    input.ruleVersion,
    String(input.lastClosedCandleTimestamp),
    input.normalizedPayloadSha256,
  ].join('|');
  return createHash('sha256').update(identity).digest('hex');
}

export function createWatchlistEvaluationJournal(options: {
  projectId: string;
  databaseId?: string;
  serviceAccountJson: string;
  fetchImpl?: FetchLike;
  now?: () => number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let account: ServiceAccount;
  try {
    account = JSON.parse(options.serviceAccountJson);
    if (!account.client_email || !account.private_key) throw new Error('Missing service account fields.');
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid.');
  }

  const databaseId = options.databaseId || '(default)';
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  let cachedToken = '';
  let tokenExpiresAt = 0;

  async function accessToken(): Promise<string> {
    if (cachedToken && now() < tokenExpiresAt - 60_000) return cachedToken;
    const issuedAt = Math.floor(now() / 1000);
    const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: tokenUri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }));
    const unsigned = header + '.' + claim;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + '.' + signer.sign(account.private_key, 'base64url');
    let response: Response;
    try {
      response = await fetchImpl(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new WatchlistEvaluationJournalError('Google OAuth is unavailable.', 503);
    }
    if (!response.ok) throw new WatchlistEvaluationJournalError('Google OAuth rejected the service account.', 503);
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new WatchlistEvaluationJournalError('Google OAuth returned no access token.', 503);
    cachedToken = body.access_token;
    tokenExpiresAt = now() + Math.max(60, body.expires_in || 3600) * 1000;
    return cachedToken;
  }

  async function firestore(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await accessToken();
    try {
      return await fetchImpl(root + path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
        signal: init.signal || AbortSignal.timeout(8000),
      });
    } catch {
      throw new WatchlistEvaluationJournalError('Firestore request failed.', 503);
    }
  }

  async function append(input: WatchlistEvaluationJournalInput): Promise<WatchlistEvaluationJournalResult> {
    if (
      !input || typeof input.ownerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.ownerId) ||
      typeof input.symbol !== 'string' || !/^[A-Za-z0-9.=_-]{1,20}$/.test(input.symbol) ||
      typeof input.setupId !== 'string' || input.setupId.length < 1 || input.setupId.length > 160 ||
      typeof input.ruleVersion !== 'string' || input.ruleVersion.length < 1 || input.ruleVersion.length > 64 ||
      !['TRIGGERED', 'NOT_TRIGGERED', 'INVALIDATED', 'INVALID_INPUT'].includes(input.status) ||
      !Number.isFinite(input.evaluatedAt) || input.evaluatedAt <= 0 ||
      !Number.isFinite(input.lastClosedCandleTimestamp) || input.lastClosedCandleTimestamp <= 0 ||
      typeof input.marketDataProvider !== 'string' || input.marketDataProvider.length < 1 || input.marketDataProvider.length > 80 ||
      typeof input.normalizedPayloadSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.normalizedPayloadSha256)
    ) {
      throw new WatchlistEvaluationJournalError('Invalid watchlist evaluation journal input.', 400);
    }

    const symbol = input.symbol.trim().toUpperCase();
    const normalized = { ...input, symbol };
    const evaluationId = createWatchlistEvaluationId(normalized);
    const recordJson = canonicalJson(normalized);
    const path = '/watchlistEvaluationEvents?documentId=' + encodeURIComponent(evaluationId);
    const createdAt = new Date(now()).toISOString();
    const body = {
      fields: {
        evaluationId: encodeString(evaluationId),
        ownerId: encodeString(input.ownerId),
        symbol: encodeString(symbol),
        recordJson: encodeString(recordJson),
        createdAt: encodeString(createdAt),
      },
    };

    const response = await firestore(path, { method: 'POST', body: JSON.stringify(body) });
    if (response.ok) return { evaluationId, replayed: false };
    if (response.status !== 409) {
      throw new WatchlistEvaluationJournalError('Evaluation journal append failed.', 503);
    }

    const existingResponse = await firestore('/watchlistEvaluationEvents/' + encodeURIComponent(evaluationId));
    if (!existingResponse.ok) {
      throw new WatchlistEvaluationJournalError('Existing evaluation journal record could not be verified.', 503);
    }
    const existing = await existingResponse.json();
    if (decodeString(existing, 'recordJson') !== recordJson) {
      throw new WatchlistEvaluationJournalError('Evaluation identity already exists with different evidence.', 409);
    }
    return { evaluationId, replayed: true };
  }

  return { append };
}
