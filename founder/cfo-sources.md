# Cost & Volume Sources (`founder/numbers.json`)

Every number below is tagged as a **published vendor rate** (with URL checked on `2026-11-17`) or an **explicit estimate** to replace with a direct founder quote before spending.

---

## 1. Price & Volume Assumptions
- **Price (`$39.00/subscriber-month`)**: Midpoint between Van Westendorp IPP (`$34.07`) and PME (`$49.02`) in `founder/pricing-curve.md`, positioned just below Finviz Elite (`$39.50/mo`, https://finviz.com/elite.ashx) and LuxAlgo Premium (`$39.99/mo`, https://www.luxalgo.com/pricing/) and well below TrendSpider Elite (`$89.00/mo`, https://trendspider.com/pricing/).
- **Ramp (`[1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5]` billing renewals per day across 30 days/month = 30 to 150 active paying subscribers by Month 12)**: Sanity-checked against the consumer panel (`founder/panel/results.md`), where Month-1 cold conversion was 15% on Pitch v1 (upgraded in `founder-offer` to an expected higher rate after resolving price & proof friction). Assumes ~300–450 targeted landing-page/demo visitors/month converting at a conservative 7%–10% real-world rate (lower than LLM simulated upper bounds) net of ~12% monthly SaaS churn as cumulative base grows to 150 active subscribers. **[Estimate — replace after Month-1 waitlist/pre-sell test]**
- **Capacity (`33/day` = 990 active subscribers/month)**: Practical ceiling on the Tiingo Startup Redistribution tier before enterprise API scaling or dedicated multi-worker sharding is required. **[Estimate]**

## 2. Variable Costs (Per Subscriber-Month)
- **Stripe card processing (`$1.43`)**: Published US domestic online card rate of `2.9% + $0.30` (`0.029 × $39.00 + $0.30 = $1.431`) from Stripe Pricing ([stripe.com/pricing](https://stripe.com/pricing)). International cards carry an extra 1.5% surcharge (`+$0.59`). **[Published rate]**
- **Alert delivery & DB MAU metering (`$0.20`)**: Supabase Pro includes 100,000 MAUs with `$0.00325/MAU` beyond cap ([supabase.com/pricing](https://supabase.com/pricing)); Telegram Bot API is `$0`; transactional email/webhook egress reserve estimated at `$0.20/sub-mo`. **[Estimate grounded in vendor pricing]**
- **30-day guarantee / refund reserve (`$1.56`)**: Estimated `4%` monthly blended refund/chargeback allowance (`0.04 × $39.00 = $1.56`) covering the 30-day guarantee modeled in `founder-offer`. **[Estimate — confirm claim rate in first 60 days]**

## 3. Fixed Monthly Costs (`$638.00/month`)
- **Tiingo Commercial Startup Redistribution API (`$250.00/mo`)**: Published startup external-display/redistribution package starting around `$250/mo` ([tiingo.com/about/pricing](https://www.tiingo.com/about/pricing)), replacing unofficial Yahoo Finance endpoints for commercial compliance. Alternative checked: Twelve Data Venture at `$499/mo` ([twelvedata.com/pricing](https://twelvedata.com/pricing)) and Polygon.io / Massive Stocks Business at `$2,499/mo` ([massive.com/pricing](https://massive.com/pricing)). **[Published vendor benchmark; confirm exact Tiingo startup contract via sales quote]**
- **Supabase Pro (`$25.00/mo`)**: Published Pro tier for PostgreSQL, Auth, RLS, and pg_cron scheduling ([supabase.com/pricing](https://supabase.com/pricing)). **[Published rate]**
- **Fly.io worker & web app hosting (`$18.00/mo`)**: Published `shared-cpu-1x` 1GB RAM VM (`$6.70/mo`) + backup/worker headroom + persistent volume (`$0.15/GB`) + dedicated IPv4 (`$2.00/mo`) from [fly.io/pricing](https://fly.io/pricing). **[Published rate]**
- **Email, DNS & monitoring (`$20.00/mo`)**: Domain privacy/DNS, transactional email (Resend), and uptime alerting. **[Estimate]**
- **Content & creator marketing (`$250.00/mo`)**: Recurring newsletter/YouTube creator placements and search test budget once pre-sell passes. **[Estimate]**
- **Bookkeeping & compliance reserve (`$75.00/mo`)**: Accounting software/tax filing reserve; **excludes founder salary** (assumes solo technical founder draws profit after break-even). **[Estimate — have an accountant verify payroll & tax]**

## 4. Startup Spend (`$1,700.00` One-Off)
- **LLC registration & Terms/Non-Advisory legal review (`$850.00`)**: Entity filing + terms/disclaimer review by counsel. **[Estimate — get local quote]**
- **Domain, `Spike E` / `Spike R` validation & landing setup (`$350.00`)**: Domain registration + one-off point-in-time historical verification data (e.g., Databento metered GB historical pull, [databento.com/pricing](https://databento.com/pricing)). **[Estimate]**
- **Initial pre-sell landing-page ad test (`$500.00`)**: Targeted validation spend per `founder-launch`. **[Estimate]**
