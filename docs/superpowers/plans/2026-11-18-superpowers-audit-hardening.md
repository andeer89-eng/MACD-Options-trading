# Superpowers Audit & Hardening Implementation Plan

> **For agentic workers:** Executed sequentially with strict `superpowers:test-driven-development` (RED -> verify RED -> GREEN -> verify GREEN -> REFACTOR), `superpowers:systematic-debugging`, and `superpowers:verification-before-completion`. (Workspace is non-git; file-level verification and live browser checks replace git SHAs.)

**Goal:** Eliminate concrete precision, timezone/calendar, lookback/NaN, and webhook-security bugs uncovered across untested core utilities (`marketSession`, `marketCalendar`, `heikinAshi`, `patternRecognitionEngine`, `webhookAlerts`, `customIndicatorCalculator`) while locking in behavioral test suites.

**Architecture:** All fixes stay strictly inside decoupled pure utility modules under `src/utils/` with deterministic unit tests in `src/utils/*.test.ts` using `node:test` + `node:assert/strict`. Backward compatibility for equities (`>= $10` 2-decimal rounding and existing exported types/signatures) is preserved across every module.

**Global Constraints:**
- Never add mock data or simulated price feeds; keep UI clean and untouched unless wiring strict error messages.
- Strictly observe the TDD Iron Law: write the failing `.test.ts` file and run `npx --yes tsx --test <file>` BEFORE editing the corresponding production `.ts` file.
- Run the full suite (`npm test`), `compile_applet`, `lint_applet`, and live Chromium inspection (`playwright-cli`) after the final edit.

**Review Focus:** No `NaN` propagation, no `24:xx` Eastern Time hour rollover, no sub-dollar zero-collapse on crypto/penny assets, no unsafe `javascript:`/`file:` webhook URLs or unbounded hanging `fetch` calls.

---

### Task 1: Fix Eastern Time `24:xx` Midnight Bug & Multi-Year NYSE Holidays (`marketCalendar.ts` + `marketSession.ts`)
- **Files:** `src/utils/marketSession.ts`, `src/utils/marketCalendar.ts`, `src/utils/marketSession.test.ts`
- **Steps:**
  1. Write `src/utils/marketSession.test.ts` testing midnight ET (`00:15 AM ET` Friday Futures -> `24/5 GLOBEX`, formatted `12:15:xx AM ET`), CME daily settlement halt (`17:30 ET`), Equity Pre/Regular/After/Closed, and multi-year holidays (2026 & 2027).
  2. Run `npx --yes tsx --test src/utils/marketSession.test.ts` and confirm FAIL (RED).
  3. Update `getEasternTimeParts` in `src/utils/marketSession.ts` (`hourCycle: 'h23'` + `hours === 24 ? 0 : hours`) and generalize `isMarketHoliday` / `isEarlyClosing` in `src/utils/marketCalendar.ts` for any year while preserving `NYSE_HOLIDAYS_2026`.
  4. Run `npx --yes tsx --test src/utils/marketSession.test.ts` and confirm PASS (GREEN).

### Task 2: Preserve Sub-Dollar Precision in Heikin-Ashi (`heikinAshi.ts`)
- **Files:** `src/utils/heikinAshi.ts`, `src/utils/heikinAshi.test.ts`
- **Steps:**
  1. Write `src/utils/heikinAshi.test.ts` testing empty array, standard equity HA formula exact values, sub-dollar crypto (`$0.0042` retains non-zero bodies/wicks), and HA high/low invariants.
  2. Run `npx --yes tsx --test src/utils/heikinAshi.test.ts` and confirm FAIL (RED).
  3. Add adaptive tick-precision rounding helper in `src/utils/heikinAshi.ts` (2 decimals for `>= 10`, 4 for `>= 0.1`, 6 for `< 0.1`) so equities remain 2-decimal exact and sub-dollar tickers never collapse.
  4. Run `npx --yes tsx --test src/utils/heikinAshi.test.ts` and confirm PASS (GREEN).

### Task 3: Fix Ignored `lookback` Window & Zero-Price `NaN` in Pattern Recognition (`patternRecognitionEngine.ts`)
- **Files:** `src/utils/patternRecognitionEngine.ts`, `src/utils/patternRecognitionEngine.test.ts`
- **Steps:**
  1. Write `src/utils/patternRecognitionEngine.test.ts` testing Double Bottom & Double Top detection, exclusion of stale patterns older than `lookback` while preserving original `candles` indices, and zero/non-finite price safety (`Number.isFinite(confidence)`).
  2. Run `npx --yes tsx --test src/utils/patternRecognitionEngine.test.ts` and confirm FAIL (RED).
  3. Slice the trailing `lookback` window with `startOffset = candles.length - lookback`, guard `lookback < 5` and `s1.price <= 0`, and bound confidence `[50, 100]`.
  4. Run `npx --yes tsx --test src/utils/patternRecognitionEngine.test.ts` and confirm PASS (GREEN).

### Task 4: Harden Webhook URL Validation & Request Timeout (`webhookAlerts.ts`)
- **Files:** `src/utils/webhookAlerts.ts`, `src/utils/webhookAlerts.test.ts`
- **Steps:**
  1. Write `src/utils/webhookAlerts.test.ts` testing `validateWebhookUrl` (`https:`/`http:` pass; `javascript:`, `file:`, `ftp:`, blank, malformed fail), `sendWebhookAlert` rejecting invalid URLs before calling `fetch`, forwarding valid JSON POST + HTTP error status handling, and aborting timed-out requests via `AbortController`.
  2. Run `npx --yes tsx --test src/utils/webhookAlerts.test.ts` and confirm FAIL (RED).
  3. Implement `validateWebhookUrl` and `timeoutMs` (`AbortController`) in `src/utils/webhookAlerts.ts` plus safe config normalization in `loadWebhookConfig`.
  4. Run `npx --yes tsx --test src/utils/webhookAlerts.test.ts` and confirm PASS (GREEN).

### Task 5: Fix Custom Indicator Precision, Period Guard & Proportional AVWAP Band (`customIndicatorCalculator.ts`)
- **Files:** `src/utils/customIndicatorCalculator.ts`, `src/utils/customIndicatorCalculator.test.ts`
- **Steps:**
  1. Write `src/utils/customIndicatorCalculator.test.ts` testing all 6 custom indicators and `calculateCustomIndicatorById`, including `period <= 0` SuperTrend safety (no `NaN`), sub-dollar AVWAP non-negative lower envelope, and sub-dollar precision preservation.
  2. Run `npx --yes tsx --test src/utils/customIndicatorCalculator.test.ts` and confirm FAIL (RED).
  3. Clamp `period >= 1` in `calculateSuperTrend`, use adaptive price precision helper, and scale minimum AVWAP band proportionally (`typ * 0.002`) in `calculateAGAIGAvwap`.
  4. Run `npx --yes tsx --test src/utils/customIndicatorCalculator.test.ts` and confirm PASS (GREEN).

### Final Gate (`superpowers:verification-before-completion` + `superpowers:requesting-code-review` + `ultra-mode`)
- Run full `npm test` (`npx --yes tsx --test src/utils/*.test.ts`).
- Co-execute `compile_applet` and `lint_applet`.
- `restart_dev_server` and run headless Chromium visual + DOM + console verification via `playwright-cli` on `http://localhost:3000`.
