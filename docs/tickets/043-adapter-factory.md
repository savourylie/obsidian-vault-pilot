# Ticket 043 — Adapter Factory (createAdapter from settings)

- Type: feature
- Owner: @you
- Status: Ready

## Summary
Add a small factory helper that returns an `LLMAdapter` instance based on current settings (Ollama vs LM Studio).

## Why
Centralizing adapter selection avoids duplicating provider checks throughout the code and simplifies future provider additions.

## Scope
- New `src/llm/adapterFactory.ts`:
  - `createAdapter({ provider, ollamaUrl, lmStudioUrl, defaultModel }): LLMAdapter` → returns `OllamaAdapter` or `LMStudioAdapter`.
- No call sites updated yet (handled by later tickets).

## Out of Scope
- UI/Settings changes; adapter usage changes.

## Acceptance Criteria
- Factory compiles and returns the correct adapter type based on inputs.
- No changes to runtime paths until wired.

## Implementation Steps
1. Implement function and export.
2. Add minimal JSDoc explaining provider mapping and defaults.

## Validation
- TypeScript compile; optionally log the constructor used during manual spot checks.

