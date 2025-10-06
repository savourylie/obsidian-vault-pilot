# Ticket 045 — Wire Edit with AI to Adapter Factory

- Type: integration
- Owner: @you
- Status: Ready

## Summary
Use the provider-aware adapter for the “Edit with AI” flow in `generateSuggestion()`.

## Why
Ensures inline editing works with both providers.

## Scope
- `src/main.ts` → `generateSuggestion`:
  - Replace `new OllamaAdapter(this.settings.ollamaUrl)` with factory.
  - Keep streaming & token window logic unchanged.
  - Provider-specific connection error messages.

## Out of Scope
- Discover Chat wiring.
- Tag Suggestions.

## Acceptance Criteria
- Under provider=Ollama, behavior unchanged.
- Under provider=LM Studio, streaming edit suggestions work when server is up; friendly error when down.

## Implementation Steps
1. Import and use `createAdapter`.
2. Map provider to error messages (Ollama vs LM Studio).

## Validation
- Manual: select text and trigger Edit with AI under both providers.

