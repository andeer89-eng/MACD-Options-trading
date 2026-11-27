# Alpaca Paper API authentication

All `/api/alpaca/*` routes require a Firebase ID token and a server-side UID allowlist.

## Server configuration

Set the following environment variables in the server deployment (or in the local server `.env` file):

- `FIREBASE_PROJECT_ID`: Firebase project ID. The server falls back to the `projectId` in `firebase-applet-config.json` when this is not set.
- `ALPACA_ALLOWED_UIDS`: comma-separated Firebase Authentication UIDs allowed to operate the shared Alpaca Paper account. This is intentionally required; an empty value makes the Alpaca API fail closed with HTTP 503.

To find the correct UID:

1. Open Firebase Console for the project configured in `firebase-applet-config.json`.
2. Go to **Authentication → Users**.
3. Copy the UID of the account owner who should be allowed to trade.
4. Set `ALPACA_ALLOWED_UIDS` to that UID. Add more UIDs only when those people should have the same ability to read the account, submit orders, close positions, and cancel orders.

Do not put email addresses in `ALPACA_ALLOWED_UIDS`. Do not expose this server variable through a `VITE_*` environment variable or frontend configuration.

## Request flow

The frontend waits for Firebase Auth initialization, obtains the current user's ID token with `getIdToken()`, and sends it as `Authorization: Bearer <token>`.

The server verifies the token's RS256 signature against Google's published Firebase Secure Token signing certificates, checks the Firebase project audience and issuer, checks the UID and time claims, and then compares the UID against `ALPACA_ALLOWED_UIDS`. The same middleware protects account reads and all order/position mutations. Responses from the Alpaca routes use `Cache-Control: no-store`.

Unauthenticated requests receive HTTP 401. Authenticated but non-allowlisted users receive HTTP 403. Missing allowlist configuration or an unavailable certificate service receives HTTP 503. The server does not fall back to anonymous access.

## Operational notes

- Removing a UID from the allowlist and redeploying/restarting the server removes that UID's Alpaca access.
- Firebase ID tokens are short-lived (normally around one hour). This implementation validates signature and standard claims, but does not perform Firebase Admin SDK revocation checks on every request; a token that was issued before a user was disabled can remain valid until it expires. For immediate revocation semantics, replace this verifier with Firebase Admin SDK `verifyIdToken(token, true)` and check user disabled/revocation state.
- Keep Alpaca credentials server-side. The existing Alpaca service continues to enforce the Paper endpoint only.
- Run `npm test` to execute both utility and server integration tests, including the Alpaca authentication tests.
