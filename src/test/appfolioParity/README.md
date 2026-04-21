# AppFolio Parity Test Scaffolding

One `.test.ts` stub per module modified by Phases 1-2 of `AppFolio_Parity_Implementation_Plan.md`.

Each stub starts as a placeholder that passes (a single `expect(true).toBe(true)` smoke). As each Phase-1 or Phase-2 task ships, the engineer replaces the stub with the contract test specified in that task's description.

**Files:**

- Phase 1 schema extensions — residents, vendors, properties, maintenance, accounting
- Phase 2 partial-coverage upgrades — calendar, communication, complianceEngine, forecast, insurance, utilities, audit, sentiment, projects, propertyTimeline

**Do NOT delete** these stubs before the corresponding phase ships — they guarantee the test file exists so the phase-gate can fail loudly if the real test is missing.
