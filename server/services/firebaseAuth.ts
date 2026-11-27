import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const FIREBASE_SIGNING_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_TOKEN_LENGTH = 8 * 1024;

type FirebaseClaims = {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  auth_time?: unknown;
};

type FirebaseAuthOptions = {
  projectId: string;
  allowedUids: readonly string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export class FirebaseAuthUnavailableError extends Error {
  constructor(message = 'Firebase token verification is temporarily unavailable.') {
    super(message);
    this.name = 'FirebaseAuthUnavailableError';
  }
}

function decodeJwtObject(segment: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error('Malformed Firebase ID token.');
  }
  const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed Firebase ID token.');
  }
  return value as Record<string, unknown>;
}

function readUnixSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cacheDurationMs(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\\s*max-age=(\\d+)/i);
  const seconds = match ? Number(match[1]) : 300;
  if (!Number.isFinite(seconds)) return 300_000;
  return Math.min(6 * 60 * 60_000, Math.max(60_000, seconds * 1000));
}

export function createFirebaseIdTokenVerifier(options: {
  projectId: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cachedCerts: Record<string, string> = {};
  let certsExpireAt = 0;

  async function loadSigningCerts(forceRefresh = false): Promise<Record<string, string>> {
    if (!forceRefresh && now() < certsExpireAt && Object.keys(cachedCerts).length > 0) {
      return cachedCerts;
    }

    let response: Response;
    try {
      response = await fetchImpl(FIREBASE_SIGNING_CERTS_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new FirebaseAuthUnavailableError();
    }

    if (!response.ok) {
      throw new FirebaseAuthUnavailableError(
        `Firebase signing certificate endpoint returned HTTP ${response.status}.`
      );
    }

    let certs: unknown;
    try {
      certs = await response.json();
    } catch {
      throw new FirebaseAuthUnavailableError('Firebase signing certificates could not be decoded.');
    }

    if (!certs || typeof certs !== 'object' || Array.isArray(certs)) {
      throw new FirebaseAuthUnavailableError('Firebase signing certificate response is invalid.');
    }

    const entries = Object.entries(certs as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].includes('BEGIN CERTIFICATE')
    );
    if (entries.length === 0) {
      throw new FirebaseAuthUnavailableError('No Firebase signing certificates were returned.');
    }

    cachedCerts = Object.fromEntries(entries);
    certsExpireAt = now() + cacheDurationMs(response.headers.get('cache-control'));
    return cachedCerts;
  }

  return async function verifyFirebaseIdToken(token: string): Promise<{ uid: string }> {
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      throw new Error('Invalid Firebase ID token.');
    }

    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error('Malformed Firebase ID token.');
    }

    const header = decodeJwtObject(parts[0]);
    const claims = decodeJwtObject(parts[1]) as FirebaseClaims;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
      throw new Error('Unsupported Firebase ID token signature.');
    }

    let certs = await loadSigningCerts();
    if (!certs[header.kid]) {
      certs = await loadSigningCerts(true);
    }
    const certificate = certs[header.kid];
    if (!certificate) {
      throw new Error('Unknown Firebase ID token signing key.');
    }

    let signature: Buffer;
    try {
      signature = Buffer.from(parts[2], 'base64url');
      if (signature.length === 0) throw new Error('Empty signature.');
      const publicKey = createPublicKey(certificate);
      const valid = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        publicKey,
        signature
      );
      if (!valid) throw new Error('Invalid Firebase ID token signature.');
    } catch {
      throw new Error('Invalid Firebase ID token signature.');
    }

    const currentTime = Math.floor(now() / 1000);
    const expiresAt = readUnixSeconds(claims.exp);
    const issuedAt = readUnixSeconds(claims.iat);
    const authenticatedAt = readUnixSeconds(claims.auth_time);

    if (
      claims.aud !== options.projectId ||
      claims.iss !== `https://securetoken.google.com/${options.projectId}` ||
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      claims.sub.length > 128 ||
      expiresAt === null ||
      issuedAt === null ||
      authenticatedAt === null ||
      expiresAt <= currentTime ||
      issuedAt > currentTime + CLOCK_SKEW_SECONDS ||
      authenticatedAt > currentTime + CLOCK_SKEW_SECONDS ||
      expiresAt <= issuedAt
    ) {
      throw new Error('Firebase ID token claims are invalid or expired.');
    }

    return { uid: claims.sub };
  };
}

export function createFirebaseAlpacaAuthMiddleware(options: FirebaseAuthOptions) {
  const allowedUids = new Set(options.allowedUids.map((uid) => uid.trim()).filter(Boolean));
  const verifyFirebaseIdToken = createFirebaseIdTokenVerifier({
    projectId: options.projectId,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });

  return async function requireFirebaseAlpacaUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');

    // A Firebase-authenticated user must also be explicitly trusted to operate
    // the single server-side Alpaca account. Never default to all app users.
    if (allowedUids.size === 0) {
      res.status(503).json({ error: 'Alpaca API authorization is not configured.' });
      return;
    }

    const authorization = req.header('authorization') || '';
    const match = /^Bearer\\s+([^\\s]+)$/i.exec(authorization);
    if (!match) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    try {
      const { uid } = await verifyFirebaseIdToken(match[1]);
      if (!allowedUids.has(uid)) {
        res.status(403).json({ error: 'This account is not authorized to access Alpaca.' });
        return;
      }
      next();
    } catch (error) {
      if (error instanceof FirebaseAuthUnavailableError) {
        res.status(503).json({ error: 'Authentication service temporarily unavailable.' });
        return;
      }
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };
}
