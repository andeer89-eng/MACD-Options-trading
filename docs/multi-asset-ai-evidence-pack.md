# P1.19 — Multi-asset AI research evidence pack

The server-side builder creates a deterministic, provenance-bound analysis artifact. It is not an order instruction.

STOCK evidence includes symbol, market provider/timeframe/candles/digest, optional technical context, and optional point-in-time fundamental facts. Each fundamental fact carries period end, filing date, accession and SEC source URI.

OPTION evidence includes OCC contract, underlying, CALL/PUT, expiration, strike, multiplier, quote, bid/ask sizes when available, volume, open interest, IV, Greeks, underlying price and quote timestamp.

The discriminated schema rejects mixed stock/option payloads. Both asset classes require source records and a deterministic risk snapshot with evaluation time, allowNewEntries, status, reasons and policy version. The snapshot is descriptive only: execution must independently rerun the existing deterministic risk engine against current broker/account state. AI must never loosen or override that engine.

Canonical JSON sorts object keys, preserves array order, rejects non-JSON/non-finite values and computes SHA-256 over the evidence envelope. packId equals canonicalSha256.

Non-goals: no LLM calls, prompts, autonomous committee, broker submission, watchlist transition, scheduler or background worker. No inference of missing market data, Greeks, fundamentals or provenance. Yahoo data is not represented as exchange-authoritative.

Next phase: a provider-agnostic LLM adapter with distinct stock and options analyst prompts, shared provenance and deterministic risk-veto contracts.
