import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createExecutionLedger, verifyExecutionLedgerChain } from './services/executionLedger.ts';

function decode(value: any): any {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return null;
}

function createFirestoreMock() {
  const documents = new Map<string, { name: string; fields: Record<string, unknown>; updateTime: string }>();
  let version = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
    }
    const marker = '/databases/(default)/documents';
    const path = url.slice(url.indexOf(marker) + marker.length);
    if (init?.method === 'POST' && path === ':commit') {
      const body = JSON.parse(String(init.body));
      for (const write of body.writes) {
        const current = documents.get(write.update.name);
        if (write.currentDocument?.exists === false && current) return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 400 });
        if (write.currentDocument?.exists === false && !current) continue;
        if (write.currentDocument?.updateTime && current?.updateTime !== write.currentDocument.updateTime) {
          return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 400 });
        }
      }
      for (const write of body.writes) {
        version += 1;
        documents.set(write.update.name, { name: write.update.name, fields: write.update.fields, updateTime: String(version) });
      }
      return new Response(JSON.stringify({ writeResults: body.writes.map(() => ({})) }), { status: 200 });
    }
    if ((!init?.method || init.method === 'GET') && path.includes('?pageSize=')) {
      const collectionPath = path.split('?')[0];
      const prefix = 'https://firestore.googleapis.com/v1/projects/test-project' + marker + collectionPath + '/';
      const found = [...documents.values()].filter(doc => doc.name.startsWith(prefix));
      return new Response(JSON.stringify({ documents: found }), { status: 200 });
    }
    if (!init?.method || init.method === 'GET') {
      const name = 'https://firestore.googleapis.com/v1/projects/test-project' + marker + path;
      const doc = documents.get(name);
      return doc
        ? new Response(JSON.stringify(doc), { status: 200 })
        : new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
    }
    return new Response('unexpected request', { status: 500 });
  };
  return { fetchImpl, documents };
}

describe('Persistent Firestore execution ledger', () => {
  it('appends a hash chain, deduplicates repeated events, and reads verifiable history', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const mock = createFirestoreMock();
    const ledger = createExecutionLedger({
      projectId: 'test-project',
      serviceAccountJson: JSON.stringify({ client_email: 'ledger@test-project.iam.gserviceaccount.com', private_key: privateKey }),
      fetchImpl: mock.fetchImpl,
      now: () => Date.UTC(2026, 10, 27, 12, 0, 0),
    });
    const firstInput = {
      eventType: 'ORDER_SUBMITTED' as const,
      clientOrderId: 'test-order-001',
      brokerOrderId: 'broker-001',
      symbol: 'AAPL',
      occurredAt: '2026-11-27T12:00:00.000Z',
      payload: { status: 'accepted', qty: 2, side: 'buy' },
    };
    const first = await ledger.append(firstInput);
    const replay = await ledger.append(firstInput);
    assert.equal(first.eventId, replay.eventId);
    assert.equal(replay.sequence, 1);

    await ledger.append({
      eventType: 'FILL_RECORDED',
      clientOrderId: 'test-order-001',
      brokerOrderId: 'broker-001',
      symbol: 'AAPL',
      occurredAt: '2026-11-27T12:01:00.000Z',
      payload: { activityId: 'fill-001', qty: 1, price: 245.5 },
    });
    const events = await ledger.readEvents('test-order-001');
    assert.equal(events.length, 2);
    assert.deepEqual(verifyExecutionLedgerChain(events), {
      valid: true,
      length: 2,
      headHash: events[1].entryHash,
      brokenAtSequence: null,
    });

    const tampered = events.map(event => ({ ...event }));
    tampered[0].payload.qty = 999;
    assert.equal(verifyExecutionLedgerChain(tampered).valid, false);
  });
});
