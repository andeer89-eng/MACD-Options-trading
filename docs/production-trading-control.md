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
