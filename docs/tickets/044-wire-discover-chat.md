# Ticket 044 — Wire Discover Chat to Adapter Factory

- Type: integration
- Owner: @you
- Status: Ready

## Summary
Replace direct `OllamaAdapter` usage in `DiscoverView` with the provider-aware adapter from the factory. Ensure model selector uses provider-aware list (depends on Ticket 042).

## Why
Allows chat to work with either provider seamlessly.

## Scope
- `src/ui/DiscoverView.ts`:
  - Accept provider + both base URLs (passed from plugin) or the instantiated adapter.
  - Instantiate `ChatService` with the factory-created adapter.
  - Keep all existing UI/animations intact.
- Ensure toggle is idempotent (no duplicate leaves) — unchanged behavior.

## Out of Scope
- Edit with AI wiring.
- Tag Suggestions.

## Acceptance Criteria
- Discover panel opens and functions as before under provider=Ollama.
- Under provider=LM Studio with server running, messages stream; with server down, errors are handled gracefully.

## Implementation Steps
1. Update constructor to receive provider and URLs from `SerendipityPlugin`.
2. Use adapter factory to create the adapter.
3. Keep fallback model list behavior.

## Validation
- Manual send a message in chat under both providers.
- `npm run headless:test` (Discover toggle smoke) passes.

