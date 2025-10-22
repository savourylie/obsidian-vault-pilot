# 52 — UI Wiring: Discover + Edit for OpenAI‑Compatible Provider

Goal: Ensure Discover chat and the Edit modal work when provider is OpenAI‑compatible, using the model name from settings. Avoid reliance on `/v1/models` for populating dropdowns.

## Why
- For OpenAI‑compatible endpoints, model listing may be unavailable or require auth.
- We should still let users chat and edit by using the configured default model.

## Scope
- DiscoverView: when provider is OpenAI‑compatible, switch the “Model” control to a simple text input (or, at minimum, a single‑option select populated from `defaultChatModel`).
- EditModal: when provider is OpenAI‑compatible, populate the “Model” selector with the configured `defaultEditModel` (single option). Optionally show a small hint to edit the model in settings.
- Adapter creation should pass through `openAIUrl` when provider is OpenAI‑compatible.

## Proposed Changes
- `src/ui/DiscoverView.ts`
  - Extend provider union to include `'openai'`.
  - In constructor and `updateProviderSettings`, accept and store `openAIUrl`.
  - In `createModelSelector`/`loadAvailableModels`:
    - If provider is OpenAI‑compatible, skip remote model listing.
    - Option A (preferred): render a text input bound to chat service model.
      - On change, call `this.chatService.setModel(value)` and persist to `localStorage` key `vp-selected-chat-model`.
    - Option B (minimal): render a select with one option set to `defaultChatModel`.

- `src/ui/EditModal.ts`
  - Extend options type to include provider `'openai'` and `openAIUrl?: string`.
  - In `loadModels()`, when provider is OpenAI‑compatible:
    - Do not fetch models.
    - Populate dropdown with a single option: `options.defaultModel` (if present); else leave the fallback list.
    - Enable the selector.

- `src/main.ts`
  - Where `createAdapter` is called, pass `openAIUrl` when provider is OpenAI‑compatible.
  - When opening DiscoverView, pass the new `openAIUrl` argument.
  - In `refreshAllDiscoverViewProviderSettings()`, forward `openAIUrl` to views.

## Impacted Files
- `src/ui/DiscoverView.ts`
- `src/ui/EditModal.ts`
- `src/main.ts`

## Acceptance Criteria
- With provider set to OpenAI‑compatible:
  - Discover view shows a usable model control (text input or single‑option select) and uses that model for chat.
  - Edit modal’s model selector is populated with the default edit model and allows generation.
  - No attempts are made to hit `/v1/models` or `/api/tags` for OpenAI‑compatible.
  - Model selection persists per the existing localStorage keys when relevant.

## Non‑Goals
- Enabling model listing for OpenAI‑compatible endpoints.
- Adding an API key field.

## Verification Steps
1. Set provider to OpenAI‑compatible, set base URL and default models in settings.
2. Open Discover and send a message; confirm a response is returned using the configured model.
3. Select text and run “Edit selection with AI”; confirm a suggestion is generated using the configured model.
4. Switch back to other providers; ensure previous model listing logic still works.

