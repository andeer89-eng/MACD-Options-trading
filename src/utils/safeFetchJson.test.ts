import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonSafe } from './safeFetchJson';

test('fetchJsonSafe parses valid JSON response cleanly', async () => {
  const result = await fetchJsonSafe('/api/scan', {
    fetchImpl: (async () =>
      new Response(JSON.stringify({ results: [{ symbol: 'AAPL' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.isHtmlFallback, false);
  assert.deepEqual(result.data, { results: [{ symbol: 'AAPL' }] });
});

test('fetchJsonSafe retries once when HTML doctype is returned and succeeds on recovery', async () => {
  let calls = 0;
  const result = await fetchJsonSafe('/api/scan', {
    retryDelayMs: 5,
    fetchImpl: (async () => {
      calls++;
      if (calls === 1) {
        return new Response('<!doctype html><html><body>Loading</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      return new Response(JSON.stringify({ results: [{ symbol: 'SPY' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  });

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { results: [{ symbol: 'SPY' }] });
});

test('fetchJsonSafe returns structured failure without throwing SyntaxError when HTML persists', async () => {
  const result = await fetchJsonSafe('/api/scan', {
    retryDelayMs: 5,
    fetchImpl: (async () =>
      new Response('<!doctype html><html><body>502</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch,
  });

  assert.equal(result.ok, false);
  assert.equal(result.isHtmlFallback, true);
  assert.equal(result.data, null);
  assert.ok(result.error?.includes('HTML'));
});
