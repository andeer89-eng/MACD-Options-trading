# P1.20 — Multi-asset AI investment committee

Four independent roles are defined: STRATEGIST, BULL, BEAR and RISK. Each receives
the same P1.19 evidence pack and a role-specific system instruction. STOCK and
OPTION context instructions are distinct.

Every assessment must echo the exact pack ID, asset class and symbol; include a
bounded score (-100 to 100), confidence (0 to 1), thesis, key points, risks,
model and prompt version, and valid source indexes. RISK must additionally return
ACCEPT, RESTRICT or VETO plus restrictions. Invalid outputs are rejected and any
failed role makes the committee INCOMPLETE.

The existing deterministic risk snapshot has precedence. If new entries are
disallowed or risk status is HALTED / DATA_INVALID, the committee is BLOCKED
regardless of AI opinions. The RISK agent can add a veto but cannot relax the
deterministic gate.

COMPLETE means only that all four structured assessments were received and
validated. It is not a BUY/SELL recommendation, trade authorization or permission
to execute. Existing deterministic portfolio risk must be rerun against current
broker/account state before any future execution.

The orchestration accepts an injected agent adapter. It has no provider credentials,
network calls, HTTP endpoint, persistence, broker access, watchlist mutation,
scheduler or order-submission capability. Provider integration, user authorization,
usage budgets and durable prediction journaling remain separate follow-up work.
