# P1.20 — Multi-agent investment committee (research-only core)

Four isolated roles run against the exact same immutable P1.19 evidence pack:
- STRATEGIST — frames the thesis, horizon and invalidation conditions.
- BULL — develops the strongest positive case.
- BEAR — develops the strongest negative case and counter-evidence.
- RISK — evaluates hazards and may veto new risk or reduce the permitted risk multiplier.

The orchestration core is provider-agnostic. A caller supplies the agent executor; this module has no provider credentials, network calls or LLM dependency. This makes role contracts and fail-closed behavior testable before provider integration.

Each response must be structured and bound to the exact asset class, evidence-pack SHA-256 and committee generation timestamp. Claims may cite only top-level pack sources (source:0, source:1, ...). Missing, malformed, cross-asset, wrong-pack, wrong-time or unsupported-source responses fail closed and produce VETO.

The RISK role must return vetoNewRisk, reasons and maxRiskMultiplier in [0, 1]. Values above 1 are rejected: AI cannot increase the deterministic risk budget. A risk veto or invalid/missing role prevents advancement. Otherwise the result is ADVANCE_TO_JUDGE, never a trade instruction.

The shared evidence envelope remains common, but the underlying pack stays discriminated: STOCK and OPTION data cannot be mixed. Option analysis uses OCC contract, expiration, strike, quote, IV and Greeks; stock analysis uses market and point-in-time fundamental context.

Safety boundary: executionEligible is always false. The committee does not read broker state, change positions, call Alpaca, create orders, mutate watchlists, start workers or schedule itself. Any future execution decision must separately re-run the deterministic portfolio risk engine against current broker/account state. The next phase is an independent judge plus provider/cost governance—not autonomous order routing.