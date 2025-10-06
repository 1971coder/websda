# Business Requirements Document (BRD) – *SDA Modeler*

## 1. Vision & Objectives
Build a lightweight, trustworthy modelling app for Specialist Disability Accommodation (SDA) projects that:
- Forecasts **total development cost** (land + planning + build + fees + interest capitalised).
- Forecasts **income** (SDA payments + tenant *Reasonable Rent Contribution* (RRC/MRRC)).
- Produces **cash flow, P&L and returns** (NOI, cap value, ICR, IRR, NPV) and supports **multi‑scenario** comparisons.
- Keeps **policy‑driven inputs** (DSP, CRA, NDIA price tables) version‑controlled and editable.

## 2. In‑Scope
1) **Project Setup**
   - Project metadata (address, SA4 or NDIA region, dates, GST flags, inflation indices).
   - One‑to‑many **Scenarios** per project (baseline, optimistic, lender case, etc.).

2) **Cost Modelling**
   - **Land & Acquisition** items (purchase price, stamp duty / acquisition fees, legals).
   - **Planning & Design** (DA/CC, authority fees, S94/Section 7.11, contributions).
   - **Construction Budget** lines: demolition, dwelling build, special site conditions, landscaping, contingency %, developer fee %.
   - **Cost allocation over time**: 
     * Distribution methods: **Straight‑line**, **S‑curve** (normalised), or **Manual/Lump‑sum by date**.
     * Validation: allocations must sum to 100% of each budget line; enforce date range; show cumulative chart.
   - **Capitalised Interest**: calculated on **drawn balance only**; supports land facility and construction facility (optionally combined).

3) **Finance**
   - Facilities: Land loan, Construction loan, Equity/Grant/Capital contribution.
   - Inputs per facility: limit, draw schedule (linked to cost allocations), base rate + margin, compounding frequency, establishment fees, line fee, interest‑only vs amortising after completion.
   - **Interest accrual options**: daily (365/365), monthly (30/360), or ACT/365—configurable at scenario level.
   - **Capitalisation**: toggle on/off per facility; interest is added to principal until PC (practical completion).

4) **Income Modelling**
   - Residents: number, occupancy ramp, design categories (HPS/Robust/FA/IL), building type (house/duplex/villa/apartment), location factor.
   - **SDA price limit lookup** by category, building type and region (versioned table).
   - **RRC/MRRC** per resident:
     * Default policy: 25% of **basic DSP** (+ 25% pension supplement where applicable) **plus** 100% **Commonwealth Rent Assistance (CRA)**. Rates are versioned and user‑editable to reflect updates.
     * Alt policy toggle: 25% of DSP + 100% CRA (some guidance/industry explainers use this simplification).
   - Indexation: CPI for RRC; NDIA price index for SDA payments.
   - Income timing: start date, fill‑up period, vacancy factor, arrears.

5) **Operating P&L**
   - Expense groups: rates & taxes, insurance, repairs/maintenance, utilities (if owner‑paid), NDIS audit/compliance, property management, allowance for capex (eg. 2–3% of construction), other.
   - Inflation per cost line; timing (monthly/annual).
   - **Metrics**: NOI, cap value at completion (NOI / Cap rate), LVR at completion, **ICR** (NOI/Interest), DSCR (if amortising), IRR & NPV (pre‑ and post‑interest), payback, land value growth tracker.

6) **Scenarios & Comparisons**
   - Save, clone, and label scenarios.
   - Comparison view: key inputs deltas; charts for Capex draw, Interest, NOI, IRR; side‑by‑side PDF export.

7) **Data Management & Audit**
   - **Assumption Sets**: DSP/CRA rates with effective dates; NDIA SDA price tables by year; interest rate curves.
   - Change log / audit trail per scenario.
   - Import/export: CSV for budgets & schedules; PDF/Excel for reports.

## 3. Out‑of‑Scope (v1)
- Construction progress certifications workflow, payments automation.
- Tenancy management and invoicing.
- Bank covenant monitoring integrations.

## 4. Users & Roles
- **Analyst/Developer** – creates scenarios, runs models.
- **Finance/Lender** – read‑only results, downloads reports.
- **Admin** – manages assumption sets & policy tables.

## 5. Key Requirements & Acceptance Criteria (selected)
- **R1** Cost allocation methods  
  *Given* a budget line of $X and a 10‑month window, *when* the user selects “S‑curve” with σ=0.3, *then* the sum of monthly allocations equals $X (±$0.01) and no month is negative.
- **R2** Capitalised interest  
  For each facility, **Interest(t) = Balance(t-1) × Rate(t) × DayCount(t)**; **Balance(t) = Balance(t-1) + Draws(t) + Interest(t)** (if capitalising). Results reconcile to total capitalised interest and final principal at PC.
- **R3** RRC calculation  
  *Given* DSP and CRA rates effective for a date, *then* **RRC_fortnightly = 25% × Basic_DSP (+ 25% Pension_Supplement) + 100% × CRA** (configurable policy).  
  System provides a footnote with the source and effective date.
- **R4** Metrics at completion  
  *Cap value* = NOI / CapRate; *LVR* = Debt / Cap value; *ICR* = NOI / Interest; *IRR* and *NPV* computed on monthly cash flows; ability to export monthly table.
- **R5** Scenario persistence  
  Save & clone scenarios; all inputs and generated outputs are serialized; reports regenerate deterministically.

## 6. Non‑Functional Requirements
- **Accuracy**: unit tests for every formula; round only at presentation.
- **Performance**: <200ms compute for 10‑year monthly model on typical budgets.
- **Security**: role‑based access, audit trail, PII minimised.
- **Compliance**: store sources & effective dates for NDIA/DSP/CRA; disclaimer.
- **Reliability**: deterministic “pure function” calc engine with snapshotting.

## 7. Data Glossary (extract)
- **BudgetLine**: {category, label, amount, start_date, end_date, method: [straight|s_curve|manual], weights[], lumps[]}
- **Facility**: {type: [land|construction], limit, draw_source: BudgetLine[], rate, margin, compounding, capitalise: bool}
- **Resident**: {design_category, building_type, occupancy_profile, rrc_policy, dsp_rate_ref, pension_supp_ref, cra_rate_ref}
- **AssumptionSet**: {name, effective_from, source_urls[], sda_price_table_version, dsp[], cra[]}
- **Scenario**: {start_date, end_date, discount_rate, cap_rate, assumption_set_id, budget_lines[], facilities[], residents[], op_ex_lines[]}
- **OpExLine**: {label, amount, frequency, indexation, start_date?}

## 8. Sample Formulas
- **Monthly S‑curve weights** using a normal PDF over N months with μ=N/2 and σ configured; normalise weights to 1.0.
- **Daily interest**: `interest_d = balance_prev * annual_rate / 365`; sum over month; add to balance if capitalising.
- **RRC**: `RRC_fortnight = 0.25 * DSP_basic (+ 0.25 * Pension_Supp) + CRA`; convert to monthly using 26 fortnights/12.

## 9. Reporting
- Project Summary (capex, capitalised interest, debt at PC)
- Cashflow by month (draws, interest, income, expenses)
- Tenancy & income detail (residents, SDA price lines, RRC)
- KPI deck (NOI, cap value, ICR, IRR, NPV; scenario compare)
