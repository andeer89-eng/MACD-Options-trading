# ARCHITECTURE_AND_SPECS.md

## 1. Executive Summary & Core Concept
- **Scop:** Terminal de tranzacționare și jurnalizare all-in-one pentru traderi multi-asset, axat pe analiză tehnică avansată (Weinstein Stages, Raindrop Profiles, Auto-AVWAP), automatizare portofoliu (Stocuri & Opțiuni) și jurnalizare bazată pe dovezi (Analytics-first).
- **Tech Stack:**
  - **Frontend:** React 19 (Vite), Tailwind CSS, Lucide Icons, Recharts/Lightweight-Charts.
  - **Backend:** Node.js (Express) cu `server.ts` (Vite middleware in dev).
  - **Caching:** In-memory map pentru datele de piață (Yahoo Finance).
  - **External APIs:** Yahoo Finance (Date piață), SEC EDGAR (Filings).
- **Arhitectură:** SPA (Single Page Application) cu backend API proxy integrat.

## 2. Arhitectura Fișierelor & Structura Proiectului
```
/
├── src/
│   ├── components/  # UI (TrendSpiderSuite, TradeJournalView, Scanner, Modals)
│   ├── utils/       # Logica de business (Engine-uri matematice, fetcher-e, strategii)
│   ├── data/        # Preset-uri (SP500 Universe, Indici)
│   └── App.tsx      # Entry point
├── server.ts        # Express Server / Backend Proxy
├── vite.config.ts   # Configurație Vite
└── package.json     # Dependențe & Scripturi
```

## 3. Hartă Exhaustivă a Paginilor & Rutelor (UI & API)
- **`/` (SPA)**: Dashboard principal care conține `TrendSpiderSuite` (Terminalul), `TradeJournalView` și `LiveScanner`.
- **API Endpoints (Server.ts):**
  - `/api/candles`: Fetch date istoric + Indicatori (Weinstein, Divergențe).
  - `/api/scan`: Scanare paralelă S&P 500.
  - `/api/backtest`: Motor backtest (Stan Weinstein).
  - `/api/cboe-options`: Date Opțiuni (CBOE/Macro).
  - `/api/heatmap`: Telemetrie Heatmap.

## 4. Legăturile Logice & Fluxurile de Date
- **Data Flow:** UI -> API Request -> FetchYahooData/CalculateIndicators -> Engine Logic -> Responce JSON -> UI State (useMemo).
- **Business Logic:**
  - `trendSpiderEngine.ts`: Inima terminalului; recalculează stage-urile Weinstein și profilurile Raindrop la fiecare selecție de simbol.
  - `tradeJournal.ts`: Gestionează starea jurnalului în `localStorage`, cu funcții de sortare/filtrare/statistici.
- **Integrări:** Yahoo Finance (fără cheie API publică, cu fallback determinist pentru reziliență).

## 5. Schemă Bazei de Date & State Model
- Aplicația este "Serverless-first" din perspectiva datelor:
  - **Persistent State:** `localStorage` (cheile `trullas_trade_journal_v1`, `trullas_risk_settings_v1`).
  - **Transient State:** `useState` / `useMemo` pentru contextul curent al simbolului selectat și tab-urilor.

## 6. Puncte Vulnerabile & Datorii Tehnice
- **Limitări:** Dependența de rate limiting-ul Yahoo Finance (atenuată prin caching în memorie și fallback determinist).
- **Datorii:** Refactorizarea `TrendSpiderSuite` (1600+ linii) în componente mai mici pentru mentenabilitate.

## 7. Instrucțiuni pentru AI-ul de Îmbunătățire
- **Următorii pași:**
  - Implementarea unui sistem de persistență mai robust (ex: Firebase/Supabase) pentru tranzacții.
  - Optimizarea performanței render-ului pentru tab-ul `S&P 500 Full Scanner`.
- **Reguli de aur:**
  - Păstrează determinismul matematic pentru indicatori.
  - Nu adăuga "AI features" (chatbots) dacă nu este solicitat explicit.
  - Menține stilul UI Dark (zinc-900).
