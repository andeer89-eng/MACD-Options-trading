import { createHash, createSign } from 'node:crypto';
import type { PredictionEvent } from './predictionJournal.ts';

type FetchLike = typeof fetch;
type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
type EventBody =
  | { eventType: 'PREDICTION_RECORDED'; prediction: Extract<PredictionEvent, { eventType: 'PREDICTION_RECORDED' }>['prediction'] }
  | { eventType: 'OUTCOME_LABELED'; predictionId: string; outcome: Extract<PredictionEvent, { eventType: 'OUTCOME_LABELED' }>['outcome'] };

export class FirestorePredictionJournalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FirestorePredictionJournalError';
  }
}

const GENESIS = '0'.repeat(64);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().filter(key => record[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
}
const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const stringValue = (value: string) => ({ stringValue: value });
const integerValue = (value: number) => ({ integerValue: String(value) });

export function createFirestorePredictionJournal(options: {
  projectId: string;
  databaseId?: string;
  serviceAccountJson: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  maxRetries?: number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const maxRetries = Math.min(8, Math.max(1, options.maxRetries ?? 5));
  let account: ServiceAccount;
  try {
    account = JSON.parse(options.serviceAccountJson);
    if (!account.client_email || !account.private_key) throw new Error('Missing service account fields.');
  } catch {
    throw new FirestorePredictionJournalError('FIREBASE_SERVICE_ACCOUNT_JSON is invalid.', 500);
  }

  const databaseId = options.databaseId || '(default)';
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  const collection = (ownerId: string) => `users/${encodeURIComponent(ownerId)}/predictionJournalEvents`;
  const headPath = (ownerId: string) => `users/${encodeURIComponent(ownerId)}/predictionJournalMeta/head`;
  let cachedToken = '';
  let tokenExpiresAt = 0;

  async function accessToken(): Promise<string> {
    if (cachedToken && now() < tokenExpiresAt - 60_000) return cachedToken;
    const issuedAt = Math.floor(now() / 1000);
    const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
    const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
      b64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore',
        aud: tokenUri, iat: issuedAt, exp: issuedAt + 3600 }));
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + '.' + signer.sign(account.private_key, 'base64url');
    let response: Response;
    try {
      response = await fetchImpl(tokenUri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
        signal: AbortSignal.timeout(8000) });
    } catch {
      throw new FirestorePredictionJournalError('Google OAuth is unavailable.', 503);
    }
    if (!response.ok) throw new FirestorePredictionJournalError('Google OAuth rejected the service account.', 503);
    const token = await response.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token) throw new FirestorePredictionJournalError('Google OAuth returned no access token.', 503);
    cachedToken = token.access_token;
    tokenExpiresAt = now() + Math.max(60, token.expires_in || 3600) * 1000;
    return cachedToken;
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await accessToken();
    try {
      return await fetchImpl(root + path, { ...init, headers: { Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', ...(init.headers || {}) }, signal: init.signal || AbortSignal.timeout(8000) });
    } catch {
      throw new FirestorePredictionJournalError('Firestore request failed.', 503);
    }
  }

  async function append(ownerId: string, body: EventBody): Promise<{ event: PredictionEvent; replayed: boolean }> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) || !body ||
        (body.eventType === 'PREDICTION_RECORDED' && body.prediction.schemaVersion !== '1.0.0') ||
        (body.eventType === 'OUTCOME_LABELED' && !/^[A-Za-z0-9_-]{1,128}$/.test(body.predictionId))) {
      throw new FirestorePredictionJournalError('Invalid prediction journal append input.', 400);
    }
    const bodyJson = canonical(body);
    const idempotencyId = hash(bodyJson);
    const eventsPath = collection(ownerId);
    const eventName = `${root}/${eventsPath}/${idempotencyId}`;
    const metaName = `${root}/${headPath(ownerId)}`;

    // Deterministic event IDs make retries safe even if the commit succeeded but its response was lost.
    const existingResponse = await request(`/${eventsPath}/${idempotencyId}`);
    if (existingResponse.ok) {
      const existing = await existingResponse.json() as { fields?: Record<string, { stringValue?: string }> };
      const stored = existing.fields?.eventJson?.stringValue;
      if (!stored) throw new FirestorePredictionJournalError('Existing journal event is malformed.', 500);
      const event = JSON.parse(stored) as PredictionEvent;
      return { event, replayed: true };
    }
    if (existingResponse.status !== 404) throw new FirestorePredictionJournalError('Journal idempotency lookup failed.', 503);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const metaResponse = await request(`/${headPath(ownerId)}`);
      let sequence = 0;
      let previousHash = GENESIS;
      let updateTime: string | undefined;
      if (metaResponse.ok) {
        const meta = await metaResponse.json() as { updateTime?: string; fields?: Record<string, { integerValue?: string; stringValue?: string }> };
        sequence = Number(meta.fields?.sequence?.integerValue ?? 0);
        previousHash = meta.fields?.headHash?.stringValue ?? GENESIS;
        updateTime = meta.updateTime;
        if (!Number.isSafeInteger(sequence) || sequence < 0 || !/^[a-f0-9]{64}$/.test(previousHash) || !updateTime) {
          throw new FirestorePredictionJournalError('Prediction journal head is malformed.', 500);
        }
      } else if (metaResponse.status !== 404) {
        throw new FirestorePredictionJournalError('Prediction journal head could not be read.', 503);
      }

      const eventBody = { ...body, sequence: sequence + 1, prevHash: previousHash };
      const eventHash = hash(canonical(eventBody));
      const event: PredictionEvent = { ...eventBody, eventHash } as PredictionEvent;
      const eventFields = {
        ownerId: stringValue(ownerId),
        sequence: integerValue(sequence + 1),
        eventType: stringValue(body.eventType),
        eventJson: stringValue(canonical(event)),
        eventHash: stringValue(eventHash),
      };
      const metaFields = { ownerId: stringValue(ownerId), sequence: integerValue(sequence + 1), headHash: stringValue(eventHash) };
      const writes = [
        { update: { name: eventName, fields: eventFields }, currentDocument: { exists: false } },
        { update: { name: metaName, fields: metaFields }, currentDocument: updateTime ? { updateTime } : { exists: false } },
      ];
      const commit = await request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
      if (commit.ok) return { event, replayed: false };
      const detail = await commit.text();
      // A competing append may win the head precondition. Re-read and append at the next sequence.
      if (commit.status === 409 || (commit.status === 400 && /FAILED_PRECONDITION|ALREADY_EXISTS|ABORTED/i.test(detail))) {
        const replay = await request(`/${eventsPath}/${idempotencyId}`);
        if (replay.ok) {
          const saved = await replay.json() as { fields?: Record<string, { stringValue?: string }> };
          const stored = saved.fields?.eventJson?.stringValue;
          if (stored) return { event: JSON.parse(stored) as PredictionEvent, replayed: true };
        }
        continue;
      }
      throw new FirestorePredictionJournalError('Prediction journal atomic append failed.', 503);
    }
    throw new FirestorePredictionJournalError('Prediction journal remained contended after retry limit.', 409);
  }


  async function readAll(ownerId: string, pageSize = 500): Promise<{ events: PredictionEvent[]; verification: { valid: boolean; length: number; headHash: string; brokenAtSequence: number | null } }> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)) {
      throw new FirestorePredictionJournalError('Invalid prediction journal owner.', 400);
    }
    const safePageSize = Math.min(1000, Math.max(1, Math.floor(pageSize)));
    const events: PredictionEvent[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      if (++pages > 1000) throw new FirestorePredictionJournalError('Prediction journal exceeds replay safety limit.', 413);
      const params = new URLSearchParams({ pageSize: String(safePageSize), orderBy: 'sequence' });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await request(`/${collection(ownerId)}?${params.toString()}`);
      if (!response.ok) throw new FirestorePredictionJournalError('Prediction journal events could not be read.', 503);
      const page = await response.json() as {
        documents?: Array<{ fields?: Record<string, { stringValue?: string }> }>;
        nextPageToken?: string;
      };
      for (const document of page.documents || []) {
        const raw = document.fields?.eventJson?.stringValue;
        if (!raw) throw new FirestorePredictionJournalError('Stored prediction journal event is malformed.', 500);
        let event: PredictionEvent;
        try { event = JSON.parse(raw) as PredictionEvent; }
        catch { throw new FirestorePredictionJournalError('Stored prediction journal event is not valid JSON.', 500); }
        events.push(event);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    const metaResponse = await request(`/${headPath(ownerId)}`);
    let expectedSequence = 0;
    let expectedHead = GENESIS;
    if (metaResponse.ok) {
      const meta = await metaResponse.json() as { fields?: Record<string, { integerValue?: string; stringValue?: string }> };
      expectedSequence = Number(meta.fields?.sequence?.integerValue ?? 0);
      expectedHead = meta.fields?.headHash?.stringValue ?? GENESIS;
    } else if (metaResponse.status !== 404) {
      throw new FirestorePredictionJournalError('Prediction journal head could not be read.', 503);
    }

    let previous = GENESIS;
    for (let index = 0; index < events.length; index++) {
      const { eventHash, ...eventBody } = events[index];
      if (events[index].sequence !== index + 1 || events[index].prevHash !== previous ||
          !/^[a-f0-9]{64}$/.test(eventHash) || hash(canonical(eventBody)) !== eventHash) {
        return { events, verification: { valid: false, length: events.length, headHash: events.at(-1)?.eventHash || GENESIS,
          brokenAtSequence: events[index].sequence } };
      }
      previous = eventHash;
    }
    const valid = events.length === expectedSequence && previous === expectedHead;
    return { events, verification: { valid, length: events.length, headHash: previous,
      brokenAtSequence: valid ? null : events.length + 1 } };
  }

  return { append, readAll };
}
