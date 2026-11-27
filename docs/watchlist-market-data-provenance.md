# P1.18c — Watchlist market-data provenance

## Provider boundary

The server exposes `fetchWatchlistSignalMarketData(symbol, timeframe, range, minCandles)`.
It currently accepts only the production Yahoo Finance Chart API v8 path whose
feed metadata was populated by the same server-side fetch. Injected test fetch
overrides fail closed because they do not carry independently asserted provider
provenance.

The returned envelope identifies provider, normalized symbol, timeframe,
exchange, exchange timezone, currency, source endpoint, retrieval timestamp,
closure policy, excluded latest bar timestamp, and a SHA-256 digest over the
normalized closed OHLCV/date records.

## Closed-candle policy

Yahoo Chart API integration does not expose a provider-verified per-candle
finalization flag in this code path. Therefore the newest returned candle is
always excluded. Only preceding bars are passed to the signal evaluator.
This is deliberately conservative and can add one full interval of latency.
It does not prove exchange-calendar completeness or eliminate upstream
corrections; it only avoids treating the newest potentially-open bar as closed.

## Integrity and freshness

The SHA-256 digest covers the normalized OHLCV/date array passed to the evaluator,
not the original HTTP response bytes. The evaluator verifies the digest,
provider ID, symbol, timeframe, retrieval time, maximum age supplied by the
caller, and closure boundary. The P1.18e worker endpoint currently defaults to a
15-minute retrieval-age limit; this is not an exchange-session staleness check
and must be reviewed before any scheduled production use.

## Explicit limitations

- Yahoo is not represented as an institutional or exchange-authoritative feed.
- Provider response bytes and HTTP headers are not retained or cryptographically
  signed; the digest is an integrity check of the normalized in-process payload.
- The provider's exchange timezone and symbol metadata are descriptive, not
  proof of listing venue or official market calendar.
- The P1.18f worker applies conservative timeframe-specific maximum ages to the
  last closed candle (20m/45m/90m/3h/5d/10d for 5m/15m/30m/1h/1d/1wk). These
  are not exchange-calendar calculations; holidays may result in fail-closed
  rejections.
- The P1.18e read-only evaluation worker consumes this envelope and appends
  journal records; it does not perform Firestore watchlist state transitions.
- No scheduler, broker order, or trading activation is connected.
- Production feed behavior has not been live-validated in this PR.
