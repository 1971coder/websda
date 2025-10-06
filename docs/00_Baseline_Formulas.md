# Baseline Formulas (Phase 0 Confirmation)

## Interest Accrual
For each facility *f* and month *t*:

- **Average Rate**: `rate_ft = (baseRateBps + marginBps) / 10_000`
- **Day Count Factor**:
  - ACT/365: `days(t) / 365`
  - ACT/360: `days(t) / 360`
  - 30/360: `30 / 360`
- **Interest**: `interest_ft = balance_f(t-1) × rate_ft × dayCountFactor`
- **Balance Update**:
  - If `capitaliseInterest = true`: `balance_f(t) = balance_f(t-1) + draws_f(t) + interest_ft`
  - Otherwise: `balance_f(t) = balance_f(t-1) + draws_f(t)` and interest is paid-out in the cashflow.

Scenario default conventions apply to all facilities unless overridden per facility. Reporting must surface both the scenario default and any overrides.

## Draw Allocation
Budget lines distribute amount *A* over *n* months between `start` and `end`:

- **Straight**: `weight_m = 1 / n`
- **S-curve**: `weight_m = normalPdf(m; μ = (n + 1)/2, σ = userSigma)` normalized to sum 1
- **Manual**: explicit lumps validated to sum to *A*

Monthly draw amount: `draw_m = A × weight_m`. Validation enforces non-negative weights and coverage of the timeline inclusive of start/end.

## RRC / MRRC Policies
Let `DSP_basic`, `Pension_sup`, `CRA` represent fortnightly rates effective for the resident start date.

- **VIC/NDIA**: `RRC_f = 0.25 × DSP_basic + 0.25 × Pension_sup + 1.00 × CRA`
- **Simple**: `RRC_f = 0.25 × DSP_basic + 1.00 × CRA`

Convert fortnightly to monthly with `RRC_month = RRC_f × 26 / 12`. CPI indexation is applied annually from the assumption set effective date.

## NOI & KPIs
- `NOI = Income - OperatingExpenses`
- `CapValue = NOI_completion / CapRate`
- `LVR = DebtCompletion / CapValue`
- `ICR = NOI / InterestPaid`
- `IRR` and `NPV` calculated on monthly cashflows with 10% default discount rate (configurable per scenario).
