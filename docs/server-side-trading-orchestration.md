# Server-side trading orchestration — Wave 2

## Implemented foundation

This slice adds two independent owner-scoped persistence primitives:

- Durable STOCK and OPTION portfolio snapshots at `/api/alpaca/bot/portfolio/:botId`.
- Distributed Firestore cycle leases with monotonically increasing fencing tokens, independently keyed by owner UID and bot class.

Portfolio writes use optimistic concurrency through `expectedVersion`. The server derives ownership exclusively from the verified Firebase UID. A portfolio snapshot is configuration/state, not an authorization source: `isAutoPilotActive` is forced to `false` on persistence and cannot arm a bot.

The lease store supports acquire, renew and release. A lease takeover increments its fencing token; a stale worker cannot renew or release the successor's lease. STOCK and OPTION leases are independent so their cycles do not block each other.

## Orchestrator execution primitive

`server/services/tradingOrchestrator.ts` provides a server-side cycle runner that:

1. Checks an explicit server-provided armed predicate before acquiring a lease.
2. Acquires the owner/bot distributed lease.
3. Runs an injected strategy adapter with an AbortSignal and fencing token.
4. Renews the lease periodically.
5. Exposes `verifyLease()` for a fresh Firestore read immediately before every broker side effect; the adapter must call it at that boundary.
6. Re-verifies the persisted fencing token before accepting a completed cycle.
7. Aborts and refuses to report success if lease renewal or verification fails.
8. Releases the lease in a finally block.

The adapter is deliberately injected. This commit does not move the existing React strategy algorithms to the server, does not schedule bot cycles, and does not activate any new worker. The existing UI-based cycles remain until the STOCK and OPTION decision pipelines have been extracted into server-safe adapters and validated against the same strategy/risk contracts.

## API

- `GET /api/alpaca/bot/portfolio/STOCK`
- `PUT /api/alpaca/bot/portfolio/STOCK`
- `GET /api/alpaca/bot/portfolio/OPTION`
- `PUT /api/alpaca/bot/portfolio/OPTION`

PUT body: `{ expectedVersion: number, portfolio: object }`.

The endpoints require Firebase authentication and use the verified owner UID. They return HTTP 409 for stale versions, HTTP 400 for malformed input, and fail closed with HTTP 503 when persistent storage is unavailable.

## Safety and rollout

- Alpaca remains Paper-only.
- Both autonomous bots remain OFF by default.
- No scheduler, worker, or broker order path is activated by this change.
- The portfolio API does not bypass server-side arming, global kill switch, option capability restrictions, portfolio risk checks, or the order-intent ledger.
- The lease store now exposes persisted fencing-token verification, and the orchestrator supplies `verifyLease()` to adapters. The current browser-driven order route is not yet lease-fenced and no server strategy adapter calls this method yet; this remains a required integration before production orchestration.

## Next Wave 2 work

1. Add final order-submission fencing so stale cycles cannot submit after lease loss.
2. Extract pure STOCK strategy decision logic and its market-data dependencies into a server adapter.
3. Extract OPTION short-put decision logic into a separate server adapter.
4. Persist strategy configuration and candidate provenance with schema migrations.
5. Add a durable cycle-run journal and authenticated run/status controls.
6. Replace browser timers with a server scheduler only after the adapters pass shadow-mode and deterministic replay tests.
