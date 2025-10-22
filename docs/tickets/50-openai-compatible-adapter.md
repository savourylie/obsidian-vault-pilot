# 50 — Add OpenAI‑Compatible LLM Adapter

Status: ✅ Done

Goal: Support OpenAI‑compatible HTTP APIs (e.g., OpenAI, OpenRouter, Together, local proxies) via a new adapter and factory wiring. Users will specify a base URL and a model name in settings; no API key handling in this ticket.

## What changed
- Added `OpenAIAdapter` with non-streaming `/v1/chat/completions` support and requestUrl→fetch fallback ([commit](TODO))
- Extended adapter factory and provider unions to return OpenAI-compatible instances, plumbed `openAIUrl` through settings and consumers ([commit](TODO))
- Updated Discover and Edit experiences to load OpenAI-style models, reuse fallback lists, and surface provider-specific errors ([commit](TODO))
- Expanded settings UI with OpenAI provider option, grouped model presets, and consistent default model handling across flows ([commit](TODO))

## Why
- Today we only support Ollama and LM Studio.
- Many providers expose an OpenAI‑compatible `/v1/chat/completions` API.
- We need a generic adapter so the rest of the app (Discover chat, inline Edit, tag suggestions) can work with these endpoints.

## Scope
- Add `OpenAIAdapter` implementing `LLMAdapter` that targets `/v1/chat/completions`.
- Use non‑streaming requests and emulate streaming by emitting the full response once (same pattern as `LMStudioAdapter`).
- Accept a configurable `baseUrl` and `defaultModel`.
- Wire provider selection into `adapterFactory`.

## Proposed Changes
- Create `src/llm/OpenAIAdapter.ts`:
  - `constructor(baseUrl: string, defaultModel: string)`; trim trailing `/`.
  - `generate(prompt, { model, temperature })` → POST `${baseUrl}/v1/chat/completions` with body `{ model, messages: [{ role: 'user', content: prompt }], temperature, stream: false }`.
  - `stream(...)` → call `generate(...)` and emit one chunk; compute basic token stats by char length as a fallback (same as `LMStudioAdapter`).
  - Use Obsidian `requestUrl` to avoid CORS; gracefully fall back to `fetch` if needed. Improve error messages for connection failures.

- Update `src/llm/adapterFactory.ts`:
  - Extend `LLMProvider` to include `'openai'`.
  - Add option `openAIUrl?: string` to `AdapterFactoryOptions`.
  - When `provider === 'openai'`, return `new OpenAIAdapter(opts.openAIUrl || 'http://localhost:8080', defaultModel)`.
  - Do not hardcode proprietary model names; derive `defaultModel` from the caller (settings) or fall back to a simple string like `'gpt-3.5-turbo'`.

- Update type unions that reference provider strings to include `'openai'` where applicable (EditModal options, DiscoverView, main settings).

## Impacted Files
- `src/llm/OpenAIAdapter.ts` (new)
- `src/llm/adapterFactory.ts`
- `src/ui/DiscoverView.ts` (provider union typing)
- `src/ui/EditModal.ts` (provider union typing)
- `src/main.ts` (settings typing and createAdapter calls)

## Acceptance Criteria
- ✅ When settings provider is set to “OpenAI‑compatible”, `createAdapter(...)` returns an instance of `OpenAIAdapter`. Verified via adapterFactory wiring and runtime smoke test.
- ✅ Inline Edit and Discover chat both produce responses via an OpenAI-compatible endpoint when base URL and model are configured. Manual/local validation.
- ✅ If the endpoint is unreachable, UI shows the same class of notices as existing providers, and no crashes occur. Added provider-specific messages for Discover/Edit views.
- ✅ No secrets are hardcoded; only base URL and model are required by this ticket. Configuration remains user-supplied.

## Non‑Goals
- API key management or headers (can be a follow‑up ticket).
- True SSE streaming for OpenAI endpoints.
- Model capability detection.

## Verification Steps
1. Set provider to “OpenAI‑compatible”; set base URL to a compatible server (no key required) and a valid model name.
2. Open Discover and send a prompt; confirm a response is appended.
3. Select text, run “Edit selection with AI”; confirm a suggestion callout appears.
4. Run `npm run headless:test` to ensure smoke tests still pass.

## Dependencies / Follow-ups
- Ticket 54 — OpenAI API key follow-up: remains open to supply auth headers for providers requiring keys; new adapter exposes `openAIUrl` hook these settings will use.

## Artifacts
- Local smoke run: `npm run headless:test` (PASS) (log: TODO)
