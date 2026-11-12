-- =====================================================================
-- TRULLAS — Schema v3 DELTA
-- Aplică PESTE trullas-schema-si-refactor.md (Partea 1). Postgres / Supabase.
-- Valorile implicite din bot_state sunt PUNCTE DE PORNIRE, de setat de utilizator.
-- Testat pe PostgreSQL 16 (tests/shadow-stats/run.sh): 202 verificări numerice ale view-urilor față
-- de un calcul independent, 14 teste negative de constrângeri, RLS. Date sintetice => verifică
-- aritmetica și integritatea, NU edge-ul vreunei strategii.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. FIX: indexul din original referă scan_results.created_at, care nu există.
--    Dacă scriptul original a eșuat la acel rând, rulează blocul de mai jos.
-- ---------------------------------------------------------------------
alter table scan_results add column if not exists created_at timestamptz not null default now();
create index if not exists scan_results_user_symbol_created_idx
  on scan_results (user_id, symbol, created_at desc);

-- ---------------------------------------------------------------------
-- 2. FIX: view-ul de statistici pe epocă.
--    - security_invoker = true: RLS-ul din `trades` se aplică și prin view
--      (altfel view-ul rulează cu drepturile proprietarului și ocolește RLS).
--    - profit factor NULL până la 10 trade-uri închise (anti "PF 99x la n=3").
--    - două view-uri: toate epocile / doar epoca activă (numele vechi era înșelător).
-- ---------------------------------------------------------------------
drop view if exists v_journal_stats_current_epoch;

create view v_journal_stats_by_epoch with (security_invoker = true) as
select
  t.epoch_id,
  count(*) filter (where t.status = 'closed')                       as closed_trades,
  sum(t.pnl) filter (where t.status = 'closed')                     as net_pnl,
  avg(t.r_multiple) filter (where t.status = 'closed')              as avg_r,
  stddev_samp(t.r_multiple) filter (where t.status = 'closed')      as sd_r,
  (count(*) filter (where t.status = 'closed')) >= 10               as sample_ok,
  case
    when (count(*) filter (where t.status = 'closed')) >= 10 then
      sum(t.pnl) filter (where t.status = 'closed' and t.pnl > 0)
      / nullif(abs(sum(t.pnl) filter (where t.status = 'closed' and t.pnl < 0)), 0)
  end                                                               as profit_factor
from trades t
group by t.epoch_id;

create view v_journal_stats_active_epoch with (security_invoker = true) as
select s.*
from v_journal_stats_by_epoch s
join journal_epochs e on e.id = s.epoch_id
where e.ended_at is null and not e.archived;

-- ---------------------------------------------------------------------
-- 3. decision_log: integritate + trasabilitate
-- ---------------------------------------------------------------------
alter table decision_log
  add column if not exists engine_version text,
  add column if not exists guard_result jsonb;            -- GateResult complet la momentul deciziei

-- FK lipsă (circular cu trades.bot_decision_id => deferrable). Rulează o singură dată.
alter table decision_log
  add constraint decision_log_trade_fk
  foreign key (trade_id) references trades (id) deferrable initially deferred;

-- Plasă de siguranță sub gate-ul din cod: nicio intrare de bot fără sesiune confirmată.
-- (Pe o tabelă cu date vechi, adaugă "not valid" și curăță rândurile istorice.)
alter table decision_log
  add constraint decision_log_bot_entry_requires_open
  check (not (source = 'bot' and action = 'entry') or market_open_confirmed);

-- ---------------------------------------------------------------------
-- 4. signals: jurnal shadow — unitatea de învățare (nu doar trade-urile executate)
--    Aici sunt FAPTELE semnalului (nu se rescriu). REZULTATUL (ieșire, R, costuri)
--    trăiește în signal_outcomes / signal_forward (secțiunea 10): o singură sursă de adevăr.
--    kind = 'control': intrare aleatoare potrivită (același simbol, aceeași geometrie
--    de stop în ATR), folosită ca să separăm edge-ul semnalului de drift-ul pieței.
-- ---------------------------------------------------------------------
create table if not exists signals (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users,
  created_at            timestamptz not null default now(),
  engine_version        text not null,
  strategy_id           uuid not null references strategies,
  kind                  text not null default 'signal' check (kind in ('signal','control')),
  control_of            uuid references signals (id),     -- doar pentru kind = 'control'
  symbol                text not null,
  timeframe             text not null,
  direction             text not null check (direction in ('long','short')),
  pivot_bar_ts          timestamptz not null,   -- unde se desenează markerul
  confirmed_bar_ts      timestamptz not null,   -- prima bară la care semnalul era CUNOSCUT (anti look-ahead)
  data_quality          text not null check (data_quality in ('live','cached','estimated')),
  market_snapshot_id    uuid references market_snapshots,
  indicator_snapshot_id uuid references indicator_snapshots,
  regime_score          smallint,               -- Regime Score la confirmed_bar_ts
  sector                text,
  atr14                 numeric,
  score                 int,
  reasons               jsonb not null default '[]',
  entry_price           numeric not null,       -- ipotetic: deschiderea barei după confirmed_bar_ts
  stop_loss             numeric not null,
  take_profit           numeric not null,
  taken                 boolean not null default false,   -- a devenit decizie/tranzacție
  skip_reason           text,                             -- de ce NU a fost luat
  decision_id           uuid references decision_log,
  constraint signals_confirmed_after_pivot check (confirmed_bar_ts >= pivot_bar_ts),
  constraint signals_stop_side check (
    (direction = 'long'  and stop_loss < entry_price) or
    (direction = 'short' and stop_loss > entry_price)
  ),
  constraint signals_id_user_uk unique (id, user_id),
  constraint signals_control_chk check (
    (kind = 'signal'  and control_of is null) or
    (kind = 'control' and control_of is not null)
  ),
  constraint signals_control_not_taken check (kind = 'signal' or not taken),
  constraint signals_skip_reason_chk check (
    skip_reason is null or
    skip_reason in ('regime','guard','size','not_selected','strategy_paused','data_quality')
  ),
  constraint signals_taken_no_skip check (not taken or skip_reason is null)
);
-- idempotent la re-scanare: același semnal nu se înregistrează de două ori
create unique index if not exists signals_dedupe_idx
  on signals (user_id, strategy_id, symbol, timeframe, direction, confirmed_bar_ts)
  where kind = 'signal';
create index if not exists signals_strategy_confirmed_idx
  on signals (user_id, strategy_id, confirmed_bar_ts desc);
create index if not exists signals_control_of_idx on signals (control_of) where control_of is not null;

-- ---------------------------------------------------------------------
-- 5. Starea botului, evenimente (heartbeat, blocări), istoric de configurare
-- ---------------------------------------------------------------------
create table if not exists bot_state (
  user_id                 uuid primary key references auth.users,
  mode                    text not null default 'paper' check (mode in ('paper','live')),
  state                   text not null default 'paused' check (state in ('armed','paused','killed')),  -- fail-safe: pornește în pauză
  daily_loss_limit_pct    numeric not null default 2.0,
  max_risk_per_trade_pct  numeric not null default 1.0,   -- editabil manual din SETTINGS
  sim_capital_usd         numeric not null default 2000,  -- „capital alocat (simulare)”, editabil manual din SETTINGS
                                                            -- folosit DOAR pt. conversia R -> $ (sizing watchlist, §6.5 P&L ipotetic);
                                                            -- nu intră niciodată în view-urile de statistică R (acelea rămân în R, capital-independente)
  max_sector_exposure_pct numeric not null default 30.0,
  last_heartbeat          timestamptz,
  updated_at              timestamptz not null default now()
);

create table if not exists bot_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in
             ('heartbeat','guard_block','kill_switch','circuit_breaker','mode_change','error')),
  symbol     text,
  check_name text,                              -- ex. 'market_open','data_quality','size_min'
  detail     jsonb not null default '{}'
);
create index if not exists bot_events_user_created_idx on bot_events (user_id, created_at desc);
create index if not exists bot_events_user_kind_idx    on bot_events (user_id, kind, created_at desc);

create table if not exists config_changelog (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users,
  created_at timestamptz not null default now(),
  actor      text not null check (actor in ('user','learning_loop','system')),
  target     text not null,                     -- 'strategies.state','strategies.params','bot_state.*'
  target_id  uuid,
  old_value  jsonb,
  new_value  jsonb,
  reason     text not null,
  sample_n   int,
  ci_low     numeric,
  ci_high    numeric
);
create index if not exists config_changelog_user_created_idx on config_changelog (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. strategy_stats: interval de încredere și baza calculului
--    regime_bucket primește și valoarea 'all' (folosită până la n >= 100 / strategie)
-- ---------------------------------------------------------------------
alter table strategy_stats
  add column if not exists n_signals    int,
  add column if not exists n_effective  int,       -- zile distincte de semnal (semnalele din aceeași zi sunt corelate)
  add column if not exists sd_r         numeric,
  add column if not exists ci90_low     numeric,
  add column if not exists ci90_high    numeric,
  add column if not exists basis        text not null default 'executed'
                                        check (basis in ('executed','shadow'));

-- ---------------------------------------------------------------------
-- 7. watchlist_items: obiectul Levels unic + context
-- ---------------------------------------------------------------------
alter table watchlist_items
  add column if not exists levels         jsonb,    -- obiectul Levels (vezi Master Plan, Anexa B)
  add column if not exists data_quality   text check (data_quality in ('live','cached','estimated')),
  add column if not exists smart_money    jsonb,    -- {form4_cluster, f13_net_qoq, f13_lag_days}
  add column if not exists earnings_date  date,
  add column if not exists engine_version text;

-- ---------------------------------------------------------------------
-- 8. RLS pe tabelele noi ((select auth.uid()) = evaluare o singură dată / interogare)
--    signals / signal_outcomes / signal_forward: browserul poate DOAR citi.
--    Scrierea o face worker-ul cu service_role (care ocolește RLS) — statisticile
--    de calitate nu pot fi editate din client.
-- ---------------------------------------------------------------------
alter table signals          enable row level security;
alter table bot_state        enable row level security;
alter table bot_events       enable row level security;
alter table config_changelog enable row level security;

create policy signals_read on signals
  for select using ((select auth.uid()) = user_id);
create policy bot_state_owner on bot_state
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy bot_events_owner on bot_events
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy config_changelog_owner on config_changelog
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 9. Universuri (S&P 500, Nasdaq-100, ...) + proveniența datelor
--    universe_members = date de referință GLOBALE (fără user_id): citire pentru
--    utilizatorii autentificați, scriere doar din worker (service_role).
-- ---------------------------------------------------------------------
create table if not exists universe_members (
  universe         text not null check (universe in ('sp500','ndx100','nasdaq_liquid')),
  symbol           text not null,
  listing_exchange text,                      -- 'NASDAQ','NYSE',... (validarea se face pe bursa de listare)
  sector           text,
  sector_source    text,                      -- 'gics_sp','provider',...
  valid_from       date not null,
  valid_to         date,                      -- null = membru curent (point-in-time de la prima încărcare)
  primary key (universe, symbol, valid_from),
  constraint universe_members_period_chk check (valid_to is null or valid_to > valid_from)
);
create index if not exists universe_members_current_idx
  on universe_members (universe, symbol) where valid_to is null;

alter table universe_members enable row level security;
create policy universe_members_read on universe_members
  for select to authenticated using (true);

-- scan_runs.universe era text liber; 'sp500_ndx100' = uniunea dedupată (calculată, nu stocată în universe_members)
alter table scan_runs
  add constraint scan_runs_universe_chk
  check (universe in ('sp500','ndx100','sp500_ndx100','nasdaq_liquid'));

-- Proveniență + reconciliere pe două surse (ex. Yahoo vs Nasdaq Data Link EOD)
alter table indicator_snapshots
  add column if not exists data_source    text,      -- 'yahoo','ndl_eod','nasdaq_basic',...
  add column if not exists recon_diff_pct numeric;   -- |close_A - close_B| / close_A * 100; peste prag => data_quality = 'estimated'

-- Notă: comutarea bot_state.mode în 'live' trebuie să treacă printr-un RPC/Edge Function
-- care verifică poarta paper -> live (Master Plan §6.4), nu printr-un UPDATE direct din client.

-- =====================================================================
-- 10. STATISTICA SEMNALELOR SHADOW (separată de jurnalul de trade-uri)
--     Patru întrebări, patru surse — nu se amestecă:
--       Q1  Semnalul are edge?              -> signal_forward  (R la h bare, FĂRĂ ieșire)
--       Q2  Ce aș fi câștigat cu ieșirea?   -> signal_outcomes (SL / TP / time-stop / trailing / structură, net de costuri)
--       Q3  Ieșirea e bună?                 -> mfe_r, capture, give-back (v_signal_exit_quality)
--       Q4  Mai bun decât întâmplarea?      -> controale random-entry potrivite (v_signal_alpha)
--     Convenții: R = (preț − intrare) × direcție / |intrare − stop|; mae_r <= 0 <= mfe_r;
--     „h bare" = închiderea barei a h-a, bara de intrare = bara 1; data semnalului = ziua NY a
--     confirmed_bar_ts; semnalele pe date 'estimated' nu intră NICIODATĂ în statistici.
-- =====================================================================

-- 10.1 Cuantila t (unilateral 5% = CI90 bilateral), conservatoare pentru df > 30
create or replace function t95(df int) returns numeric
language sql immutable as $$
  select case
    when df is null or df < 1 then null
    when df <= 30 then (array[6.314,2.920,2.353,2.132,2.015,1.943,1.895,1.860,1.833,1.812,
                              1.796,1.782,1.771,1.761,1.753,1.746,1.740,1.734,1.729,1.725,
                              1.721,1.717,1.714,1.711,1.708,1.706,1.703,1.701,1.699,1.697])[df]
    when df <= 40  then 1.697
    when df <= 60  then 1.684
    when df <= 120 then 1.671
    else 1.658
  end::numeric
$$;

-- 10.2 Media, eroarea standard pe clustere (o zi de semnal = un cluster) și CI90.
--      SE = sqrt( G/(G-1) · Σ_g (Σ_{i∈g}(x_i − μ))² ) / n ;  CI90 = μ ± t95(G−1)·SE
create or replace function cluster_stats(vals numeric[], days date[])
returns table (n int, n_eff int, mean_r numeric, se numeric, ci90_low numeric, ci90_high numeric)
language sql immutable as $$
  with x as (
    select t.v, t.d, avg(t.v) over () as mu from unnest(vals, days) as t(v, d)
  ),
  g as (
    select d, count(*) as n_i, sum(v - mu) as dev from x group by d
  ),
  c as (
    select count(*)::int as ne, sum(n_i)::int as nn, sum(dev * dev) as ss from g
  ),
  m as (select avg(v) as mean_v from x),
  q as (
    select c.nn, c.ne, m.mean_v,
           case when c.ne >= 2 then sqrt(c.ne::numeric / (c.ne - 1) * c.ss) / c.nn end as se_v
    from c cross join m
  )
  select nn, ne, mean_v, se_v,
         mean_v - t95(ne - 1) * se_v,
         mean_v + t95(ne - 1) * se_v
  from q
$$;

-- 10.3 Politici de ieșire (versionate; globale, citire pentru utilizatori)
create table if not exists exit_policies (
  id          text primary key,                 -- 'X1_fixed_v1', 'X2_trail_v1', ...
  description text not null,
  is_primary  boolean not null default false,   -- politica pe care o folosește botul = cifrele de titlu
  params      jsonb not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists exit_policies_one_primary on exit_policies ((true)) where is_primary;

alter table exit_policies enable row level security;
create policy exit_policies_read on exit_policies for select to authenticated using (true);

-- 10.4 Rezultat per (semnal × politică de ieșire)
create table if not exists signal_outcomes (
  signal_id          uuid not null,
  user_id            uuid not null,
  exit_policy        text not null references exit_policies,
  status             text not null default 'open' check (status in ('open','closed','void')),
  exit_reason        text check (exit_reason in ('tp','sl','time','trail','structure','invalidation')),
  entry_ts           timestamptz,               -- deschiderea barei de după confirmed_bar_ts
  entry_price        numeric,                   -- preț efectiv (poate diferi de signals.entry_price: gap)
  exit_ts            timestamptz,
  exit_price         numeric,
  bars_held          int,
  r_gross            numeric,
  cost_r             numeric,                   -- comision + slippage dus-întors, exprimate în R
  r_net              numeric generated always as (r_gross - cost_r) stored,
  mfe_r              numeric check (mfe_r is null or mfe_r >= 0),
  mae_r              numeric check (mae_r is null or mae_r <= 0),
  earnings_in_window boolean,                   -- earnings între intrare și ieșire (tranzacția ar fi ținut peste raportare)
  void_reason        text,                      -- 'data_estimated','data_gap','delisted','roll_gap_suspect'
  evaluated_through  timestamptz,               -- ultima bară procesată (reluare idempotentă)
  updated_at         timestamptz not null default now(),
  primary key (signal_id, exit_policy),
  foreign key (signal_id, user_id) references signals (id, user_id) on delete cascade,
  constraint so_closed_complete check (
    status <> 'closed' or (
      exit_reason is not null and entry_ts is not null and entry_price is not null and
      exit_ts is not null and exit_price is not null and bars_held is not null and
      r_gross is not null and cost_r is not null and mfe_r is not null and mae_r is not null)
  ),
  constraint so_void_reason check (status <> 'void' or void_reason is not null)
);
create index if not exists so_user_policy_status_idx on signal_outcomes (user_id, exit_policy, status);
create index if not exists so_open_idx on signal_outcomes (user_id, exit_policy) where status = 'open';

alter table signal_outcomes enable row level security;
create policy signal_outcomes_read on signal_outcomes
  for select using ((select auth.uid()) = user_id);

-- Parametrii unei politici nu se schimbă după ce există rezultate calculate cu ea
-- (altfel am amesteca date calculate cu reguli diferite și am putea „regla" ieșirea pe aceleași date).
-- Schimbarea = politică nouă (X1_fixed_v2), aplicată doar semnalelor de la data introducerii.
create or replace function exit_policies_params_guard() returns trigger
language plpgsql as $$
begin
  if new.params is distinct from old.params and
     exists (select 1 from signal_outcomes where exit_policy = old.id) then
    raise exception 'exit policy % has outcomes; create a new version instead of editing params', old.id;
  end if;
  return new;
end $$;
create trigger exit_policies_params_guard_trg
  before update on exit_policies for each row execute function exit_policies_params_guard();

-- 10.5 Traiectoria înainte, FĂRĂ ieșire: măsoară calitatea semnalului independent de regulile de ieșire
create table if not exists signal_forward (
  signal_id   uuid primary key,
  user_id     uuid not null,
  fwd_r       jsonb not null default '{}',      -- {"1":0.2,"3":0.5,"5":0.4,"10":0.7,"20":0.9}: R brut la h bare (stop-ul semnalului ignorat)
  mfe20_r     numeric check (mfe20_r is null or mfe20_r >= 0),
  mae20_r     numeric check (mae20_r is null or mae20_r <= 0),
  complete    boolean not null default false,   -- toate orizonturile calculate
  updated_at  timestamptz not null default now(),
  foreign key (signal_id, user_id) references signals (id, user_id) on delete cascade
);
alter table signal_forward enable row level security;
create policy signal_forward_read on signal_forward
  for select using ((select auth.uid()) = user_id);

-- strategy_stats: pe ce politică de ieșire s-a calculat (basis = 'shadow')
alter table strategy_stats
  add column if not exists exit_policy text references exit_policies;

-- 10.6 Politici de pornire (VALORI DE PORNIRE, nu adevăruri: time-stop-ul se alege din curba
--      forward pe primele 70% din date, se verifică pe ultimele 30%, apoi politica se versionează)
insert into exit_policies (id, description, is_primary, params) values
 ('X1_fixed_v1',
  'SL structural/ATR + TP1 din Levels + time-stop. Ieșire la deschiderea barei următoare.',
  true,
  '{"stop":"signal","tp":"levels_tp1","time_stop_bars":{"1w":8,"1d":15,"1h":20},
    "fills":{"entry":"next_open","stop_gap":"open","tp":"limit","same_bar":"sl_first","time_exit":"next_open"},
    "cost":{"slippage_bps_per_side":5,"commission_per_share":0}}'::jsonb),
 ('X2_trail_v1',
  'SL inițial, la +1R mută stop-ul la breakeven, apoi trailing 2×ATR; fără TP fix; time-stop mai lung.',
  false,
  '{"stop":"signal","tp":null,"trail":{"activate_r":1.0,"to_breakeven":true,"atr_mult":2.0},
    "time_stop_bars":{"1w":12,"1d":25,"1h":30},
    "fills":{"entry":"next_open","stop_gap":"open","same_bar":"sl_first","time_exit":"next_open"},
    "cost":{"slippage_bps_per_side":5,"commission_per_share":0}}'::jsonb),
 ('X3_structure_v1',
  'SL inițial; ieșire la REVERSAL opus, închidere sub MA30 (stage) sau invalidare; fără TP; time-stop lung.',
  false,
  '{"stop":"signal","tp":null,"exit_on":["marker_reversal","close_below_ma30","invalidation"],
    "time_stop_bars":{"1w":12,"1d":25,"1h":30},
    "fills":{"entry":"next_open","stop_gap":"open","same_bar":"sl_first","time_exit":"next_open"},
    "cost":{"slippage_bps_per_side":5,"commission_per_share":0}}'::jsonb)
on conflict (id) do nothing;

-- 10.7 Observații: orice măsurătoare (R net per politică, R forward per orizont), tăiată în felii.
--      O felie = 'bucket'. Un singur view de statistici (v_signal_stats) le acoperă pe toate.
--      Bucket-uri: all · taken · skip:<motiv> · regime:<bandă> · earn:in | earn:out
create view v_signal_obs with (security_invoker = true) as
with base as (
  select s.user_id, s.strategy_id, s.id as signal_id, s.kind,
         case when s.kind = 'control' then s.control_of else s.id end as pair_id,
         s.taken, s.skip_reason, s.regime_score,
         (s.confirmed_bar_ts at time zone 'America/New_York')::date as signal_day,
         'net:' || o.exit_policy as metric, o.r_net as value, o.earnings_in_window as earn
  from signals s
  join signal_outcomes o on o.signal_id = s.id and o.user_id = s.user_id
  where o.status = 'closed' and o.r_net is not null and s.data_quality <> 'estimated'
  union all
  select s.user_id, s.strategy_id, s.id, s.kind,
         case when s.kind = 'control' then s.control_of else s.id end,
         s.taken, s.skip_reason, s.regime_score,
         (s.confirmed_bar_ts at time zone 'America/New_York')::date,
         'fwd:' || lpad(h.key, 3, '0'), h.value::numeric, null::boolean
  from signals s
  join signal_forward f on f.signal_id = s.id and f.user_id = s.user_id
  cross join lateral jsonb_each_text(f.fwd_r) as h(key, value)
  where s.data_quality <> 'estimated'
),
slices as (
  select *, 'all'::text as bucket from base
  union all
  select *, case when taken then 'taken' else 'skip:' || coalesce(skip_reason, 'unknown') end
  from base where kind = 'signal'
  union all
  select *, 'regime:' || case
              when regime_score is null then 'unknown'
              when regime_score < 30 then 'risk_off'
              when regime_score < 60 then 'neutral'
              when regime_score < 85 then 'risk_on'
              else 'extended' end
  from base where kind = 'signal'
  union all
  select *, case when earn then 'earn:in' else 'earn:out' end
  from base where kind = 'signal' and earn is not null
)
select user_id, strategy_id, signal_id, pair_id, kind, signal_day,
       (signal_day - (extract(day from signal_day)::int - 1)) as signal_month,
       metric, value, bucket
from slices;

-- 10.8 Statistici per (strategie × metrică × felie): n, n_eff, medie, CI90 pe clustere, MDE, PF (NULL sub n=10)
create view v_signal_stats with (security_invoker = true) as
select g.user_id, g.strategy_id, g.kind, g.metric, g.bucket,
       cs.n, cs.n_eff, cs.mean_r, cs.se, cs.ci90_low, cs.ci90_high,
       g.median_r, g.sd_r, g.win_rate, g.avg_win_r, g.avg_loss_r,
       case when cs.n >= 10 then g.gross_win / nullif(g.gross_loss, 0) end as profit_factor,
       2.486 * g.sd_r / nullif(sqrt(cs.n_eff), 0)                          as mde_r,
       cs.n_eff >= 30                                                       as sample_ok
from (
  select user_id, strategy_id, kind, metric, bucket,
         array_agg(value order by signal_day, signal_id)       as vals,
         array_agg(signal_day order by signal_day, signal_id)  as days,
         stddev_samp(value)                                    as sd_r,
         percentile_cont(0.5) within group (order by value)    as median_r,
         avg((value > 0)::int)                                 as win_rate,
         avg(value) filter (where value > 0)                   as avg_win_r,
         avg(value) filter (where value <= 0)                  as avg_loss_r,
         sum(value) filter (where value > 0)                   as gross_win,
         abs(sum(value) filter (where value < 0))             as gross_loss
  from v_signal_obs
  group by user_id, strategy_id, kind, metric, bucket
) g
cross join lateral cluster_stats(g.vals, g.days) cs;

-- 10.9 Calitatea în timp: cohorte lunare (după data CONFIRMĂRII, nu a ieșirii) + câte sunt încă deschise
--       Full join: luna cu semnale încă deschise apare chiar dacă nu are niciunul închis (n = 0),
--       ca să se vadă că cohorta recentă e nematurată (efect de maturitate).
create view v_signal_stats_monthly with (security_invoker = true) as
select coalesce(g.user_id, op.user_id)         as user_id,
       coalesce(g.strategy_id, op.strategy_id) as strategy_id,
       coalesce(g.metric, op.metric)           as metric,
       coalesce(g.signal_month, op.signal_month) as signal_month,
       coalesce(cs.n, 0) as n, cs.n_eff, cs.mean_r, cs.ci90_low, cs.ci90_high, g.win_rate,
       coalesce(op.n_open, 0) as n_open
from (
  select user_id, strategy_id, metric, signal_month,
         array_agg(value order by signal_day, signal_id)      as vals,
         array_agg(signal_day order by signal_day, signal_id) as days,
         avg((value > 0)::int)                                as win_rate
  from v_signal_obs
  where kind = 'signal' and bucket = 'all'
  group by user_id, strategy_id, metric, signal_month
) g
cross join lateral cluster_stats(g.vals, g.days) cs
full join (
  select s.user_id, s.strategy_id, 'net:' || o.exit_policy as metric,
         ((s.confirmed_bar_ts at time zone 'America/New_York')::date
           - (extract(day from (s.confirmed_bar_ts at time zone 'America/New_York')::date)::int - 1)) as signal_month,
         count(*) as n_open
  from signals s
  join signal_outcomes o on o.signal_id = s.id and o.user_id = s.user_id
  where o.status = 'open' and s.kind = 'signal' and s.data_quality <> 'estimated'
  group by 1, 2, 3, 4
) op on op.user_id = g.user_id and op.strategy_id = g.strategy_id
    and op.metric = g.metric and op.signal_month = g.signal_month;

-- 10.10 Seria zilnică: baza pentru fereastra rulantă (60 de zile cu semnale), R cumulat și drift.
--       CI-ul rulant și steagul de degradare se calculează în engine (TS) din aceste rânduri.
--       R cumulat = suma R cu risc fix per semnal; NU e un cont (semnalele simultane împart capitalul).
create view v_signal_day with (security_invoker = true) as
select user_id, strategy_id, metric, signal_day,
       count(*)                                                                as n,
       sum(value)                                                              as sum_r,
       sum(sum(value)) over (partition by user_id, strategy_id, metric order by signal_day) as cum_r
from v_signal_obs
where kind = 'signal' and bucket = 'all' and metric like 'net:%'
group by user_id, strategy_id, metric, signal_day;

-- 10.11 Alpha față de întâmplare: semnal − control potrivit (pereche), CI90 pe clustere
create view v_signal_alpha with (security_invoker = true) as
select g.user_id, g.strategy_id, g.metric,
       cs.n as n_pairs, cs.n_eff, g.signal_mean_r, g.control_mean_r,
       cs.mean_r as alpha_r, cs.ci90_low, cs.ci90_high
from (
  select sg.user_id, sg.strategy_id, sg.metric,
         array_agg(sg.value - ct.value order by sg.signal_day, sg.signal_id) as vals,
         array_agg(sg.signal_day order by sg.signal_day, sg.signal_id)       as days,
         avg(sg.value) as signal_mean_r, avg(ct.value) as control_mean_r
  from v_signal_obs sg
  join v_signal_obs ct on ct.user_id = sg.user_id and ct.pair_id = sg.signal_id
                      and ct.kind = 'control' and ct.metric = sg.metric and ct.bucket = 'all'
  where sg.kind = 'signal' and sg.bucket = 'all'
  group by sg.user_id, sg.strategy_id, sg.metric
) g
cross join lateral cluster_stats(g.vals, g.days) cs;

-- 10.12 Calitatea ieșirii: mix de ieșiri, durată, MFE/MAE, give-back, capture (Σ R realizat / Σ MFE)
create view v_signal_exit_quality with (security_invoker = true) as
select s.user_id, s.strategy_id, o.exit_policy,
       count(*) filter (where o.status = 'open')                                  as n_open,
       count(*) filter (where o.status = 'void')                                  as n_void,
       count(*) filter (where o.status = 'closed')                                as n_closed,
       avg(o.bars_held)             filter (where o.status = 'closed')            as avg_bars_held,
       avg(o.mfe_r)                 filter (where o.status = 'closed')            as avg_mfe_r,
       avg(o.mae_r)                 filter (where o.status = 'closed')            as avg_mae_r,
       avg(o.cost_r)                filter (where o.status = 'closed')            as avg_cost_r,
       avg(o.mfe_r - o.r_gross)     filter (where o.status = 'closed')            as avg_giveback_r,
       sum(o.r_gross) filter (where o.status = 'closed' and o.mfe_r > 0)
         / nullif(sum(o.mfe_r) filter (where o.status = 'closed' and o.mfe_r > 0), 0) as capture_ratio,
       avg((o.exit_reason = 'tp')::int)        filter (where o.status = 'closed') as pct_tp,
       avg((o.exit_reason = 'sl')::int)        filter (where o.status = 'closed') as pct_sl,
       avg((o.exit_reason = 'time')::int)      filter (where o.status = 'closed') as pct_time,
       avg((o.exit_reason = 'trail')::int)     filter (where o.status = 'closed') as pct_trail,
       avg((o.exit_reason = 'structure')::int) filter (where o.status = 'closed') as pct_structure,
       avg((o.exit_reason = 'invalidation')::int) filter (where o.status = 'closed') as pct_invalidation
from signals s
join signal_outcomes o on o.signal_id = s.id and o.user_id = s.user_id
where s.kind = 'signal' and s.data_quality <> 'estimated'
group by s.user_id, s.strategy_id, o.exit_policy;

-- 10.13 Calibrarea modelului shadow: același semnal, luat de bot — R shadow (politica primară) vs R executat
create view v_shadow_vs_executed with (security_invoker = true) as
select s.user_id, s.strategy_id,
       count(*)                          as n_pairs,
       avg(o.r_net)                      as shadow_r,
       avg(t.r_multiple)                 as executed_r,
       avg(t.r_multiple - o.r_net)       as gap_r        -- negativ = execuția reală e mai proastă decât modelul
from signals s
join signal_outcomes o on o.signal_id = s.id and o.user_id = s.user_id and o.status = 'closed'
join exit_policies p   on p.id = o.exit_policy and p.is_primary
join decision_log d    on d.id = s.decision_id
join trades t          on t.id = d.trade_id and t.status = 'closed'
where s.taken and s.kind = 'signal'
group by s.user_id, s.strategy_id;
