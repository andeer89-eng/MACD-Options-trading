# P1.18a — Deterministic watchlist breakout evaluator

## Scope

This is a read-only, pure evaluator. It does not call Firestore, mutate watchlist
status, schedule scans, submit broker orders, or activate trading.

## Rule

The existing strategy labels its 23.6% Fibonacci level as the breakout trigger:
- Bullish setups trigger only when a post-confirmation candle CLOSE crosses from
  below the trigger level to at/above it.
- Bearish setups trigger only when a post-confirmation candle CLOSE crosses from
  above the trigger level to/ below it.
- A wick touch without a close cross is not a trigger.
- A stop-loss touch before the cross invalidates the setup.
- If stop and trigger are both touched in one OHLC candle, the intrabar order
  cannot be reconstructed; the evaluator conservatively invalidates it.

Rule version: `trullas-close-cross-v1`.

## Candle contract and limitations

The caller must supply finalized/closed candles from one feed, strictly ordered
by timestamp, including the final pivot-confirmation candle. The evaluator
validates chronology, OHLC consistency, and that no candle timestamp is later
than `evaluatedAt`. It cannot independently prove provider finality, feed
integrity, exchange calendar alignment, or that the data is authoritative.
Those controls belong to the future worker/provider integration.

The evaluator returns evidence fields (threshold, prior close, observed close,
trigger candle timestamp, evaluation timestamp) but does not persist or emit a
trigger event. It must not be wired to the P1.17 persistence endpoint until
provider provenance and closed-candle finality are independently enforced.

## Tests

`server/services/watchlistSignalEvaluator.test.ts` covers bullish/bearish
close-crosses, wick-only non-trigger, stop invalidation, ambiguous same-candle
stop/trigger, chronology, malformed bars, future timestamps, and missing pivot
anchor.
