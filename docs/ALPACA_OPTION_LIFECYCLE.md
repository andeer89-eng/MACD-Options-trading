# Alpaca option lifecycle activity ledger

The Alpaca overview ingests option lifecycle activities from the Trading API account-activities endpoint using the documented activity types:

- `OPASN`: option assignment
- `OPEXC`: option exercise
- `OPEXP`: option expiration
- `OPTRD`: underlying-security trade paired with an assignment or exercise

The activity payload is retained as an immutable broker-sourced event record (activity ID, type, date, symbol, quantity, net amount, price, status, and description). The endpoint is paginated with `page_token`; the overview exposes `optionLifecycleHistoryComplete` and `optionLifecycleHistoryError` so a capped or failed history is never represented as complete.

## Accounting boundary

The event ledger is evidence of what Alpaca booked; it does not independently mutate the local share inventory or cash balance. Alpaca's Positions and Account endpoints remain authoritative for current holdings and balances. This avoids double-counting the underlying stock movement already reflected in broker positions.

For a short put assignment, Alpaca reports an `OPASN` event for the option and a paired `OPTRD` event showing the underlying shares purchased at strike. A short call assignment similarly produces an underlying sale. The app retains both records for audit and leaves the current share quantity and cash to the broker account snapshot.

## Paper Trading timing

Alpaca documents that option non-trade activities on Paper may appear in the Activities endpoint at the start of the following day even though balances and positions update immediately. Therefore a missing same-day assignment/exercise activity is not proof that no settlement occurred. Reconcile the event ledger against the current broker positions and cash, and keep the history status visible.

## Source

- https://docs.alpaca.markets/us/docs/options-trading-overview
- https://docs.alpaca.markets/us/docs/non-trade-activities-for-option-events
- https://docs.alpaca.markets/us/docs/account-activities
