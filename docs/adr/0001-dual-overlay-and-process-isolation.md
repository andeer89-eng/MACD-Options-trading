# ADR 0001: Dual-Overlay Canvas Shared Primitives, Tabbed HUD Docking, and Shell-Free Daemon Execution

- **Status**: Accepted
- **Date**: 2026-11-18
- **Area**: `ChartViewer`, `OrderFlowOverlay`, `QuantumMarketXrayOverlay`, `server.ts`

## Context

1. Live Playwright audits of `Charts & SEC` demonstrated that activating both **Order Flow Strategy (OFS)** and **Quantum Market X-Ray (QMX)** simultaneously caused:
   - Two `274px` HUD sidebars (`548px` total) + the Setup Blueprint column crushing the main price canvas to ~220px wide.
   - Identical `top-2 left-2` overlay control strips colliding, hiding OFS controls underneath QMX.
   - Hardcoded `h-[740px]` canvas heights overflowing the `h-[calc(100vh-200px)]` wrapper on standard laptop viewports (`900px` height), clipping the bottom RSI oscillator pane.
   - Duplicated low-level canvas/HUD helpers (`drawPill`, `buildMeterBlocks`, `fmtPrice`, DPR resize, Pane-0 clip bounds) across both overlays.
2. Security review of `server.ts` identified shell interpolation of `req.body.tickers` via `child_process.exec` in `POST /api/run-python`, plus unvalidated numeric bounds in `POST /api/backtest` and un-neutralized CSV formula cells across portfolio exporters.

## Decision

1. **Shared Overlay Primitives (`src/utils/chartOverlayPrimitives.ts`)**: Consolidate DPR canvas sync, Pane-0 clip height lookup, safe chart coordinate bridges, pill rendering, meter formatting, and pure HUD docking policy (`resolveVisibleHudDock`) behind a unit-tested module interface.
2. **Stacked Overlay Strips & Single Tabbed HUD Drawer**: Offset QMX's layer toggle strip to `top-9` whenever OFS is also active, use unified `h-full min-h-0` sizing between the chart canvas and HUD container, and dock a single `274px` tabbed switcher drawer (`Order Flow HUD` | `Quantum X-Ray HUD`) when both HUDs are enabled so candles and labels remain wide and legible.
3. **Shell-Free Process Execution & Boundary Validation (`src/utils/serverSecurity.ts`)**: Replace `exec` with `execFile('python3', [...])` paired with strict ticker allowlisting (`^[A-Z0-9.\-^=]{1,16}$`, max 25 items) and explicit numeric range validation on `/api/backtest`.
4. **Shared Hardened CSV Export (`src/utils/csvExport.ts`)**: Centralize RFC-4180 CSV escaping with formula-prefix neutralization (`=`, `+`, `@`, `\t`, `\r`, non-numeric `-`) while preserving signed numeric values (`-12.50`, `-$45.20`).

## Consequences

- Zero chart compression or RSI pane clipping when stacking OFS + QMX overlays on standard desktop viewports.
- Deterministic unit test coverage (`npm test`) at the HUD docking, ticker allowlist, backtest parameter, and CSV sanitization boundaries.
- Eliminates CWE-78 command-injection surface on `/api/run-python` without changing frontend request payloads.
