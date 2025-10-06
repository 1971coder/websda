# SDA Modeler – Glossary (Locked for MVP)

- **Assumption Set** – Versioned collection of SDA price tables, DSP/CRA rates, CPI and interest curve inputs. Scenarios must reference a specific set by ID and keep a JSON snapshot to remain auditable.
- **Budget Line** – Atomic capital expenditure item with category, amount, and timing window. Budget lines expand into a monthly draw schedule using one of three allocation methods (straight, S-curve, manual).
- **Capitalised Interest** – Interest accrued on drawn loan balances that is added back to principal until practical completion. Day-count and compounding conventions are scenario defaults overridden per facility.
- **Facility** – Debt instrument funding the project (land or construction). Stores limit, rate, margin, draw source, and capitalisation rules.
- **MRRC / RRC** – (Maximum) Reasonable Rent Contribution derived from DSP and CRA rates. Policies supported: VIC/NDIA (25% DSP + 25% pension supplement + 100% CRA) and Simple (25% DSP + 100% CRA).
- **NOI** – Net Operating Income after operating expenses but before debt service.
- **Practical Completion (PC)** – Scenario milestone after which facilities stop capitalising interest and may amortise.
- **Scenario** – Saved set of inputs for a project referencing an assumption set. Includes budget lines, facilities, residents, op-ex, and scenario-level settings (timeline, indexation).
- **SDA Price Table** – NDIA-published cap on annual SDA income by design category, building type, and location. Versioned by effective date.
- **Weighted Draw Schedule** – Monthly transformation of capex budgets used to drive facility draw-downs and capitalised interest.
