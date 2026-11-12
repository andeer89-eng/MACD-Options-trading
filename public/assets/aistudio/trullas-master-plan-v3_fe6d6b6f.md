# TRULLAS — Master Plan v3 (varianta finală)

_Data: 2026-11-10 (actualizat 2026-11-12). Înlocuiește secțiunile C–F și capitolul R din `trullas-analiza-si-plan.md`. Completează `trullas-schema-si-refactor.md` prin `trullas-schema-v3-delta.sql`. Prototipul ecranului zilnic: `trullas-today-prototype.html`. Prompt de execuție pentru un agent de coding, cu ordinea exactă din §8 și criteriile de acceptare: `trullas-ai-implementation-prompt.md`._

---

## 0. Verdict

Cele două analize (planul owner-ului și auditul Z.ai, așa cum apare în capitolul R) pun același diagnostic, corect: **lipsește o singură sursă de adevăr** (scanner ×5, nivele entry/SL/TP în 6 locuri, 4 liste „best setups", 3 jurnale). Planul v2 e baza bună. v3 păstrează 80% din el și schimbă șapte lucruri:

| # | Schimbare față de v2 | De ce |
|---|---|---|
| 1 | Interfața se organizează pe **ritmul zilei** — Today / Chart / Scan Lab / Autopilot / Review (+ Settings) — nu pe module. Market Pulse + Watchlist devin un singur ecran. | Traderul le consumă împreună: regimul decide câte din setup-uri se iau. Jurnalul „live" (Autopilot) se separă de jurnalul „după" (Review): alt ritm, alt mod mental. |
| 2 | **Autolearning pe semnale (shadow), nu doar pe trade-uri executate.** Pragul „30 trade-uri / strategie / regim" se înlocuiește cu praguri pe acțiune; semnalele au **statistică proprie, cu ieșirea modelată și R net de costuri** (§6.5). | La n = 30 poți detecta doar efecte ≥ ~0,55R; celula 4 strategii × 3 regimuri × 30 = 360 trade-uri = 2,3 ani la 3 trade-uri/săptămână (§6.2). |
| 3 | **Scanare în două straturi:** EOD pe toate cele 503 simboluri; intraday doar pe watchlist + poziții (≤ 60). | „Toate pe oră" arde rate-limit-ul Yahoo degeaba: stage-ul Weinstein săptămânal nu se schimbă intraday. |
| 4 | Un singur punct de decizie pentru bot: **`canTrade()`** (piață deschisă + date LIVE + kill switch + pierdere zilnică + expunere + regim + regula de mărime minimă). | Failure-ul observat live (poziții pe piață închisă) devine imposibil și la nivel de bază de date (§7). |
| 5 | „Ce fac instituțiile" = **EDGAR** (Form 4, 13F cu lag etichetat), nu doar proxy de volum. | Aplicația are deja integrare EDGAR (din meta-descriere), dar niciun plan nu o folosește. |
| 6 | **Două spike-uri de validare înainte de P2** (Regime Score discriminează? strategiile au edge net de costuri?) + corecții de schemă (index invalid, view fără `security_invoker`, tabel `signals` lipsă). | Nu construi învățarea automată înainte să știi că există semnal de învățat. |
| 7 | **Nasdaq:** universul devine un registru (`sp500`, `ndx100`, uniunea lor, mai târziu `nasdaq_liquid`), iar Nasdaq Data Link intră ca sursă de *reconciliere* a datelor, nu ca înlocuitor al Yahoo. | S&P 500 acoperă 79 din cele 100 de companii Nasdaq-100 (articol nedatat), deci câștigul de acoperire e mic și ieftin; câștigul real e calitatea datelor (§5). |

---

## 1. Surse și limite (ce am și ce NU am verificat)

| Sursă | Folosită pentru | Limită |
|---|---|---|
| URL-ul aplicației | Meta-descriere: „MACD Triple Divergence 24/7 scanner and rules analyzer … Yahoo Finance … SEC EDGAR filings … standalone Python daemon generator" | Aplicația e un SPA randat în browser: am primit doar meta-tag-urile, **nu am inspectat UI-ul**. Inventarul live vine exclusiv din capitolul R. |
| `ARCHITECTURE_AND_SPECS.md` | Stack, chei localStorage, reguli de aur | — |
| `trullas-analiza-si-plan.md` (+ cap. R) | Diagnostic, plan v2, ordinea Sprint 1 | **Auditul TD-AUDIT-2026-01 nu e atașat.** Cifrele lui (18 view-uri, 7 trust bugs, 6 chei, cele 10 porți paper→live) le iau din cap. R, neverificate. |
| `trullas-schema-si-refactor.md` | DDL și refactor terminal | Verificat de mine: 3 probleme (§7). |
| `Trading_Journal_Deep_Dive_2026.pdf` (Z.ai) | Blueprint jurnal: câmpuri, vederi, ritm de review | **Nu este auditul Trullas**, ci un raport despre 12 platforme de jurnal. Datele din Cap. 6 sunt sintetice și inconsistente intern (vezi mai jos). |
| Pagini Nasdaq: documentația Data Link, Symbol Directory, Nasdaq Basic, fișa NDX | Oferta Nasdaq verificată la 2026-11-10 (§5) | Documentație oficială, dar fără prețuri sau rate-limit-uri. Suprapunerea NDX ∩ S&P 500 (79) vine dintr-un articol nedatat. Un blog de vendor terț (promoțional, 23.09.2026) nu a fost folosit pentru concluzii. |
| Brief „CME Futures Free-Data Integration" (atașat 2026-11-10) | Etichetarea sursei/întârzierii; ce atinge statistica shadow (§5) | Citit integral; **nu am verificat** termenii paginii CME Delayed Quotes (S4), întârzierea Yahoo pentru futures, nici limitele de istoric pe intervale. Neintegrat în total (§11.7). |
| `trullas-schema-v3-delta.sql` (scris de mine) | Schema v3 + secțiunea 10 (statistica shadow) | **Executat** pe PostgreSQL 16 (DDL-ul original + delta): 202 verificări numerice ale view-urilor față de un calcul independent (Python/scipy), 14 teste negative, RLS. Datele de test sunt sintetice: verifică aritmetica și integritatea, **nu** edge-ul strategiilor. |

**Verificări numerice (rulate, nu estimate din ochi):**

- PDF Cap. 6: cu win rate 54%, câștig mediu +1,62R, pierdere medie −0,91R → expectancy +0,456R (corect) dar **profit factor 2,09, nu 1,51** cât scrie; iar 240 trade-uri × 0,456R × $200 = **$21.9k**, nu $12.945. ⇒ nu folosi cifrele PDF-ului ca ținte de benchmark.
- Plan v2: Sprint 1 însumat pe amendamente = **17 zile** (scrie ~15); program total cu 2bis = **67 zile** (scrie 65); „6–7 săptămâni cu 2 dezvoltatori pe P0+P1" e de fapt programul *întreg* la 2 dezvoltatori (65/2 = 6,5 săpt.); P0+P1 la 2 dezvoltatori = ~4,2 săpt.

---

## 2. Sinteză: ce spun sursele

| # | Constatare | Evidență | Încredere |
|---|---|---|---|
| F1 | Sursa unică de adevăr lipsește (scanner, nivele, liste, jurnale) | Owner (×3 scanner) + audit live (×5 scanner, ×6 nivele, ×4 liste, ×3 jurnale) | Înaltă |
| F2 | Botul a deschis poziții cu piața SUA închisă | Owner + audit live | Înaltă |
| F3 | Șapte „trust bugs" (PF 99x la n=3, „Losses 0.00 Protected" fără trade-uri, SIVE.ST în S&P 500, LaTeX brut, „(17)" vs 18, butoane Chart fără context, 3 jurnale) | Doar audit | Medie-înaltă (specifice, verificabile în 2 zile) |
| F4 | Metrici agregate pe tot istoricul, nu pe epoca de capital | Owner + audit; schema o rezolvă | Înaltă |
| F5 | Persistență în localStorage (6 chei) = risc de pierdere totală | Specs + audit | Înaltă |
| F6 | Pragul de învățare propus nu e atins în timp util și are putere statistică mică | Calcul propriu (§6.2); depinde de σ(R) ≈ 1,0–1,4, ipoteză de înlocuit cu valoarea măsurată | Înaltă (matematic), medie (σ) |
| F7 | PDF: blueprintul de jurnal (R-multiples, MFE/MAE, grade, heatmap sesiune, playbook cu reguli kill/promote, review zilnic/săptămânal/lunar) | PDF | Medie (date ilustrative inconsistente, structura e solidă) |
| F8 | EDGAR și „Python daemon generator" există în aplicație dar nu apar în niciun plan | Meta-descriere | Joasă (nu am văzut UI-ul) |

---

## 3. Principii de produs (final)

1. **O singură sursă de adevăr per concept:** Regime, Levels, Scan, Watchlist, Journal. UI-ul citește, nu calculează.
2. **Orice număr poartă 3 etichete:** *as-of* (ET + ora locală), *calitatea datelor* (LIVE / CACHED / SIMULATED), *n* (dimensiunea eșantionului).
3. **Botul execută doar ce permite `canTrade()`.** Fiecare refuz e logat cu motiv.
4. **Învățarea propune; omul aprobă boost-ul; doar pauza e automată.**
5. **24/7 = programare inteligentă într-un worker**, nu polling continuu în browser.
6. **Fiecare setup explică „de ce" și „când greșesc"** (reasons + invalidation).
7. **Determinism:** engine pur, versionat; fiecare decizie stochează `engine_version`.
8. **Semnalul se datează la confirmare, nu la pivot** (anti look-ahead, §4.2).

---

## 4. Spațiul de lucru final

### 4.0 Bara de stare (globală, pe toate paginile)

`[sesiune: PRE | REGULAT | AFTER | ÎNCHIS · ora ET / ora locală] [date: LIVE | CACHED | SIMULATED · as-of] [Regime: scor + bandă] [Bot: ARMAT | PAUZĂ | KILLED + buton kill switch]`

Dacă datele nu sunt LIVE: banner roșu „SIMULATED DATA" pe tot ecranul, iar botul refuză intrări noi.

### 4.1 TODAY — „ce face piața și ce tranzacționez azi" (înlocuiește Zona 1 + Zona 2)

**Regime Score 0–100** — compoziția din v2 rămâne (trend S&P 25% · breadth 25% · VIX 20% · Put/Call 15% · participare sectorială 15%, debounce 2 cicluri), cu patru adăugiri:
- se afișează **componentele**, nu doar totalul;
- breadth (% peste MA50/MA200, NH/NL) se calculează **din propriul scan EOD** — cost zero;
- greutățile sunt o **ipoteză**, validată în Spike R (§9), nu un fapt;
- scorul are o **politică atașată** (pre-înregistrată, valori inițiale de validat):

| Bandă | Scor | Politică bot / watchlist |
|---|---|---|
| Risk-off | 0–30 | fără intrări noi long; setup-urile long apar marcate „blocat de regim" |
| Neutral | 30–60 | sizing ×0,5; scor setup ≥ 75 |
| Risk-on | 60–85 | sizing ×1,0; scor setup ≥ 60 |
| Extins | 85–100 | sizing ×0,75; scor ≥ 70; stop-uri strânse (risc de reversal) |

**Rotație sectorială (RRG):** cele 11 ETF-uri SPDR, RS vs SPY pe 3 orizonturi, cadran Leading / Weakening / Lagging / Improving.

**Instituții / smart money (EDGAR), cu lag etichetat în UI:**
- Form 4 (depus în 2 zile lucrătoare): doar cumpărări pe piață deschisă (cod P), cluster ≥ 2 insideri în 30 zile;
- 13F (depus până la 45 zile după trimestru): schimbare netă QoQ — **context, nu semnal de timing**;
- respectă limita SEC (10 cereri/s) și User-Agent declarat; cache agresiv.

**Calendar de risc:** FOMC, CPI, earnings în următoarele N zile pentru simbolurile din watchlist → badge „high risk day".

**Watchlist zilnică** (un singur tabel persistat, 20–30 rânduri maxim, calitate > cantitate):

`rank · simbol · sector · setup · scor (stage/divergență/ATR/volum) · reasons[] · zonă de intrare · SL · TP1/TP2 · R:R · invalidare · distanță până la intrare · status (NEW → WATCHING → TRIGGERED → EXPIRED | INVALIDATED) · calitate date · smart-money · earnings în N zile · pin`

Se generează după închidere (17:30 ET), se reîmprospătează premarket (08:30 ET) și intraday doar pentru stări (Tier 2). Arhivare, nu ștergere.

### 4.2 CHART (terminal, Zona 4 din v2)

Structura de componente din `trullas-schema-si-refactor.md` rămâne (ChartPane, LevelsLayer, DivergenceOverlay, hooks). Adaosuri:

- **Un singur obiect `Levels`** (Anexa B) produs de `useLevels`, consumat de chart, rândul de watchlist, botul (ordinul) și jurnalul (snapshot la decizie). Test de snapshot: același simbol + timeframe → aceleași niveluri peste tot.
- **Semantica markerilor:** `BUY` = trigger confirmat (închidere în zona de intrare) *și* regimul permite; `REVERSAL` = epuizare/divergență pe o poziție deschisă (strânge stop-ul / ieși) sau avertisment pe simbol fără poziție.
- **Anti look-ahead:** o divergență bazată pe fractali 5/5 este *cunoscută* abia la a 5-a bară după pivot. Markerul se desenează la pivot, dar semnalul se datează `confirmed_bar_ts`; backtest, shadow și bot intră **după** confirmare (la deschiderea barei următoare). Markerii apar doar pe bare închise (fără repaint).
- **Stop prea larg:** dacă `stop = min(low structură, intrare − 1,5×ATR14)` dă o distanță > 3×ATR → setup marcat „SKIP: stop prea larg" (altfel dimensiunea devine neglijabilă). Simetric pentru short.
- **Opțiuni:** nivelurile sunt pe subiacent; riscul = prima plătită (sau lățimea spread-ului minus credit), nu ATR pe primă.
- Multi-timeframe: weekly = stage, daily = setup, hourly = timing. Replay bar-by-bar → P3.

### 4.3 SCAN LAB

Un singur `scanService` (motor + cache TTL pe timeframe) consumat de toate UI-urile. Preseturi: 4-Pillars Divergence, Weinstein Stage Breakout, Bullish/Bearish Exhaustion, AVWAP Reclaim, ATR Squeeze. Istoric + diff („noi față de ieri"), buton „Backtest this setup" per rând. **Singura cale în watchlist** = promovare (automată pentru scor ≥ prag, sau manuală cu pin).

### 4.4 AUTOPILOT (live: acțiuni și poziții)

Tab-uri Stocks / Options pe același ecran: starea botului + kill switch, rezultatul ultimului ciclu `canTrade()`, poziții deschise cu SL/TP, deciziile de azi, **deciziile blocate + motivul**, pierdere zilnică vs limită, expunere pe sector, heartbeat. Badge de sesiune pe fiecare trade (PREMARKET / REGULAR / AFTERHOURS).

### 4.5 REVIEW (jurnal și învățare — „după")

- Selector de epocă (activă „2k Virtual"; „Legacy 50k" read-only).
- **Banda de 6 KPI**: P&L net, trade-uri închise (n), expectancy ± CI90, profit factor (afișat „—" până la n ≥ 10), win rate, max drawdown. Plus curba de equity cu fâșia underwater și barele de P&L zilnic.
- Heatmap zi × sesiune (R mediu), distribuția R, MFE/MAE, eficiența ieșirii (R realizat / MFE).
- **Playbook per strategie:** n, expectancy, CI90, MDE, stare, propuneri de schimbare (aprobă / respinge).
- **Calitatea semnalelor (shadow)** — panou **separat** de jurnalul de trade-uri (§6.5): curba edge-ului (R la 1…20 bare, fără ieșire), R net pe politica primară cu CI90, cohorte lunare + fereastră rulantă de 60 de zile cu steag de degradare, comparație între politicile de ieșire, alpha față de controale, **luat vs. sărit pe motiv**, eficiența ieșirii (capture, give-back).
- Câmpuri doar pentru trade-uri manuale: grade A–F, max 6 etichete de greșeală, teză într-o linie (≤ 30 s). Pentru bot, „aderența la reguli" e 100% prin construcție; se măsoară în schimb **blocările de gate, slippage față de plan și eficiența ieșirii**.
- Ritm (din PDF, Cap. 7): zilnic 10 min · săptămânal 30 min (raportul generat automat de learning loop) · lunar 60 min (decizii kill/promote).

### 4.6 SETTINGS / SYSTEM

Sănătatea datelor (provider, consum rate-limit, ultimul scan), programări, `config_changelog`, export/import JSON full-state, comutator paper/live cu checklist (§6.4).

---

## 5. Motorul de date

**Flux (o direcție):** Provider → cache TTL → engine pur (TS, versionat) → snapshots (Supabase) → UI + bot.

**Programare (America/New_York + calendar NYSE; nu ceasul serverului, nu offset-uri fixe):**

| Moment (ET) | Ce rulează | Echivalent local Chișinău* |
|---|---|---|
| 17:30 zilnic | Tier 1: scan EOD, toate cele 503, bare 1d + 1w; breadth; Regime; watchlist nouă; outcome engine | ~00:30 (rezultatele sunt gata dimineața) |
| 08:30 | Reîmprospătare premarket: gap-uri, earnings, invalidări | ~15:30 |
| 09:30–16:00, la 5 min | Tier 2: **doar** watchlist + poziții deschise (≤ 60 simboluri), bare 1h/5m | 16:30–23:00 |
| Duminică | Learning loop săptămânal + raport | — |

\* Decalajul NY–Chișinău e de 7 ore, **cu două excepții anuale de ~6 ore** când SUA și UE trec la ora de vară/iarnă la date diferite (în 2026: 8–28 martie și 25 oct–1 nov; deschiderea NYSE = 15:30 locale în acele intervale, verificat la 2026-03-16). De aceea orice logică de „piață deschisă" folosește fusul IANA, nu o oră locală.

**Calitatea datelor:** `live | cached | estimated`. Botul nu intră pe altceva decât `live`. Yahoo e neoficial: acceptabil pentru paper, **nu pentru live** (poartă în §6.4).

**Univers:** listă fixă per univers (vezi mai jos), cu test în CI; pentru `sp500`: 500–505 simboluri, fără sufixe de bursă străină (`.ST`, `.L` etc.; excepții BRK.B, BF.B). Atenție: membrii *curenți* ai S&P 500 introduc survivorship bias în backtest → rezultatele Spike E sunt un plafon optimist.

**Nasdaq: univers și provider (verificat 2026-11-10):**

- **Registru de universuri în loc de „S&P 500" hardcodat:** `sp500` (nucleu) · `ndx100` · `sp500_ndx100` (uniunea dedupată, noua valoare implicită) · `nasdaq_liquid` (faza 2). Nasdaq-100 = 100 de companii listate pe Nasdaq, fără financiare, 12 cu sediul în afara SUA; după un articol nedatat, 79 sunt deja în S&P 500 ⇒ ~21 simboluri noi (se măsoară la build; costul Tier 1 crește cu ~4%).
- **Regime Score rămâne calculat pe S&P 500** (compoziția de validat în Spike R nu se atinge). Breadth pe Nasdaq-100 se afișează ca informație și intră în Regime doar dacă Spike R arată valoare adăugată.
- **Tot Nasdaq-ul listat (mii de simboluri) doar în faza 2 și doar cu filtre:** acțiuni comune (fără ETF, fără „test issue", stare financiară normală), preț ≥ $5, volum median 20 zile în dolari peste un prag de setat, iar pentru opțiuni lichiditate de opțiuni. Fără filtre intră penny stocks, SPAC-uri și ADR-uri ilichide care strică scorurile și consumă rate-limit-ul.
- **Lista de simboluri oficială:** fișierele Nasdaq Trader Symbol Directory (`nasdaqlisted.txt`, `otherlisted.txt`, actualizate de mai multe ori pe zi) dau listarea și excluderile (test issue, stare financiară). Flag-ul ETF e documentat doar pentru `otherlisted`: verifică coloanele fișierului la descărcare. **Nu conțin apartenența la indice:** S&P 500 / NDX vin dintr-o listă întreținută separat, stocată în `universe_members` cu `valid_from` / `valid_to` (point-in-time de acum înainte ⇒ reduce survivorship bias în viitor).
- **Testul de univers (Sprint 1, #1) respinge după bursa de listare, nu după domiciliul companiei:** cele 12 companii non-SUA din NDX sunt listate pe Nasdaq și sunt valide; `SIVE.ST` nu. Simbolurile NDX-only nu au sector GICS din S&P ⇒ `sector` + `sector_source` în `universe_members`.
- **Nasdaq Data Link (ce am găsit):** pentru acțiuni SUA, pagina de documentație listează doar prețuri end-of-day (QuoteMedia), în mare parte premium; fundamentalele (Sharadar, Zacks) sunt premium. **Nasdaq Basic** (BBO + last sale în timp real) se distribuie prin API-urile Data Link, cu licență per utilizator (profesionist / neprofesionist); prețul nu e publicat pe pagina văzută (trial prin formular), iar tarifele de pe ea datează din decembrie 2021. BBO-ul e al pieței Nasdaq (nu NBBO consolidat), iar last sale include și rapoartele TRF. Potrivirea pentru Tier 2 nu e confirmată.
- **Cum îl folosim:** (1) **Tier 1: reconciliere pe două surse** — close-ul zilnic Yahoo vs Data Link EOD; diferență peste prag (de setat, ex. 0,5%) ⇒ `data_quality = 'estimated'` pe simbolul/ziua respectivă, înregistrat în `indicator_snapshots.recon_diff_pct`. Ieftin, și ridică încrederea fără să schimbi providerul. (2) Poarta paper → live (§6.4a): Nasdaq Basic e unul dintre candidați, alături de Polygon/Tiingo, judecat după licență, acoperire (venue vs consolidat) și preț. (3) **Spike P (1 zi):** cere trial și prețuri, compară 30 simboluri × 20 zile de close-uri cu Yahoo, citește termenii licenței pentru uz automatizat.

**Futures CME (brief atașat; citit, neintegrat în total):**

- **Se potrivește:** etichetarea per număr (`data_source`, `delay_minutes`, `as_of`, `is_estimated`) se mapează pe `DataQuality` din Anexa B (`is_estimated = true` ⇒ `estimated`). Fâșia ES/NQ/YM/RTY + GC/CL/ZN/ZQ are loc în TODAY ca **context**, nu în Regime Score (compoziția lui se validează în Spike R).
- **Ce schimbă la statistica shadow (§6.5):** semnalele pe date `estimated` (fallback sintetic) **nu se înregistrează**. `=F` continuu nu e ajustat la roll ⇒ un gap de roll poate declanșa fals SL/TP: outcome engine marchează `void` (`roll_gap_suspect`) și folosește **o singură sursă canonică per simbol** (brief-ul însuși interzice amestecul Yahoo + Stooq).
- **De verificat înainte de build:** S4 (scrape pe pagina CME Delayed Quotes) e un endpoint nedocumentat — termeni de utilizare și stabilitate necunoscuți; întârzierea de 10–20 min a Yahoo pentru futures e afirmația brief-ului, neverificată de mine.
- **Limită de rol:** date întârziate 10–20 min nu pot alimenta Tier 2 sau botul ⇒ futures rămân context până la un provider oficial (poarta §6.4a).
- **Estimare:** ~4–5 zile (brief-ul atinge 7 fișiere; judecata mea), **neinclusă în total**; decizia e în §11.7.

**Unde rulează:** worker în afara browserului, declanșat de un scheduler extern (cron Supabase / Cloud Scheduler / GitHub Actions). Un `setInterval` într-un server care poate scala la zero nu e un 24/7. **Un singur engine în TypeScript** pentru UI și worker; nu îl reimplementa în Python (ar recrea exact duplicarea de logică pe care o eliminăm). „Standalone Python daemon generator" din meta-descriere: de clarificat — dacă duplică logica de scan, se retrage în favoarea worker-ului.

**Securitate:** cheile de broker doar în secretele worker-ului, niciodată în browser/localStorage; RLS pe toate tabelele; `service_role` doar în worker.

---

## 6. Autotrading, jurnal, autolearning

### 6.1 `canTrade()` — verificări în ordine

| # | Verificare | Eșec → |
|---|---|---|
| 1 | Calendar NYSE deschis acum (zi lucrătoare, sărbători, program scurt 13:00 ET) | blocat |
| 2 | Date `live` și vechime ≤ 2× intervalul barei | blocat |
| 3 | Kill switch inactiv; stare = ARMAT | blocat |
| 4 | Pierdere zilnică < limită (inițial 2% din equity-ul epocii) | circuit breaker, oprește ziua |
| 5 | Expunere pe sector ≤ plafon (inițial 30%) | blocat |
| 6 | Strategia nu e în stare `paused` | blocat |
| 7 | **Regula de mărime minimă:** dacă cel mai mic lot posibil depășește riscul maxim/trade (inițial 1%) → **NU tranzacționa** (nu rotunji în sus); se loghează `skipped_size` | blocat |
| 8 | Opțiuni: spread bid-ask ≤ 10% din mid, OI ≥ 100, volum ≥ 10, fără earnings în DTE (dacă strategia nu cere), lanț de opțiuni `live` | blocat |
| 9 | Politica de regim (§4.1): multiplicator de mărime / scor minim | ajustează sau blochează |
| 10 | Heartbeat worker < 2 cicluri | blocat |

Rezultat: `{allow, sizeMultiplier, reasons[]}`. Valorile numerice sunt **puncte de pornire de setat de tine**. Pe un capital de $2.000, 1% risc = $20: majoritatea contractelor single-leg riscă mai mult → regula 7 va bloca des; asta e comportamentul corect, iar semnalul blocat rămâne în învățare ca shadow.

### 6.2 Învățarea — varianta finală

**Unitatea de învățare = semnalul (shadow), nu doar trade-ul.** Fiecare semnal confirmat al fiecărei strategii se înregistrează în `signals` cu intrare/SL/TP ipotetice și rezultat urmărit de outcome engine, indiferent dacă botul l-a luat. Reguli conservatoare: intrare la deschiderea barei după `confirmed_bar_ts`; dacă SL și TP sunt atinse în aceeași bară → SL primul; costuri + slippage; opțiunile se învață pe rezultatul *subiacentului* în R (P&L-ul de opțiuni cere bid/ask real). Eșantionul efectiv = zile distincte de semnal (semnalele din aceeași zi sunt corelate). Ieșirea, statisticile și disciplina anti-overfitting: §6.5.

**Putere statistică** (test unilateral 5%, putere 80%, n = ((z_α + z_β)·σ/δ)², z_α+z_β = 2,486):

| σ(R) \ efect δ | 0,2R | 0,3R | 0,5R |
|---|---|---|---|
| 1,0 | 155 | 69 | 25 |
| 1,2 | 223 | 99 | 36 |
| 1,4 | 303 | 135 | 49 |

La n = 30 și σ = 1,2 efectul minim detectabil e **≈ 0,55R**; cu 12 celule (4×3) și corecție Bonferroni, ~70 trade-uri/celulă pentru 0,5R. σ = 1,0–1,4 e o ipoteză: se înlocuiește cu σ măsurat din jurnal.

**Praguri pe acțiune:**

| Acțiune | Condiție | Reversibilă? |
|---|---|---|
| Afișare statistici | oricând, **mereu cu n și CI90** | — |
| Pauză automată (→ paper sau ½ mărime) | n ≥ 30 pe strategie și R mediu < −0,1R (tripwire, nu verdict) | da |
| Boost (+1 pas, plafon ×1,25, max 1 pas/lună) | n ≥ 100 pe strategie, limita inferioară CI90 > 0, validare out-of-sample (ultimii 30% nefolosiți la reglaj), **aprobare manuală** | da |
| Condiționare pe regim | sub n = 100: regimul e filtru *a priori* (§4.1), nu învățat. După: 2 găleți (risk-on / restul) | — |
| Reglare parametri indicator | **niciodată automat**; doar config versionat + `config_changelog` + walk-forward | — |

La 3 trade-uri executate/săptămână, 360 trade-uri durează 2,3 ani (1,4 ani la 5/săpt., 3,5 ani la 2/săpt.); rata reală a semnalelor se măsoară în prima lună din `scan_results`.

### 6.3 Ce se păstrează din blueprintul de jurnal (PDF)

R-multiple ca unitate; MFE/MAE și eficiența ieșirii; heatmap zi × sesiune; distribuția R; playbook cu reguli kill/promote; ritm zilnic/săptămânal/lunar; export CSV/JSON gratuit. **Nu se adoptă:** chatbot AI (regula din specs), aplicație mobilă, import de la brokeri.

### 6.4 Poarta paper → live

Cele 10 porți din audit (nu le-am văzut) rămân. Se adaugă 4:
- (a) provider de date oficial (Nasdaq Basic prin Data Link, Polygon, Tiingo sau echivalent — vezi §5) în locul Yahoo;
- (b) Spike E: edge net de costuri, peste baseline-ul random;
- (c) n ≥ 100 pe strategie cu limita inferioară CI90 > 0;
- (d) 30 de zile de paper fără incident de gate/heartbeat.

### 6.5 Statistica semnalelor shadow — calitatea semnalelor în timp

**Separată de jurnalul de trade-uri.** Jurnalul spune cât a câștigat *botul*; aici se măsoară cât de bune sunt *semnalele*, luate sau nu de bot. Se calculează pe fiecare semnal confirmat (schema: secțiunea 10 din `trullas-schema-v3-delta.sql`).

**Ieșirea face parte din semnal.** Un semnal fără ieșire nu are P&L și nu rămâne „pending" la nesfârșit: fiecare se închide după o *politică de ieșire* versionată. Valorile sunt **puncte de pornire**, nu adevăruri.

| Politică | Ieșire | Rol |
|---|---|---|
| `X1_fixed_v1` (primară) | SL (structură / ATR), TP1 din `Levels`, **time-stop** (1d: 15 bare · 1w: 8 · 1h: 20) | ce ar face botul; cifrele de titlu |
| `X2_trail_v1` | SL → breakeven la +1R, apoi trailing 2×ATR; fără TP; time-stop 25 | compară „lasă câștigul să alerge" |
| `X3_structure_v1` | REVERSAL opus / închidere sub MA30 / invalidare; time-stop 25 | compară ieșirea pe structură |

**Reguli de umplere** (conservatoare; toate în `exit_policies.params`, deci auditabile):
- intrare la deschiderea barei de după `confirmed_bar_ts`; SL și TP în aceeași bară ⇒ **SL primul**;
- gap peste SL ⇒ umplere la deschidere (R poate fi sub −1R); gap peste TP ⇒ umplere la nivelul TP, **fără bonus de gap**;
- **time-stop ⇒ ieșire la deschiderea barei următoare, cu R-ul real** (nu rotunjit la 0 și nu „expirat"): un semnal care nu a atins nici SL, nici TP are totuși un rezultat;
- costuri în R: `cost_R = costul dus-întors per unitate / |intrare − stop|` (slippage 5 bps/parte = ipoteză de calibrat cu fill-urile paper); **R net = R brut − cost_R**;
- un singur semnal per (simbol, strategie, direcție) cât timp altul e deschis sau în cooldown de 5 bare — altfel același setup se numără de mai multe ori;
- `earnings_in_window` ⇒ statistici cu și fără (poți alege să nu ții peste raportare); date `estimated` sau gap de roll suspect ⇒ semnal exclus (`void`), niciodată numărat.

**Patru întrebări, patru surse — nu se amestecă:**

| Întrebare | Sursă | Ce vezi |
|---|---|---|
| **Q1** Semnalul are edge? | `signal_forward`: R la 1 / 3 / 5 / 10 / 20 bare, **fără ieșire**, stop-ul ignorat | curba edge-ului: unde apare și unde se pierde ⇒ de aici se alege time-stop-ul |
| **Q2** Ce aș fi câștigat? | `signal_outcomes`, per politică | R net, P&L ipotetic, win rate, PF („—" sub n = 10), CI90, MDE |
| **Q3** Ieșirea e bună? | `v_signal_exit_quality` | mix SL / TP / time / trail, bare ținute, MFE / MAE, **give-back** = MFE − R realizat, **capture** = Σ R realizat / Σ MFE |
| **Q4** Mai bun decât întâmplarea? | controale random-entry potrivite (același simbol, aceeași geometrie de stop în ATR), perechi 1:1 | alpha = R semnal − R control, CI90 pe perechi |

Q4 există pentru că într-o piață în creștere aproape orice long câștigă: fără control nu separi edge-ul de drift.

**P&L ipotetic = R net × risc fix per semnal** (implicit 1% din capitalul de referință: $20 pe $2.000). **Rezolvat (2026-11-12): capitalul alocat și risc-ul % sunt setări reglabile manual din UI** (`bot_state.sim_capital_usd` + `bot_state.max_risk_per_trade_pct`, deja existente în schema v3 delta — niciun câmp nou), nu valori fixate în cod; $2.000/1% rămân doar *valorile implicite*. Implementat și testat live în prototip (Panoul de simulare: schimbi capitalul/riscul, tot ce e în dolari — mărimea poziției, KPI-urile din Review, P&L-ul ipotetic de mai jos — se recalculează instant, pentru că R-multiple-urile din `signals`/`trades` rămân adimensionale; conversia în $ se face doar la randare). Detalii de portare în React: `trullas-ai-implementation-prompt.md`, §1. Idealizat: fracții de acțiune, **fără** regula de mărime minimă — arată calitatea semnalului; ce poate lua efectiv contul se vede în felia `skip:size`. R cumulat = sumă de R cu risc fix per semnal, **nu curba unui cont** (semnalele simultane își împart capitalul); simularea de portofoliu cu capital limitat → P3.

**Calitatea în timp:**
- **cohorte lunare** după data *confirmării*: R net ± CI90, n și câte sunt încă deschise — cohorta recentă e nematurată (hașurată), altfel statisticile favorizează semnalele rapide;
- **fereastră rulantă de 60 de zile cu semnale** (CI90 pe clustere zilnice, calculat în engine din `v_signal_day`);
- **steag de degradare** (informativ): limita superioară CI90 a ferestrei rulante < 0 la două calcule săptămânale consecutive. Nu pune nimic în pauză singur — pauza rămâne regula din §6.2;
- felii: regim la momentul semnalului · strategie · luat / sărit pe motiv · earnings în fereastră.

**Luat vs. sărit = valoarea filtrelor.** Pentru fiecare motiv (`regime`, `guard`, `size`, `not_selected`, `strategy_paused`) se afișează R net mediu ± CI90. Dacă semnalele sărite de filtrul de regim au R mediu mai mare decât cele luate, filtrul costă bani. Atenție: `skip:size` înseamnă „infezabil pe cont", nu „semnal prost". `v_shadow_vs_executed` compară, pe același semnal luat de bot, R-ul shadow cu R-ul executat: calibrează ipoteza „shadow ≈ executat".

**Disciplină împotriva auto-păcălirii:**
1. **Time-stop-ul și TP se aleg din curba forward pe primele 70% din date, se verifică pe ultimele 30%, apoi politica se îngheață.** Schimbarea = politică nouă (`X1_fixed_v2`), aplicată semnalelor de la acea dată; un trigger în DB interzice modificarea parametrilor după ce există rezultate.
2. Comparația X1 / X2 / X3 e informativă: sunt aceleași semnale (corelate), iar „cea mai bună ieșire" pe un eșantion mic e zgomot (MDE din §6.2 se aplică). Politica primară nu se schimbă sub n_eff ≥ 100.
3. Orice cifră afișată poartă n, n_eff, CI90, politică, versiune de engine și „as of"; nicio cifră din semnale pe date `estimated`.
4. **Limită a CI-ului:** clusterele sunt zilele de semnal, dar ferestrele de deținere se suprapun (un semnal de luni și unul de marți împart 14 din 15 bare). CI90 e deci o limită *optimistă*; blocurile de 5–10 zile sunt varianta conservatoare (P3).
5. Opțiuni: P&L-ul se calculează pe **subiacent, în R**. P&L real de opțiuni cere bid/ask înregistrat la semnal și la ieșire — se acumulează doar din ziua în care începe înregistrarea, nu se reconstruiește retroactiv.
6. Lista curentă a indicelui (survivorship) face ca primele luni de statistică să fie un plafon optimist (§5).

Nu e o promisiune de profit: arată cât de bun e un semnal în *ipotezele de umplere* de mai sus; edge-ul net de costuri rămâne de dovedit în Spike E.

---

## 7. Schemă: delta față de `trullas-schema-si-refactor.md`

Detalii în `trullas-schema-v3-delta.sql`.

| Problemă / adaos | Efect |
|---|---|
| `create index on scan_results (… created_at desc)` — coloana `created_at` **nu există** în tabel | scriptul original eșuează la acest rând |
| `v_journal_stats_current_epoch` fără `security_invoker` | în Postgres/Supabase view-urile rulează cu drepturile proprietarului și ocolesc RLS; view-ul și-ar expune datele între utilizatori. Nu filtrează nici epoca activă (nume înșelător) |
| Profit factor fără prag de eșantion | recreează bug-ul „PF 99x" → PF = NULL până la n ≥ 10 |
| `decision_log.trade_id` fără FK | integritate referențială lipsă |
| Lipsesc `signals`, `bot_state`, `bot_events`, `config_changelog` | fără ele nu există shadow learning, kill switch, heartbeat, istoric de modificări |
| Constrângere `CHECK`: `source='bot' AND action='entry'` ⇒ `market_open_confirmed` | baza de date refuză intrările de bot fără confirmarea sesiunii — plasă de siguranță sub gate-ul din cod |
| `strategy_stats` fără CI | adaugă `n_effective`, `sd_r`, `ci90_low/high`, `basis`, `exit_policy` |
| Statistica shadow (§6.5): `signals` păstrează doar faptele; rezultatul e în `signal_outcomes` (semnal × politică de ieșire) și `signal_forward` (fără ieșire) | o singură sursă de adevăr pentru rezultat; `exit_policies` versionate, cu trigger care interzice schimbarea parametrilor după ce există rezultate |
| View-uri de statistică (`v_signal_obs`, `v_signal_stats`, `_monthly`, `v_signal_day`, `v_signal_alpha`, `v_signal_exit_quality`, `v_shadow_vs_executed`), toate `security_invoker` | CI90 pe clustere zilnice, felii (luat / sărit, regim, earnings), cohorte lunare cu `n_open`, alpha față de controale; testate pe PostgreSQL 16 |
| `signals`, `signal_outcomes`, `signal_forward`: RLS doar `select` pentru client | statisticile de calitate nu se pot edita din browser; scrie worker-ul (`service_role`) |
| `market_snapshots`/`indicator_snapshots` au `user_id` deși datele sunt globale | acceptabil pentru un singur utilizator; la multi-user se mută în tabele globale read-only |

---

## 8. Roadmap v3 (backlog unic)

Zilele marcate **[v2]** vin din plan/audit (neverificate); **[nou]** sunt estimările mele (±30%).

### P0 — Încredere și siguranță (Sprint 1, **18 zile**)

| # | Item | Zile | Criteriu de acceptare |
|---|---|---|---|
| 1 | Trust bug pack (bug-urile 1–5 din audit) | 2 [v2] | PF/rapoarte afișate doar la n ≥ 10, altfel „—" + „n=…"; niciun „Protected/Exceptional Asymmetry" cu 0 trade-uri; test univers pe registru (interval de dimensiune fixat la build, validare după bursa de listare, fără sufixe străine); LaTeX randat corect; contorul de module = lungimea registrului. *Bug 6 (butoane Chart) se închide la #4, bug 7 (3 jurnale) la #6 + Supabase.* |
| 2 | Banner „SIMULATED DATA" + „as of" pe fiecare panou + export/import JSON al celor 6 chei | 2 [v2] | Banner global când orice date ≠ live; „as of HH:MM ET (ora locală)"; restore validează versiunea schemei. **Până apare worker-ul (P1), UI spune „ultimul scan: …", nu „24/7".** |
| 3 | `canTrade()`: calendar NYSE + date live + kill switch + pierdere zilnică + plafon sector | 3 [v2: 2 + 1 nou] | Teste cu ceas injectat: sâmbătă, 2026-11-26 (Thanksgiving, închis), 2026-11-27 (program scurt 13:00 ET), premarket/afterhours, zile din decalajul DST de 6h; date `estimated` ⇒ refuz; kill switch ⇒ refuz |
| 4 | Obiect `Levels` unic + router de chart unic (`openChart({symbol, timeframe, levels, source})`) | 3 [v2] | Același simbol/TF → aceleași niveluri în chart, watchlist și ordin (test snapshot) |
| 5 | `scanService` unic + cache TTL; LiveScanner, tab-ul Full Scanner, pre-scan, heatmap îl consumă | 3 [v2] | Test de contract: același simbol are același stage/divergență în toate vederile |
| 6 | Metrici per epocă de capital; Legacy read-only | 2 [v2] | KPI pe epoca activă; CI90 afișat; PF ascuns sub n = 10 |
| 7 | Watchlist zilnică persistată (formă identică cu `watchlist_items`; localStorage până la Supabase) | 3 [v2] | State machine NEW→WATCHING→TRIGGERED→EXPIRED/INVALIDATED, arhivare, dedupe, flag „stale" |

### P1 — Valoare zilnică (**~36 zile**: 25 [v2] + 11 [nou])

| # | Item | Zile |
|---|---|---|
| 8 | Supabase: schema v3 + migrare localStorage (decizia din v2 rămâne) | în cele 25 [v2] |
| 9 | Worker + scheduler în două straturi (§5), heartbeat în `bot_events` | +2 [nou] |
| 10 | **Spike R** (1 zi): forward returns SPY și expectancy pe benzile Regime Score. **Spike E** (2 zile): backtest 5 ani, 4 strategii, cu costuri, față de random-entry și SPY | +3 [nou] |
| 11 | Ecranul TODAY (Regime pe componente, breadth din scan, RRG, calendar de risc) | în cele 25 [v2] |
| 12 | Chart: niveluri complete (stage, AVWAP, S/R, cutie TP/SL, BUY/REVERSAL) + refactor `TrendSpiderSuite` | în cele 25 [v2] |
| 13 | Smart money EDGAR (Form 4, 13F cu lag) | +3 [nou] |
| 14 | Istoric scan + diff zilnic | în cele 25 [v2] |
| 14b | Registru de universuri (`sp500`, `ndx100`, uniune, `universe_members`), selector de univers în Scan Lab și TODAY, filtre de lichiditate | +2 [nou] |
| 14c | **Spike P** (1 zi) + reconciliere pe două surse în Tier 1 (§5) | +1 [nou] |

### P2 — Învățare (**~34 zile**: 25 [v2] + 9 [nou])

| # | Item |
|---|---|
| 15 | `signals` shadow + outcome engine (+4 zile [nou]) |
| 15b | **Statistica semnalelor shadow (§6.5)** (+5 zile [nou]): 0,5 migrare schemă (scrisă și testată) · 2,5 engine (3 politici de ieșire, forward, controale random-entry, cooldown; teste cu gap-uri și SL/TP în aceeași bară) · 1,5 panou Review · 0,5 CI rulant + steag de degradare. Politicile de pornire se calibrează cu curba forward din Spike E (#10). |
| 16 | Learning loop v1 cu pragurile din §6.2; ecranul „Propuneri" în Review |
| 17 | Backtest one-click din watchlist |
| 18 | Poarta paper → live (§6.4), provider oficial de date |

### P3 (după): replay bar-by-bar, aplicație mobilă.

**Total ≈ 88 zile ≈ 18 săptămâni solo** (18 + 36 + 34; v2 corectat: 67). Futures CME (§5) nu e inclus. Cu 2 dezvoltatori pe P0+P1: 54 zile / 10 = ~5,4 săpt. ideal, **~7 cu overhead de coordonare**.

---

## 9. Asumpții riscante și testul cel mai ieftin

| Asumpție | Dacă e falsă | Test | Cost |
|---|---|---|---|
| Strategiile (MACD triple div., Weinstein etc.) au edge **net de costuri** | întreg stratul de autotrading și învățare optimizează zgomot | Spike E; baseline random-entry; rezultatul e plafon optimist (survivorship) | 2 zile |
| Regime Score discriminează | politica de regim e decorativă | Spike R | 1 zi |
| Yahoo suportă Tier 1 + Tier 2 fără blocaje | scanul se rupe în sesiune | o săptămână cu log de erori/rate-limit; provider de rezervă | pasiv |
| Nasdaq Data Link EOD e accesibil și licențiat pentru uz automatizat | reconcilierea pe două surse nu poate porni | Spike P | 1 zi |
| Hostul permite un worker programat | „24/7" rămâne fals | verifică unde rulează aplicația; ia scheduler extern | 0,5 zile |
| Rezultatele shadow ≈ rezultate executate | învățăm din date prea optimiste | după 30 zile: `v_shadow_vs_executed` (gap R mediu per strategie) + slippage real vs. 5 bps asumați | pasiv |
| Time-stop-ul / TP-ul sunt alese pe aceleași date pe care le evaluez | statistica arată un edge de ieșire care nu se repetă | split 70/30 din curba forward; politică înghețată și versionată (trigger în DB); fără schimbare sub n_eff ≥ 100 | 0 (disciplină) |
| Edge-ul semnalului ≠ drift-ul pieței | un semnal „bun" într-o piață în creștere e doar beta | controale random-entry potrivite; alpha pe perechi (`v_signal_alpha`) | inclus în 15b |
| CI90 pe clustere zilnice e prea îngust când ferestrele de deținere se suprapun | încredere falsă în statistici | CI = limită optimistă; blocuri de 5–10 zile ca variantă conservatoare | 0 (P3) |
| Rata de semnale e suficientă pentru praguri | învățarea nu pornește niciodată | măsoară semnale/săpt. în prima lună | pasiv |

---

## 10. Ce NU facem

Chatbot AI (regula din specs) · 6 workspace-uri separate · reglare automată de parametri · boost automat · replay înainte de P3 · aplicație mobilă · import de la brokeri.

## 11. Întrebări deschise

1. Unde rulează aplicația acum (host) și poate programa job-uri externe?
2. Prin ce broker/API se execută opțiunile (și are lanț `live` cu bid/ask)?
3. Ce face exact „standalone Python daemon generator"?
4. Cei $2.000 virtuali sunt capitalul-țintă și pentru live? (Dacă da, regula de mărime minimă va filtra masiv opțiunile single-leg.)
5. „Date Nasdaq" = universul Nasdaq-100 / Nasdaq listat și/sau Nasdaq Data Link ca provider? Planul le acoperă pe ambele; spune-mi dacă ai în vedere altceva (ex. un feed Nasdaq în timp real, TotalView).
6. ~~Capitalul de referință pentru P&L-ul ipotetic al semnalelor (§6.5): 1% din $2.000 = $20 pe semnal (implicit) sau capitalul-țintă live?~~ **Rezolvat (2026-11-12):** nici una, nici alta ca valoare fixă — capital și risc % devin setări reglabile manual din UI (vezi §6.5, nota din 2026-11-12, și `trullas-ai-implementation-prompt.md`).
7. Futures CME (brief atașat, §5): fâșie de context în TODAY în P1 (~4–5 zile), după P2, sau deloc?

## 12. Instrucțiuni pentru agentul de implementare

- Execută în ordinea din §8; un item = un PR; nu începe itemul N+1 până nu trec criteriile lui N.
- Păstrează regulile de aur: engine determinist și pur; UI dark (zinc-900); fără chatbot.
- Niciun calcul de business în componente; orice număr afișat primește as-of, calitate a datelor și n.
- Migrare „strangler": păstrează `TrendSpiderSuite` până la paritate (teste input→output identice), apoi șterge-l.

---

## Anexa A — Componentă existentă → destinație

| Existent | Destinație v3 |
|---|---|
| Dashboard `/` | TODAY |
| LiveScanner (dashboard) | TODAY (watchlist) + consumator `scanService` |
| Tab „S&P 500 Full Scanner" | SCAN LAB |
| Pre-scan pe sectoare | intern în `scanService` (fără UI propriu) |
| Heatmap (`/api/heatmap`), benchmarkuri sector ETF, contoare stage/divergențe | TODAY: Regime (componente) + RRG |
| Watchlist auto-sync GICS (`trullas_watchlists_v1`, `trullas_active_watchlist_id_v1`) | Watchlist zilnică unică; listele manuale devin „pinned" |
| TrendSpiderSuite | CHART |
| Options Bot / TradingWarz / Options Harvesting + Stock Portfolio Manager (`trullas_automated_portfolio_v1`, `rich_sp500_options_portfolio_v1`) | AUTOPILOT (tab-uri Stocks / Options) |
| TradeJournalView (`trullas_trade_journal_v1`) + log backtest | REVIEW |
| `/api/backtest` | SCAN LAB (buton) + REVIEW (rezultate) |
| `/api/cboe-options` | TODAY (Put/Call) + date pentru gate-ul de opțiuni |
| Indicatori Pine custom (`trullas_custom_pine_indicators_v1`) | CHART (panou de indicatori), neschimbat |
| Setări de risc (`trullas_risk_settings_v1`) | `bot_state` / SETTINGS |
| „Standalone Python daemon generator" | de clarificat; înlocuit de worker |

## Anexa B — Tipuri de bază (TypeScript)

```ts
type DataQuality = 'live' | 'cached' | 'estimated';

type Levels = {
  symbol: string; timeframe: '1w' | '1d' | '1h';
  asOf: string; engineVersion: string; dataQuality: DataQuality;
  direction: 'long' | 'short';
  entryZone: { lo: number; hi: number }; trigger: number;
  stop: { price: number; basis: 'structure' | 'atr'; atr14: number };
  targets: { price: number; rMultiple: number }[];
  invalidation: { price: number; rule: string };
  riskPerUnit: number; rr: number; stopTooWide: boolean;     // > 3×ATR
  anchors: { kind: 'earnings' | 'gap' | 'stage_pivot'; ts: string; avwap: number }[];
  stageBounds: { ma30: number; ma150: number };
  sr: { lo: number; hi: number }[];
  markers: { ts: string; kind: 'BUY' | 'REVERSAL'; pivotTs: string; confirmedTs: string }[];
};

type GateResult = {
  allow: boolean; sizeMultiplier: number;
  reasons: { check: string; ok: boolean; detail?: string }[];
};

// Statistica semnalelor shadow (§6.5)
type ExitReason = 'tp' | 'sl' | 'time' | 'trail' | 'structure' | 'invalidation';

type SignalOutcome = {                    // un rând din signal_outcomes (semnal × politică de ieșire)
  signalId: string; exitPolicy: string;   // ex. 'X1_fixed_v1'
  status: 'open' | 'closed' | 'void'; exitReason?: ExitReason;
  entryTs?: string; exitTs?: string; barsHeld?: number;
  rGross?: number; costR?: number; rNet?: number;     // rNet = rGross − costR
  mfeR?: number; maeR?: number;                        // mfeR >= 0 >= maeR
  earningsInWindow?: boolean; voidReason?: string;     // 'data_estimated' | 'data_gap' | 'roll_gap_suspect' | ...
};

type StatCell = {                         // un rând din v_signal_stats (metric × felie)
  n: number; nEff: number;                // nEff = zile distincte de semnal
  meanR: number; ci90: [number, number];  // CI90 pe clustere zilnice (limită optimistă, §6.5)
  winRate: number; profitFactor: number | null;        // null sub n = 10
  mdeR: number; sampleOk: boolean;                     // nEff >= 30
};
```
