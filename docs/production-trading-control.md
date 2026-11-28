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
