# Ticket 040 — Add LLM Provider Setting (Ollama / LM Studio)

- Type: feature
- Owner: @you
- Status: Ready

## Summary
Add a top-level provider selector in Settings to choose between Ollama and LM Studio. Persist the selection and show the appropriate base URL field. No behavioral changes to chat/edit yet.

## Why
We currently hardcode Ollama. We need a gradual, low-risk step to introduce the provider concept without changing runtime behavior.

## Scope
- Extend plugin settings with `provider: 'ollama' | 'lmstudio'` (default `'ollama'`).
- Add `lmStudioUrl: string` (default `http://localhost:1234`).
- Update Settings UI to:
  - Add “LLM Provider” dropdown.
  - Conditionally show “Ollama Base URL” or “LM Studio Base URL”.
- Persist values via `saveSettings()`.

## Out of Scope
- Adapter creation or usage changes.
- Model list fetching changes.
- Discover/Edit functional wiring.

## Acceptance Criteria
- Provider dropdown appears in Settings and persists across reloads.
- Only the relevant base URL field is visible based on provider.
- Plugin loads with no errors; existing Ollama users unaffected.

## Implementation Steps
1. Update `SerendipityPluginSettings` in `src/main.ts` with `provider` and `lmStudioUrl`.
2. Extend `DEFAULT_SETTINGS` for both fields.
3. In `SerendipitySettingTab.display()`, add the provider dropdown.
4. Conditionally render the base URL input (simple show/hide or separate sections).
5. Ensure `saveSettings()` merges safely.

## Validation
- `npm run dev` and open Obsidian settings:
  - Toggle provider; verify only relevant URL field is shown.
  - Reload plugin; values persist.
- Run `npm run headless:test` to ensure no regressions in unrelated flows.

---

### Notes
- Keep labels explicit to avoid confusion: “LLM Provider”, “Ollama Base URL”, “LM Studio Base URL”.
- Debounce hooks for model reload can be added later (Ticket 042).

