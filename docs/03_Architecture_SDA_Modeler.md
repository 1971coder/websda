# Simple Architecture – *SDA Modeler*

**Design goals**: keep it familiar, easy to host, easy to test, and friendly for code‑gen (ChatGPT‑codex).

## 1. High‑Level
- **Monorepo** (pnpm): `apps/web` (Next.js) + `packages/calc-engine` (pure TS) + `packages/db` (Prisma schema) + `packages/ui` (shared components).
- **Frontend**: Next.js (App Router, TypeScript). Form state with React Hook Form + Zod. Charts with Recharts.
- **Backend**: Next.js API routes (or NestJS if you prefer), tRPC for typed endpoints.
- **Database**: PostgreSQL with Prisma ORM. Row‑level security via Postgres roles if multi‑tenant.
- **Auth**: NextAuth (email/SSO). Role claims for Admin/Analyst/Viewer.
- **Infra**: Vercel (web) + Supabase/Neon (Postgres). Object storage (S3) for exports.
- **Testing**: Vitest/Jest for calc engine; Playwright for E2E.
- **Observability**: simple audit log table + pino logs.

## 2. Core Modules
1) **Calc Engine (packages/calc-engine)**  
   - Pure, deterministic TypeScript functions.  
   - Inputs: `Project`, `Scenario`, `AssumptionSet` DTOs.  
   - Outputs: `Cashflow[]` monthly rows + `KPI` summary.  
   - No I/O side effects; 100% unit‑tested.

2) **Assumptions Service**
   - Stores versioned **SDA price tables**, **DSP/CRA** rates with effective dates, and **indexation** settings.
   - Admin UI to upload CSV (new NDIA tables) and to edit rates with “effective from” dates.

3) **Scenario Service**
   - CRUD for scenarios; cloning; JSON snapshot of inputs; report generation and export.

4) **Finance Module**
   - Facilities & draw schedules; interest day‑count conventions; capitalisation toggle; repayment profile after PC.

5) **Income Module**
   - Resident roster and occupancy; SDA price lookup; RRC policy engine with pluggable formula strategies.

6) **Reporting Module**
   - PDF/Excel generator (server side) with a project cover sheet, assumptions appendix, and monthly cashflow table.

## 3. Data Model (simplified ERD)
- **Project** 1—*—N **Scenario**  
- **Scenario** 1—*—N **BudgetLine**  
- **Scenario** 1—*—N **Facility**  
- **Scenario** 1—*—N **Resident**  
- **Scenario** 1—*—N **OpExLine**  
- **AssumptionSet** 1—*—N **Rates** (DSP, CRA, CPI) & 1—*—N **SdaPriceRow**  
- **CashflowMonth** (derived, persisted for reports or regenerated on demand)

## 4. Key DTOs (sketch)
```ts
type BudgetLine = {
  id: string; label: string; category: 'land'|'planning'|'construction'|'other';
  amount: number; start: string; end: string;
  method: 'straight'|'s_curve'|'manual';
  weights?: number[];   // normalised to 1.0 (for straight/s-curve auto-filled)
  lumps?: {date: string; amount: number}[];
};

type Facility = {
  id: string; kind: 'land'|'construction';
  limit: number; baseRate: number; margin: number;
  compounding: 'monthly'|'daily'; dayCount: 'ACT/365'|'30/360'|'ACT/360';
  capitalise: boolean; feesUpfront?: number;
};

type Resident = {
  id: string; design: 'HPS'|'Robust'|'FA'|'IL'; buildingType: 'house'|'villa'|'apartment';
  locationCode: string; rrcPolicy: 'vic_rule'|'simple';
  occupancy: { start: string; rampMonths: number; target: number }; // e.g., 0->100% in 6 months
  dspRateKey?: string; pensionSupplementKey?: string; craRateKey?: string;
};

type OpExLine = {
  id: string; label: string; amount: number;
  frequency: 'monthly'|'annual'; indexation: number; startDate?: string;
};

type Scenario = {
  id: string; label: string; startDate: string; endDate: string;
  discountRate?: number; capRate?: number;
  budgetLines: BudgetLine[]; facilities: Facility[];
  residents: Resident[]; opEx: OpExLine[];
};
```

## 5. Calculation Flow
1. Expand **BudgetLines** into a monthly **Draw Schedule** using the selected distribution.
2. Merge draws into **Facilities** (land/construction). Compute interest each period:
   `interest_m = balance_prev * rate_m * days/denom; balance = balance_prev + draws + (capitalise ? interest_m : 0)`.
3. Compute **SDA income** per resident from SDA price tables + MRRC/RRC policy. Apply occupancy ramp and vacancy.
4. Build **OpEx** by month (with indexation).
5. Derive **NOI**, **Cap value**, debt metrics; run IRR/NPV on pre‑ and post‑interest cash flows.
6. Emit **CashflowMonth[]** and **KPIs**.

## 6. Security & Audit
- Per‑scenario change log with before/after JSON.
- AssumptionSet changes require Admin and record source/URL/effective date.

## 7. Extensibility (later)
- Bank covenant pack, sensitivities (tornado charts), scenario compare dashboard, and API to fetch current DSP/CRA rates from an internal registry.
