# Security Specification - TRULLAS Divergence Scanner

## 1. Data Invariants
- A journal entry must belong to a valid authenticated user.
- A watchlist item must belong to a valid authenticated user.
- Users can only modify their own data (UserId must match request.auth.uid).
- Terminal statuses (EXPIRED, INVALIDATED) for watchlist items should be immutable or restricted.

## 2. The "Dirty Dozen" Payloads (Targeting Firestore)
1. **Identity Spoofing**: `PATCH /users/{otherUserId}/journalEntries/{entryId}` (userId mismatch).
2. **Resource Poisoning**: `POST /users/{uid}/journalEntries/{entryId}` (symbol = "A".repeat(2000) - ID Poisoning).
3. **Ghost Field Injection**: `POST /users/{uid}/journalEntries/{entryId}` (payload includes `isAdmin: true`).
4. **State Shortcutting**: `PATCH /users/{uid}/watchlistItems/{itemId}` (status = "TRIGGERED" without conditions).
5. **PII Leak**: `GET /users/{otherUserId}/journalEntries` (non-owner reading other user's journals).
6. **Value Poisoning**: `PATCH /users/{uid}/journalEntries/{entryId}` (entryPrice = "invalid_string_type").
7. **Orphaned Write**: `POST /users/{uid}/journalEntries/{entryId}` (references a non-existent parent).
8. **Temporal Integrity Breach**: `POST /users/{uid}/journalEntries/{entryId}` (createdAt = "2000-01-01T00:00:00Z").
9. **Role Escalation**: `POST /users/{uid}` (setting `role` field).
10. **Unauthenticated Access**: `GET /users/{uid}/watchlistItems` (no auth header).
11. **Denial of Wallet**: `POST /users/{uid}/journalEntries` (notes = "A".repeat(1000000)).
12. **Shadow Field Write**: `PATCH /users/{uid}/journalEntries/{entryId}` (include `createdAt` in update).

## 3. Test Runner (firestore.rules.test.ts)
*(To be implemented in next step using firebase testing tools)*
