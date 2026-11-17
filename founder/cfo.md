# Unit economics: Trullàs Divergence 24/7 Scanner (Swing Pro SaaS)

## The CFO's note
- **The margin**: At **$39.00/mo**, each subscriber-month leaves **$35.81** (`92%` contribution margin) after Stripe card fees (`$1.43`), alert/MAU metering (`$0.20`), and a 4% refund reserve (`$1.56`). At planned steady volume (`5/day` = `150` active subscribers/month across 30 days), the net operating margin is **81%** after all **$638/mo** fixed costs (exact break-even = **18 active subscribers/mo**, rounded to `1/day` by the tool). *Note: Excludes a full-time founder market salary; assumes solo founder draws profit after break-even.*
- **The line to watch**: **Subscriber acquisition ramp & commercial market-data licensing (`$250/mo` Tiingo vs. `$499/mo` Twelve Data Venture)**. If Year-1 volume lands at half of plan (`--volume 0.5`, ramping from 15 to 75 subscribers), Months 1–2 lose `-$101/mo`, Year-1 operating profit drops from **$32,093** to **$12,219**, payback pushes from Month 3 to Month 6, and cash required rises from **$1,700** to **$1,902**. If Twelve Data Venture (`$499/mo`) is required instead of Tiingo Startup (`$250/mo`), fixed costs rise to `$887/mo` and Year-1 profit moves to **$29,105** (still profitable, payback Month 4).
- **Cash**: You need **$1,700** before the business pays for itself (`$1,902` in the 50%-volume downside case), well inside the `$3,000` bootstrap working reserve.
- **Three ways to improve the margin (verified with `unit_economics.py`)**:
  1. **Add the `$69/mo` Quant Desk & Daemon tier to lift blended ARPU (`--price 44` vs `--price 34` Founding blend)**: Raising realized ARPU from the `$34` Founding Cohort/Nightly mix (`$26,543` Year-1 profit, `78%` plan margin) back to `$39` adds **`+$5,550`** in Year-1 profit and `+3 pts` margin.
  2. **Offer annual prepay (`$384/yr`, `$32/mo` effective) on 25% of subscribers**: Eliminates 11 extra `$0.30` Stripe per-charge fixed fees per user per year and cuts involuntary churn—locking Year-1 cash ahead of the `$250/mo` Tiingo API bill.
  3. **Gate commercial Twelve Data (`$499/mo`) or Polygon Business (`$2,499/mo`) upgrades behind subscriber milestones**: Stay on Tiingo Startup Redistribution (`$250/mo`) until passing 100 active subscribers (`~$3,581/mo` contribution), saving `$2,988/yr` vs Twelve Data Venture (`$29,105` vs `$32,093` Year-1 profit) and protecting bootstrap cash.
- **Board financial conditions (`founder/board.md` C3)**: **Met conditionally**—commercial data licensing (`$250/mo` Tiingo) and hosted worker persistence (`$43/mo` Supabase Pro + Fly.io) fit comfortably inside `$638/mo` fixed costs with a `92%` contribution margin and 18-subscriber break-even, **provided** you obtain a written Tiingo/Twelve Data startup commercial quote before signing annual contracts.
- **Tax & accounting note**: All revenue is **before sales tax / US state SaaS tax / EU-UK VAT** (which Stripe Tax collects on top of `$29/$39/$69` where nexus applies). _Not financial, tax, or legal advice: have an accountant check entity structure, payroll/owner-draw taxes, and SaaS sales-tax/VAT obligations before accepting live payments._

Every number below comes from the input file (`founder/numbers.json`). Nothing is looked up or guessed.

## One subscriber-month

| line | per subscriber-month |
| --- | ---: |
| Price | $39.00 |
| Stripe processing (2.9% + $0.30) | -$1.43 |
| Alert delivery & DB MAU metering (est.) | -$0.20 |
| 30-day guarantee / refund reserve (4% est.) | -$1.56 |
| **Contribution** (what each subscriber-month leaves to pay the fixed costs) | **$35.81** (92%) |

## The margin that matters

Fixed costs: $638 a month (Tiingo Startup Redistribution data API $250, Supabase Pro (Postgres + Auth + Cron) $25, Fly.io worker & web app hosting $18, Email / domain / error monitoring (est.) $20, Content & creator marketing budget (est.) $250, Bookkeeping & compliance reserve (est.) $75).

- **Break-even: 1 subscriber-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (5 a day): **81%** of every sale, after every cost.
- Capacity: 33 a day.

## Year 1, month by month

| month | subscriber-months a day | revenue | profit | cumulative (after $1,700 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | $1,170 | $436 | -$1,264 |
| 2 | 1 | $1,170 | $436 | -$827 |
| 3 | 2 | $2,340 | $1,511 | $683 |
| 4 | 2 | $2,340 | $1,511 | $2,194 |
| 5 | 3 | $3,510 | $2,585 | $4,779 |
| 6 | 3 | $3,510 | $2,585 | $7,364 |
| 7 | 3 | $3,510 | $2,585 | $9,948 |
| 8 | 4 | $4,680 | $3,659 | $13,608 |
| 9 | 4 | $4,680 | $3,659 | $17,267 |
| 10 | 4 | $4,680 | $3,659 | $20,926 |
| 11 | 5 | $5,850 | $4,734 | $25,660 |
| 12 | 5 | $5,850 | $4,734 | $30,393 |

- **Year 1 operating profit: $32,093** on $43,290 of revenue.
- After the $1,700 startup spend: $30,393.
- Startup money earned back: month 3.
- Cash you need before it pays for itself: **$1,700**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 81% | 1 | $32,093 |
| Price -10% | 79% | 1 | $27,764 |
| Volume -20% | 78% | 1 | $24,143 |
| Unit costs +15% | 80% | 1 | $31,562 |

No red flags in these numbers. They are only as good as the inputs: check every cost against a real quote.
