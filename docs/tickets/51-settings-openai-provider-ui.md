# 51 — Settings: Add “OpenAI‑Compatible” Provider + Base URL and Model Inputs

Goal: Expose a first‑class “OpenAI‑compatible” provider in settings. Users can enter a base URL and model name in text fields. Preserve existing behavior for Ollama and LM Studio.

## Why
- Users want to point VaultPilot at arbitrary OpenAI‑compatible endpoints.
- Not all endpoints implement `/v1/models` or may require auth; a simple text field for model is more reliable than a dropdown for this provider.

## Scope
- Provider dropdown: add “OpenAI‑compatible”.
- Show an `OpenAI Base URL` text field when provider is OpenAI‑compatible.
- Default Model configuration:
  - For OpenAI‑compatible: use a text input for both Default Chat Model and Default Edit Model.
  - For Ollama/LM Studio: keep existing dropdowns populated from the provider.
- Caching of model lists should skip attempts when provider is OpenAI‑compatible.

## Proposed Changes
- `src/main.ts`
  - Extend `SerendipityPluginSettings` with:
    - `provider: 'ollama' | 'lmstudio' | 'openai'`
    - `openAIUrl: string`
  - Extend `DEFAULT_SETTINGS` with `openAIUrl: ''` (or a sensible local default like `http://localhost:8080`).
  - Settings UI:
    - Provider dropdown: add option “OpenAI‑compatible”.
    - Conditionally render base URL input blocks based on provider; add one for `openAIUrl`.
    - For Default Chat/Edit Models, when provider is OpenAI‑compatible:
      - Render text inputs instead of dropdowns; bind to `defaultChatModel` and `defaultEditModel` respectively.
      - Hide reload buttons and model‑list warnings for OpenAI‑compatible.
    - Adjust `loadModelsAndPopulate` to no‑op for OpenAI‑compatible (skip network requests; keep existing values).
  - Ensure `refreshAllDiscoverViewProviderSettings()` passes the right base URL when provider is OpenAI‑compatible (see DiscoverView updates in Ticket 52).

## Impacted Files
- `src/main.ts` (settings typing, rendering, loadModels logic)

## Acceptance Criteria
- Provider dropdown shows “OpenAI‑compatible”.
- When OpenAI‑compatible is selected:
  - An `OpenAI Base URL` text field appears and persists correctly.
  - Default Chat Model and Default Edit Model are text inputs that persist.
  - No model fetching attempt occurs and no loading warnings are shown.
- Switching providers updates Discover view instances via the existing refresh hook.

## Non‑Goals
- API key storage and headers.
- Discover/Edit modals wiring (covered by Ticket 52).

## Verification Steps
1. Open settings → Large Language Model.
2. Switch provider between Ollama, LM Studio, and OpenAI‑compatible; verify the correct base URL field is shown.
3. With OpenAI‑compatible selected, enter `openAIUrl` and model names; close and reopen settings to verify persistence.
4. Toggle back to other providers and confirm dropdowns reload and work as before.

