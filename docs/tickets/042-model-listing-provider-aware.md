# Ticket 042 — Provider-Aware Model Listing (Settings + Discover)

- Type: feature
- Owner: @you
- Status: Ready

## Summary
Make model dropdowns load from the selected provider. Keep current Ollama code; add LM Studio path.

## Why
Users must be able to pick models provided by their selected local server.

## Scope
- Settings (`src/main.ts`):
  - When provider = `ollama`: GET `{ollamaUrl}/api/tags` → map `(m.model || m.name)`.
  - When provider = `lmstudio`: GET `{lmStudioUrl}/v1/models` → map `data[].id`.
  - Provider-aware warnings and “Reload models” buttons work for both.
  - Cache by `{provider, baseUrl}` to avoid unnecessary reloads.
- DiscoverView (`src/ui/DiscoverView.ts`): same provider-aware fetch for the chat model selector.

## Out of Scope
- Adapter wiring.

## Acceptance Criteria
- Switching provider refreshes the dropdowns; unavailable provider shows disabled dropdowns with a relevant help message.
- Ollama flow unchanged when provider = Ollama.
- No runtime errors if server is offline; fallback list still used in Discover.

## Implementation Steps
1. In Settings, pass provider + correct base URL into the model load routine; adjust cache key.
2. Add LM Studio fetch handler (`/v1/models` → `data[].id`).
3. Update help text per provider.
4. Mirror the same logic in `DiscoverView.loadAvailableModels`.

## Validation
- Toggle provider in Settings; click reload; observe correct list/fail state.
- With no servers running, dropdowns disable and show provider-specific help; Discover shows fallback options.

