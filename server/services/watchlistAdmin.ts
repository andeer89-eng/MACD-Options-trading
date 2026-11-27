import { createSign } from 'node:crypto';

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function encode(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'object' && value) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encode(v)])) } };
  }
  return { nullValue: null };
}

function decode(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  return null;
}

function decodeDocument(doc: any): Record<string, any> {
  return Object.fromEntries(Object.entries(doc?.fields || {}).map(([k, v]) => [k, decode(v)]));
}

export class WatchlistAdminUnavailableError extends Error {
  constructor(message = 'Watchlist server persistence is unavailable.') {
    super(message);
    this.name = 'WatchlistAdminUnavailableError';
  }
}

export class WatchlistTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchlistTransitionConflictError';
  }
}

export interface WatchlistAdminOptions {
  projectId: string;
  databaseId: string;
  serviceAccountJson: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createWatchlistAdminService(options: WatchlistAdminOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let serviceAccount: { client_email: string; private_key: string; token_uri?: string };
  try {
    serviceAccount = JSON.parse(options.serviceAccountJson);
    if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Missing credentials');
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account credentials.');
  }
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/databases/${encodeURIComponent(options.databaseId)}/documents`;
  let accessToken = '';
  let tokenExpiresAt = 0;

  async function getAccessToken(): Promise<string> {
    if (accessToken && now() < tokenExpiresAt - 60_000) return accessToken;
    const issued = Math.floor(now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: SCOPE,
      aud: serviceAccount.token_uri || TOKEN_URI,
      iat: issued,
      exp: issued + 3600,
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
      throw new WatchlistAdminUnavailableError('Google OAuth token endpoint is unreachable.');
    }
    if (!response.ok) throw new WatchlistAdminUnavailableError(`Google OAuth returned HTTP ${response.status}.`);
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new WatchlistAdminUnavailableError('Google OAuth did not return an access token.');
    accessToken = body.access_token;
    tokenExpiresAt = now() + Math.max(60, body.expires_in || 3600) * 1000;
    return accessToken;
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken();
    try {
      return await fetchImpl(root + path, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
        signal: init.signal || AbortSignal.timeout(8000),
      });
    } catch {
      throw new WatchlistAdminUnavailableError('Firestore request failed.');
    }
  }

  async function markTriggered(input: {
    uid: string;
    symbol: string;
    direction: 'long' | 'short';
    timeframe: string;
    currentPrice: number;
    atr: number;
    setupId: string;
    detectedAt: number;
  }): Promise<{ status: 'TRIGGERED'; symbol: string; updatedAt: string }> {
    const symbol = input.symbol.toUpperCase().trim();
    if (!/^[A-Z0-9.^=_-]{1,20}$/.test(symbol) || !input.uid || input.uid.length > 128) {
      throw new Error('Invalid watchlist identity.');
    }
    const docId = symbol.replace(/[^A-Z0-9_-]/g, '_').slice(0, 128) || 'ITEM';
    const path = `/users/${encodeURIComponent(input.uid)}/watchlistItems/${encodeURIComponent(docId)}`;
    const currentResponse = await request(path);
    if (currentResponse.status === 404) throw new WatchlistTransitionConflictError('Watchlist item was not found.');
    if (!currentResponse.ok) throw new WatchlistAdminUnavailableError(`Firestore read returned HTTP ${currentResponse.status}.`);
    const document = await currentResponse.json() as any;
    const current = decodeDocument(document);
    if (current.ownerId !== input.uid || String(current.symbol || '').toUpperCase() !== symbol) {
      throw new WatchlistTransitionConflictError('Watchlist item ownership could not be verified.');
    }
    if (current.direction !== input.direction) {
      throw new WatchlistTransitionConflictError('Requested trigger direction does not match the saved watchlist thesis.');
    }
    if (!['NEW', 'WATCHING'].includes(current.status)) {
      throw new WatchlistTransitionConflictError(`Cannot trigger watchlist item from state ${String(current.status)}.`);
    }
    const updatedAt = new Date(now()).toISOString();
    const fields = {
      status: encode('TRIGGERED'),
      currentPrice: encode(input.currentPrice),
      atr: encode(input.atr),
      updatedAt: encode(updatedAt),
      triggerEvidence: encode({
        source: 'server-market-divergence',
        direction: input.direction,
        timeframe: input.timeframe,
        setupId: input.setupId,
        detectedAt: input.detectedAt,
        verifiedAt: updatedAt,
      }),
    };
    const query = new URLSearchParams([
      ['updateMask.fieldPaths', 'status'],
      ['updateMask.fieldPaths', 'currentPrice'],
      ['updateMask.fieldPaths', 'atr'],
      ['updateMask.fieldPaths', 'updatedAt'],
      ['updateMask.fieldPaths', 'triggerEvidence'],
      ['currentDocument.updateTime', String(document.updateTime || '')],
    ]);
    const patch = await request(path + '?' + query.toString(), {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    if (patch.status === 409 || patch.status === 412) {
      throw new WatchlistTransitionConflictError('Watchlist item changed during trigger evaluation; retry with fresh market data.');
    }
    if (!patch.ok) throw new WatchlistAdminUnavailableError(`Firestore update returned HTTP ${patch.status}.`);
    return { status: 'TRIGGERED', symbol, updatedAt };
  }

  return { markTriggered };
}
