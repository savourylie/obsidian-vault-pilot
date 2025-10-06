# LM Studio Support Plan

This plan introduces LM Studio as an alternative LLM provider alongside Ollama. It covers settings UI, model discovery, a new adapter, and wiring changes so Discover Chat, Edit with AI, and Tag Suggestions can work with either provider.

## Goals
- Add a provider switch: `Ollama` or `LM Studio`.
- Support LM Studio’s OpenAI-compatible API for generate and streaming.
- Keep existing Ollama flows working (idempotent toggle behavior unchanged).
- Minimal, surgical changes; preserve current structure and naming.

## Scope
- Settings UI updates in `src/main.ts` (Setting tab).
- New `LMStudioAdapter` implementing `LLMAdapter` in `src/llm/`.
- Provider-aware adapter selection for Discover Chat, Edit with AI, and Tag Suggestions.
- Provider-aware model listing in Settings and Discover view.
- Error/help text tailored per provider.

## Data Model Changes
- Add to `SerendipityPluginSettings`:
  - `provider: 'ollama' | 'lmstudio'` (default `'ollama'`).
  - `lmStudioUrl: string` (default `http://localhost:1234`).
- Keep `ollamaUrl` as-is for backward compatibility.
- Keep `defaultChatModel` and `defaultEditModel` global for now; on provider change, if the selected model no longer exists, fallback to the first available model.
  - Future enhancement: store per-provider defaults (optional).

## Settings UI Changes (src/main.ts)
- New dropdown: “LLM Provider” with options `Ollama` and `LM Studio`.
- Base URL fields:
  - Show “Ollama Base URL” when provider = `Ollama`.
  - Show “LM Studio Base URL” when provider = `LM Studio`.
- Model dropdown population (both Chat and Edit):
  - Ollama: `GET {ollamaUrl}/api/tags` → map `(m.model || m.name)`.
  - LM Studio: `GET {lmStudioUrl}/v1/models` → map `data[].id`.
- UX help text:
  - Ollama warning remains: prompt to install/start Ollama.
  - LM Studio warning: “Could not load models. Enable LM Studio Local Server (OpenAI-compatible) and try again.” Link to https://lmstudio.ai.
- Debounce model reload when base URL or provider changes.

## New Adapter (src/llm/LMStudioAdapter.ts)
Implements `LLMAdapter` using the OpenAI-compatible Chat Completions API.

- Constructor: `(baseUrl = 'http://localhost:1234', defaultModel = 'gpt-3.5-turbo' /* or any installed */)`.
- `generate(prompt, { model, temperature })`:
  - POST `{baseUrl}/v1/chat/completions`
  - Body: `{ model, temperature, messages: [{ role: 'user', content: prompt }], stream: false }`
  - Return: `choices[0].message.content || ''`.
- `stream(prompt, onChunk, { model, temperature, signal })`:
  - Same endpoint with `stream: true`.
  - Parse SSE lines (`data: ...`); for each JSON payload, extract `choices[0].delta.content` and call `onChunk`; stop on `[DONE]`.
- No API key required for local LM Studio default; respect future configurability if needed.

## Adapter Factory
Create a small helper (inline or `src/llm/factory.ts`) that returns the right adapter based on settings:

- Inputs: `{ provider, ollamaUrl, lmStudioUrl, defaultModel }`.
- Returns: `new OllamaAdapter(...)` or `new LMStudioAdapter(...)`.
- Used by:
  - Discover Chat (`src/ui/DiscoverView.ts` constructor) instead of hardcoded `OllamaAdapter`.
  - Edit with AI (`generateSuggestion` in `src/main.ts`).
  - Tag Suggestions (`suggestTags` injection or provider-aware pass-through).

## Wiring Changes
- Discover Chat (`src/ui/DiscoverView.ts`):
  - Instantiate chat service with adapter from factory.
  - Model list loader becomes provider-aware (Ollama `/api/tags`, LM Studio `/v1/models`).
- Edit with AI (`src/main.ts`):
  - Replace `new OllamaAdapter(this.settings.ollamaUrl)` with factory output.
- Tag Suggestions (`src/services/TaggingService.ts` call site in `src/main.ts`):
  - Pass `llmAdapter` from factory, or pass provider+url to let TaggingService construct it.

## Error Handling
- Ollama errors: “Could not connect to Ollama. Is it running?”
- LM Studio errors: “Could not connect to LM Studio. Is Local Server enabled (OpenAI-compatible)?”
- Model list failures show provider-appropriate help text and disable dropdowns.

## Compatibility & Migration
- Existing users with only `ollamaUrl` continue to work (default provider `ollama`).
- New settings fields default safely; `loadSettings()` merges without breaking missing keys.
- If a saved default model is not present for current provider, select the first available model.

## Testing Plan
- Manual
  - Provider switch updates visible base URL setting and reloads model lists.
  - With Ollama running: chat/edit function as before.
  - With LM Studio Local Server running at `http://localhost:1234`: models load; chat/edit stream responses.
  - Error states render correct warnings and disable dropdowns.
- Headless
  - Run `npm run headless:test` to ensure Discover toggle unaffected.
  - Session-related tests remain green; adapters are injected without changing behavior.

## Implementation Steps
1. Add settings fields: `provider`, `lmStudioUrl`; default values.
2. Update Settings UI: provider dropdown; conditional base URL inputs; model loader handles both providers.
3. Implement `LMStudioAdapter` with generate + streaming SSE.
4. Add adapter factory; replace direct `OllamaAdapter` usage in Discover, Edit, Tagging.
5. Improve error/help text for LM Studio path.
6. Verify manual flows; run headless tests.

## Acceptance Criteria
- Users can pick `Ollama` or `LM Studio` in Settings.
- Model dropdowns populate from the selected provider and allow selection.
- Discover Chat and Edit with AI work with the selected provider and stream responses.
- Errors show clear, provider-specific guidance.
- Existing Ollama users are unaffected by default.

## Future Enhancements (Optional)
- Per-provider default models (`providerDefaults`) and persistence.
- Temperature and other sampling controls per provider.
- Unified model cache keyed by `{provider, baseUrl}`.
- Additional providers (OpenAI, Claude) via the same `LLMAdapter` interface.

