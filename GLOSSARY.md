# Domain Glossary — StageLedger (Swing Scanner & Shadow Desk)

Shared domain language across the trading desk, quantitative research, charting overlays, and journaling workflows.

## Core Market & Strategy Terms

- **4-Pillars Strategy**: A swing-reversal methodology combining (1) multi-wave MACD momentum divergence, (2) RSI oscillator confirmation, (3) volume exhaustion at the final pivot, and (4) Fibonacci retracement entry and profit targets.
- **Pivot (`P1`, `P2`, `P3`)**: Sequential extreme price swings (lows in bullish setups, highs in bearish setups) forming a divergence structure.
  - **Double Divergence**: A 2-pivot structure (`P1 → P2`) where price makes a deeper extreme while MACD makes a shallower extreme.
  - **Triple Divergence**: A 3-pivot structure (`P1 → P2 → P3`) showing three weakening momentum waves at progressively extended price extremes.
- **Trigger (`23.6%`)**: The Fibonacci retracement breakout price from the final pivot toward the preceding swing extreme that activates an entry.
- **Invalidation / Stop Loss**: The hard exit price beyond the setup extreme where the divergence thesis fails.
- **Scaling Targets (`TP1`, `TP2`, `TP3`)**: Fibonacci expansion take-profit milestones (`38.2%`, `61.8%`, `100%`) used to trim a position in tranches (`33% / 33% / 34%`).
- **Action Zone**: Classification of a setup's current market price relative to its Trigger, Stop Loss, and Target 1 (`BUY ZONE`, `WAIT FOR TRIGGER`, `EXTENDED`, `LATE TO BUY`, `INVALIDATED`).

## Regime, Stage & Pre-Trade Gatekeeping

- **Weinstein Stage (`Stage 1–4`)**: Stan Weinstein's 4-phase weekly trend cycle anchored to the 30-week moving average and relative strength against S&P 500: *Stage 1 Basing*, *Stage 2 Advancing*, *Stage 3 Topping*, *Stage 4 Declining*.
- **Market Regime Score (`0–100`)**: Composite pre-market risk thermometer weighted from S&P 500 trend stage, sector breadth, VIX term structure, CBOE Put/Call ratio, and SPDR sector participation. Maps to four bands: *Risk-off*, *Neutral*, *Risk-on*, and *Extins*.
- **Global Gate (`canTrade()`)**: A deterministic 10-check pre-trade risk gate evaluating market session calendar, feed freshness, kill-switch status, daily loss limit, sector concentration cap, active strategy status, minimum position size, options liquidity, regime band policy, and worker heartbeat.
- **Setup vs. Watchlist Item vs. Position vs. Journal Entry**:
  - **Setup**: A quantitative chart pattern detected on historical bars with entry geometry.
  - **Watchlist Item**: A tracked ticker candidate carrying lifecycle state (`NEW`, `WATCHING`, `TRIGGERED`, `EXPIRED`, `INVALIDATED`).
  - **Position**: Active simulated exposure sized against allocated paper capital and risk-per-trade percentage.
  - **Journal Entry**: Immutable historical record of an opened or closed execution for performance attribution.

## Charting & Order Flow Concepts

- **Value Area (`VAH`, `VAL`, `POC`)**: Price band capturing ~70% of traded volume (*Value Area High* to *Value Area Low*) around the **Point of Control (POC)**, the single price level with highest volume.
- **Buy-Side / Sell-Side Liquidity (`BSL`, `SSL`)**: Resting stop clusters above swing highs (`BSL`) or below swing lows (`SSL`); a **Liquidity Sweep** occurs when price spikes through the cluster and rejects back inside the range.
- **Session Delta**: Net cumulative difference between aggressive buying volume and aggressive selling volume within a session.
- **Absorption Quality (`AQ`)**: Measure of high volume traded against stalled price progress near an extreme, signaling passive institutional absorption of aggressive market orders.
- **Discount / Premium `0.705` Zone**: Deep Fibonacci retracement pocket (`0.705–0.886`) of a displacement leg used by **Order Flow Strategy (OFS)** for high-reward entries.
- **Quantum Market X-Ray (`QMX`)**: Multi-layer market intelligence view scoring bullish vs. bearish evidence, liquidity strength, trap risk, displacement, and liquidity vacuums.
- **Raindrop Bar**: Dual-profile candlestick splitting volume and VWAP across the first half (left) and second half (right) of a bar's duration.

## Verification & Shadow Auditing

- **Shadow Signal Ledger**: Anti-lookahead historical evaluation of generated signals strictly net of transaction costs/slippage (`10 bps` round-trip) against SPY benchmark.
- **Exit Policy (`X1`, `X2`, `X3`)**: Standardized out-of-sample exit rules: `X1` (fixed Stop Loss / Target 1 / time-stop), `X2` (breakeven move + `2×ATR` trailing stop), `X3` (weekly 30-period structure / invalidation).
- **Confluence Score (`0–100%`)**: Combined alignment rating across divergence geometry, LuxAlgo Nadaraya-Watson envelopes, Smart Money Concepts order blocks/FVGs, and sector alpha.
