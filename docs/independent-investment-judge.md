# P1.21 — Independent investment judge (research-only core)

The judge is a separate injected evaluator that receives the immutable P1.19 evidence pack and the four P1.20 committee assessments. It must independently challenge Bull and Bear arguments, identify conflicts and counter-evidence, verify provenance, and return APPROVE, REDUCE or REJECT. The core does not call an LLM provider; a caller supplies the judge implementation.

## Binding and fail-closed rules

Every judge response is bound to the exact pack ID, canonical SHA-256, asset class, committee generation timestamp and judge generation timestamp. It may cite only top-level evidence references (source:0, source:1, ...). The committee must contain exactly one valid assessment for each role, all tied to the same pack and run. Missing, malformed, duplicate, cross-asset, cross-pack, unsupported-source or provider-failed output is REJECT.

The judge cannot increase the committee risk ceiling. A response above that ceiling is invalid. The deterministic P1.19 risk snapshot and a P1.20 committee veto always dominate the judge. The conflict flag must also match the independently computed directional disagreement between the Bull and Bear committee stances; the judge cannot suppress a detected disagreement. If point-in-time fundamentals are present for a STOCK, the judge must explicitly mark them reviewed or the result is reduced.

## Asset-specific review

- STOCK: verify market freshness and source provenance; challenge the thesis and counter-evidence; explicitly record whether thesis invalidation and optional fundamentals were reviewed. Point-in-time filing dates remain constrained by the evidence pack.
- OPTION: verify OCC symbol, expiration, strike and contract identity; inspect bid/ask spread, quote freshness, volume, open interest, IV and supplied Greeks; explicitly review assignment, exercise style and early-exercise risks. The judge must echo the computed spread from the evidence pack, not invent it.

Default deterministic policy rejects stale stock market evidence older than seven days, option quotes older than two minutes, invalid timestamps, expired/expiring-today contracts and non-positive asks. Wide spreads (over 35% of mid), low open interest (under 10) or zero/low volume force at least REDUCE. These are conservative configurable research gates, not broker execution rules.

Incomplete asset-specific review or partial evidence completeness forces REDUCE. A judge REJECT always remains REJECT. The result always has executionEligible=false.

## Safety boundary

This phase adds no LLM provider integration, broker reads, Alpaca calls, order routing, watchlist mutations, scheduler or worker activation. APPROVE means only that research may proceed to a later controlled stage; it is not an order instruction. Any future execution path must independently re-run the existing deterministic portfolio risk engine against current broker/account state and apply existing stock/options execution controls.
