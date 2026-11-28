# P1.51 — Server-side autonomous order gate

Autonomous STOCK and OPTION order submissions use the authenticated
`POST /api/alpaca/bot/orders` endpoint. The endpoint is fail-closed unless
`ALPACA_BOT_EXECUTION_ENABLED=true` is explicitly configured by the deployment
operator. `ALPACA_TRADING_KILL_SWITCH=true` blocks all new autonomous orders
even when bot execution is enabled.

Manual order entry continues to use `POST /api/alpaca/orders`. Position closes
and order cancellations remain on their existing dedicated endpoints so the
new-order gate does not prevent risk-reducing actions.

Both environment controls default to false. This is a process-configuration
gate, not a distributed runtime control plane: changing either value requires
the server process to reload/redeploy. Multi-instance persistent arming,
audited operator actions, and a runtime kill switch remain required before
production-grade autonomous execution is considered complete.

Alpaca remains Paper-only in this milestone. Do not set the enable flag in
production until the remaining risk, quote, execution, accounting, and release
gates have passed.

## Initial options-bot capability matrix

The authenticated bot-order endpoint permits OCC option entries only when
the order is a sell-to-open PUT. Calls, long-option entries, and other option
order shapes are rejected at the server boundary. The Alpaca service continues
to apply its separate short-put collateral and portfolio risk checks.

The current options bot closes positions through the dedicated position-close
path; that path remains available when new bot entries are blocked. Any future
support for covered calls, long options, spreads, or buy-to-close order intents
must add explicit position-aware risk and lifecycle accounting before expanding
this allowlist.

## Live option quote requirement

The options bot requests Alpaca option snapshots with the explicit OPRA feed.
A contract is eligible only when its quote timestamp is within 30 seconds,
bid/ask prices are positive and non-crossed, both quote sizes are positive,
the spread is no more than 20%, and delta is within the configured target
band. The order is a limit sell priced at the current bid; historical
`close_price` is not used for entry selection or pricing.

If OPRA access is unavailable, the quote is stale/invalid/missing, or the
Greeks are absent/outside the delta band, the bot skips the entry. It does not
silently fall back to historical close prices or a market order. Alpaca's
snapshots endpoint provides latest quote, trade, Greeks and implied volatility;
the feed must be explicitly available under the account's market-data
entitlement.

The server independently repeats the OPRA snapshot check immediately before
submitting a new short put. It rejects stale/missing/crossed quotes, zero-size
markets, spreads above 20%, absolute delta outside 0.08–0.16, market orders,
and limit prices outside the current NBBO. Client-side quote selection is not
treated as an execution authorization.

## Persistent owner-scoped trading control

The server now stores STOCK/OPTION arming and the owner kill switch in the
Firestore execution-control collection. Each update uses an expected version
and Firestore update-time precondition to reject concurrent stale writes.
The verified Firebase UID determines the control document; client-supplied
owner IDs are never accepted.

To arm either bot, the authenticated owner must send `confirmArm: "ARM"`.
The deployment-level `ALPACA_BOT_EXECUTION_ENABLED=true` remains a separate
master gate. The owner kill switch disables both bot flags in the same
transaction and takes precedence over the deployment enable flag. If control
storage is missing or unreadable, bot orders fail closed with HTTP 503.

API:
- `GET /api/alpaca/trading-control` — read the verified owner's state
- `PUT /api/alpaca/trading-control` — update bot flags using `expectedVersion`

A server-side UI for this API and audited operator notifications are still
required before declaring the trading control plane complete.
