# Ticket 048 — Tests and Verification for LM Studio Support

- Type: QA
- Owner: @you
- Status: Ready

## Summary
Run existing headless tests and perform manual validation for provider switch and adapter wiring. Optionally add a minimal script to sanity-check the adapter factory mapping.

## Why
Ensure no regressions and that the new provider path degrades gracefully when offline.

## Scope
- Run:
  - `npm run headless:test` (Discover toggle)
  - `npm run headless:test:session` (session model)
  - `npm run headless:test:attachments` (prompt attachments)
- Manual checks:
  - Switch provider; observe model lists and help text.
  - Discover Chat send under both providers (fallback list if needed).
  - Edit with AI under both providers; check error handling.

## Out of Scope
- Full end-to-end CI; networked tests.

## Acceptance Criteria
- All headless tests pass.
- Manual checks confirm provider-aware behaviors and graceful failures.

## Implementation Steps
1. Execute the commands locally; capture output.
2. Document any issues and follow up with targeted tickets if needed.

## Validation
- Paste logs/screenshots into PR description per guidelines.

