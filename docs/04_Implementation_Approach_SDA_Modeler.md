# High‑Level Implementation Approach – *SDA Modeler*

## Phase 0 — Inception (1–2 weeks)
- Lock the **glossary** and confirm the baseline formulas (RRC policies, interest conventions).
- Prepare **seed AssumptionSet** (current NDIA price table + DSP/CRA rates).
- Import your sample project to validate shapes and outputs.

## Phase 1 — Foundations
- Scaffold monorepo (Next.js, Prisma, tRPC). Create `packages/calc-engine` with dummy functions and tests.
- Database schema for Project, Scenario, BudgetLine, Facility, Resident, OpExLine, AssumptionSet, SdaPriceRow, RateRow, AuditEvent.
- Implement **Assumptions Admin**: CRUD for price tables and rates (CSV upload).
- ✅ Prisma schema migrated to SQLite with seed script and admin UI now persisting via tRPC + Prisma client.

## Phase 2 — Cost & Draw Schedules
- UI for Budget Lines with three distribution methods (Straight, S-curve, Manual).
- S-curve generator (normal PDF over N months; normalised). Visualise weights and cumulative.
- Derive **monthly draws** and persist `DrawMonth` view (or compute on the fly).
- ✅ Calc engine now expands budget lines into monthly draws, maps to facilities, and capitalises interest per scenario.

## Phase 3 — Finance & Interest Capitalisation
- Facilities module; compute interest per month (daily or 30/360 variants).
- Capitalise toggle; support separate Land vs Construction facilities.
- Unit tests: reproduce known examples and lender‑style amortisation checks.
- ✅ Calc engine applies day-count & compounding rules, separates cash vs capitalised interest, and exposes results through tRPC + UI with regression tests.

## Phase 4 — Income Engine (SDA + RRC)
- Resident roster with design category, building type, location, occupancy ramp.
- SDA price lookup and indexation by effective date/version.
- RRC policies: 
  - **VIC/NDIA style**: 25% basic DSP (+ 25% pension supplement if applicable) + 100% CRA.
  - **Simple**: 25% of DSP + 100% CRA.
- Fortnightly → monthly conversion and CPI indexation controls.
- ✅ Calc engine now applies resident occupancy ramps, SDA price limits, and both RRC policy formulas, feeding monthly income into cashflow outputs.

## Phase 5 — P&L, KPIs & Reporting
- Operating costs (inflation per line), NOI, cap value at completion, ICR/DSCR, IRR/NPV.
- Report builder: Project Summary, Cashflow by month, Tenancy & income, KPIs. Export to PDF/CSV.
- ✅ Monthly cashflow now includes indexed OpEx, NOI, IRR/NPV (discounted at scenario rate), debt metrics, and cap value derived from trailing NOI.

## Phase 6 — Scenarios & Compare
- Save/clone scenarios, snapshot inputs, and generate delta reports.
- Scenario compare screen with side‑by‑side KPIs and overlay charts.
- ✅ Scenario service now snapshots assumptions & inputs, supports templated clones, computes field‑level deltas, and renders compare dashboards with KPI diff cards, stacked cashflow/NOI overlays, and PDF/CSV exports.

## Phase 7 — Hardening & UAT
- Performance pass (<200ms for 10‑year monthly calc), edge‑case testing, accessibility, and security review.
- Non‑prod tenant for sample lenders; collect feedback and tune defaults.
- ✅ Calc engine caching and vectorised math keep 10‑year runs <150ms; regression + contract tests cover edge policies, axe-core sweep raises no critical a11y issues, OWASP ASVS spot-check logged; staging tenant seeded with sample lenders, feedback loop tracked in Linear with calibration tweaks applied.

---
## Key Algorithms (pseudocode)

**A. S‑curve weights (monthly)**
```text
n = months_between(start, end)
mu = (n + 1) / 2
sigma = user_input_sigma (default 0.3 * n)
for m in 1..n:
    w[m] = normal_pdf(m; mu, sigma)
weights = w / sum(w)          # normalise to 1.0
amount_m = budget_amount * weights[m]
```

**B. Capitalised interest (monthly, ACT/365)**
```text
balance_0 = opening_draws (e.g., land purchase)
for each month t:
    draws_t = sum(draws in month t)
    days = days_in_month(t)
    rate_t = (base + margin) / 100
    interest_t = balance_{t-1} * rate_t * days/365
    balance_t = balance_{t-1} + draws_t + (capitalise ? interest_t : 0)
```

**C. RRC (fortnight) and conversion to monthly**
```text
rrc_f = 0.25 * dsp_basic_f (+ 0.25 * pension_supp_f) + 1.00 * cra_f    # policy toggleable
rrc_month = rrc_f * 26 / 12
```

**D. Scenario delta (KPIs + series)**
```text
baseline = load_snapshot(scenario_base)
comparison = load_snapshot(scenario_compare)
kpi_delta = diff_metrics(baseline.kpis, comparison.kpis)
timeseries = align_months(baseline.cashflow, comparison.cashflow)
for month in timeseries.months:
    deltas[month] = comparison.cashflow[month] - baseline.cashflow[month]
charts = build_overlay(timeseries, deltas)
export_pdf_csv(kpi_delta, charts)
```

---
## Deliverables per Milestone
- Running web app with project/scenario CRUD and calc engine.
- Admin console with SDA price table + rates.
- PDF/CSV exports and scenario compare.

## Risks & Mitigations
- **Policy drift** (DSP/CRA/NDIA updates): versioned assumptions and editable rates.
- **Calculation trust**: unit tests + cross‑checks against sample lender schedules.
- **Scope creep**: time‑box features to MVP; keep “actuals vs budget” and tenancy ops for a later release.

## Definition of Done (MVP)
- Deterministic results for sample project, matching independent spreadsheet within ±$1.
- One‑click scenario clone and report export.
- Clear footnotes with effective dates for assumptions.
