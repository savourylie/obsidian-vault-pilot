# Ticket 041 — Implement LMStudioAdapter (OpenAI-compatible)

- Type: feature
- Owner: @you
- Status: Ready

## Summary
Add `src/llm/LMStudioAdapter.ts` implementing `LLMAdapter` using LM Studio’s OpenAI-compatible Chat Completions API for both non-streaming and streaming generation.

## Why
We need a provider-specific adapter to decouple UI from LM-specific APIs and reuse our existing `LLMAdapter` interface.

## Scope
- Create `LMStudioAdapter` with:
  - `constructor(baseUrl = 'http://localhost:1234', defaultModel = 'gpt-3.5-turbo')` (model is placeholder; actual list comes from server).
  - `generate(prompt, { model, temperature })`: POST `{baseUrl}/v1/chat/completions` (non-streaming).
  - `stream(prompt, onChunk, { model, temperature, signal })`: same endpoint with `stream: true`; parse SSE (`data: ...`) and emit `delta.content` until `[DONE]`.
- Handle network and JSON errors gracefully; surface clear messages.

## Out of Scope
- Wiring into Discover/Edit/Settings.
- Model listing.

## Acceptance Criteria
- TypeScript compiles with no errors.
- `generate` returns a string (empty string on no content).
- `stream` invokes `onChunk` as SSE deltas arrive and resolves on `[DONE]`.
- No changes to existing Ollama behavior.

## Implementation Steps
1. Add new file `src/llm/LMStudioAdapter.ts` implementing `LLMAdapter`.
2. Implement SSE reader using `ReadableStreamDefaultReader` and `TextDecoder`.
3. Parse lines prefixed with `data:`; ignore keep-alives/empty lines; stop on `[DONE]`.
4. Export class for use by later tickets.

## Validation
- `npm run build` or `npm run dev` compiles.
- (Optional) Local manual test with LM Studio Local Server enabled; verify streaming works.

