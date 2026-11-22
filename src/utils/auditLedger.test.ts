import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENESIS_HASH,
  appendAuditEvent,
  verifyAuditChain,
  computeConfigDigest,
  exportAuditLedgerJSON,
} from './auditLedger.ts';
import { filterSecFilingsAsOf } from '../components/SecEdgarInspector.tsx';

describe('auditLedger hash-chained provenance & SEC PIT filtering', () => {
  it('builds a deterministic hash chain and detects tampering in payload or prevHash', () => {
    const digest = computeConfigDigest({
      simCapitalUsd: 25000,
      maxRiskPerTradePct: 1.0,
      dailyLossLimitPct: 2.0,
      maxSectorExposurePct: 30,
      botStatus: 'armed',
      activeEpochId: 'alpaca-paper',
    });

    const digestReordered = computeConfigDigest({
      activeEpochId: 'alpaca-paper',
      botStatus: 'armed',
      maxSectorExposurePct: 30,
      dailyLossLimitPct: 2.0,
      maxRiskPerTradePct: 1.0,
      simCapitalUsd: 25000,
    });
    assert.equal(digest, digestReordered, 'Config digest must be key-order invariant');

    let chain = appendAuditEvent([], {
      eventType: 'ALPACA_ORDER_SUBMITTED',
      symbol: 'NVDA',
      clientOrderId: 'trullas_NVDA_buy_4_20261121',
      configDigest: digest,
      payload: { side: 'buy', qty: 4, orderId: 'ord-1' },
      timestamp: '2026-11-21T15:00:00.000Z',
    });

    chain = appendAuditEvent(chain, {
      eventType: 'ALPACA_JOURNAL_SYNCED',
      symbol: 'PORTFOLIO',
      configDigest: digest,
      payload: { addedCount: 1, updatedCount: 0, totalAlpacaEntries: 1 },
      timestamp: '2026-11-21T15:01:00.000Z',
    });

    assert.equal(chain.length, 2);
    assert.equal(chain[0].prevHash, GENESIS_HASH);
    assert.equal(chain[1].prevHash, chain[0].entryHash);

    const ok = verifyAuditChain(chain);
    assert.equal(ok.valid, true);
    assert.equal(ok.length, 2);
    assert.equal(ok.headHash, chain[1].entryHash);

    // Mutate qty in event #1 without updating hashes -> verifyAuditChain must fail at sequence 1
    const tamperedPayloadChain = [
      { ...chain[0], payload: { ...chain[0].payload, qty: 999 } },
      chain[1],
    ];
    const tamperedRes = verifyAuditChain(tamperedPayloadChain);
    assert.equal(tamperedRes.valid, false);
    assert.equal(tamperedRes.brokenAtSequence, 1);

    // Break link between event #1 and #2
    const brokenLinkChain = [chain[0], { ...chain[1], prevHash: 'deadbeef' }];
    const linkRes = verifyAuditChain(brokenLinkChain);
    assert.equal(linkRes.valid, false);
    assert.equal(linkRes.brokenAtSequence, 2);

    const exported = JSON.parse(exportAuditLedgerJSON(chain));
    assert.equal(exported.schema, 'stageledger-hash-chain-v1');
    assert.equal(exported.verification.valid, true);
    assert.equal(exported.events.length, 2);
  });

  it('filterSecFilingsAsOf enforces Point-in-Time public filingDate cutoff', () => {
    const filings = [
      { form: '10-Q', filingDate: '2026-11-05', reportDate: '2026-09-28' },
      { form: '4', filingDate: '2026-10-18', reportDate: '2026-10-16' },
      { form: '8-K', filingDate: '2026-09-12', reportDate: '2026-09-12' },
    ];

    assert.equal(filterSecFilingsAsOf(filings, '').length, 3);
    const pitOct = filterSecFilingsAsOf(filings, '2026-10-20');
    assert.equal(pitOct.length, 2);
    assert.deepEqual(
      pitOct.map((f) => f.form),
      ['4', '8-K']
    );
  });
});
