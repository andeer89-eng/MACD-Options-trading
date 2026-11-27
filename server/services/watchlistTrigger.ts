import { createHash, createSign } from 'node:crypto';

type FetchLike = typeof fetch;
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export type WatchlistTriggerInput = {
  ownerId: string;
  symbol: string;
  triggerId: string;
  evidence: {
    ruleId: string;
    source: string;
    observedPrice: number;
    threshold: number;
    evaluatedAt: string;
  };
};

export class WatchlistTriggerError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'WatchlistTriggerError';
  }
}

function encode(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'object' && value) {
    return { mapValue: { fields: Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, encode(item)])
    ) } };
  }
  return { nullValue: null };
}

function decodeFields(document: any): Record<string, any> {
  const decode = (value: any): any => {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('mapValue' in value) return decodeFields({ fields: value.mapValue.fields });
    return null;
  };
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decode(value)]));
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createWatchlistTriggerService(options: {
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
      throw new WatchlistTriggerError('Google OAuth is unavailable.', 503);
    }
    if (!response.ok) throw new WatchlistTriggerError('Google OAuth rejected the service account.', 503);
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new WatchlistTriggerError('Google OAuth returned no access token.', 503);
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
      throw new WatchlistTriggerError('Firestore request failed.', 503);
    }
  }

  async function transition(input: WatchlistTriggerInput): Promise<{ status: 'TRIGGERED'; replayed: boolean }> {
    const ownerId = input.ownerId;
    const symbol = input.symbol.toUpperCase();
    const docId = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const eventId = createHash('sha256').update(input.triggerId).digest('hex');
    const eventPath = '/watchlistTriggerEvents/' + eventId;
    const existingEvent = await firestore(eventPath);
    if (existingEvent.ok) {
      const event = decodeFields(await existingEvent.json());
      if (event.ownerId !== ownerId || event.symbol !== symbol) {
        throw new WatchlistTriggerError('triggerId was already used for a different watchlist item.', 409);
      }
      return { status: 'TRIGGERED', replayed: true };
    }
    if (existingEvent.status !== 404) throw new WatchlistTriggerError('Trigger idempotency check failed.', 503);

    const itemPath = `/users/${encodeURIComponent(ownerId)}/watchlistItems/${encodeURIComponent(docId)}`;
    const itemResponse = await firestore(itemPath);
    if (itemResponse.status === 404) throw new WatchlistTriggerError('Watchlist item not found.', 404);
    if (!itemResponse.ok) throw new WatchlistTriggerError('Watchlist item could not be read.', 503);
    const item = await itemResponse.json() as any;
    const current = decodeFields(item);
    if (!['NEW', 'WATCHING'].includes(current.status)) {
      throw new WatchlistTriggerError(`Cannot trigger an item in status ${String(current.status)}.`, 409);
    }

    const triggeredAt = new Date(now()).toISOString();
    const event = {
      triggerId: input.triggerId,
      ownerId,
      symbol,
      ruleId: input.evidence.ruleId,
      source: input.evidence.source,
      observedPrice: input.evidence.observedPrice,
      threshold: input.evidence.threshold,
      evaluatedAt: input.evidence.evaluatedAt,
      triggeredAt,
      previousStatus: current.status,
      status: 'TRIGGERED',
    };
    const fields = (data: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
    const itemFields = fields({ status: 'TRIGGERED' });
    itemFields.updatedAt = { timestampValue: triggeredAt };
    const commit = await firestore(':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: [
        {
          update: {
            name: root + itemPath,
            fields: itemFields,
          },
          updateMask: { fieldPaths: ['status', 'updatedAt'] },
          currentDocument: { updateTime: item.updateTime },
        },
        {
          update: {
            name: root + eventPath,
            fields: fields(event),
          },
          currentDocument: { exists: false },
        },
      ] }),
    });
    if (commit.ok) return { status: 'TRIGGERED', replayed: false };
    if (commit.status === 409 || commit.status === 412 || commit.status === 400) {
      throw new WatchlistTriggerError('Watchlist item changed concurrently or triggerId already exists; reload and retry with a new evaluation.', 409);
    }
    throw new WatchlistTriggerError('Trigger transition could not be persisted.', 503);
  }

  return { transition };
}
