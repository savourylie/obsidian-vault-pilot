# 53 — Tag Suggestions: Ensure OpenAI‑Compatible Provider Path Works

Goal: Make sure the hashtag suggestion flow works with the new OpenAI‑compatible provider without assuming Ollama.

## Why
- `suggestTags` currently instantiates `OllamaAdapter` when no adapter is injected.
- In the app flow we already pass an adapter from `createAdapter(...)`, so behavior is correct, but the guard condition checks `options.ollamaUrl || options.llmAdapter` which is confusing/non‑generic.

## Scope
- Keep main flow injecting the adapter from settings (already done in `src/main.ts`).
- Make a small defensive tweak in `suggestTags` to decide LLM usage based only on `options.useLLM` and presence of an adapter, independent of Ollama URL.

## Proposed Changes
- `src/services/TaggingService.ts`
  - In `suggestTags(...)`, change the condition from:
    - `if (options.useLLM && (options.ollamaUrl || options.llmAdapter)) { ... }`
    - to: `if (options.useLLM && (options.llmAdapter || options.ollamaUrl)) { ... }`
  - Prefer `options.llmAdapter` over constructing an `OllamaAdapter`.
  - No change to outputs or fallbacks.

## Impacted Files
- `src/services/TaggingService.ts`

## Acceptance Criteria
- With provider set to OpenAI‑compatible, the “Suggest Hashtags” command:
  - Calls the injected adapter.
  - Produces non‑empty suggestions (given a reachable endpoint), or gracefully falls back to TF‑IDF/keywords on failure, without errors.
- Existing behavior for Ollama and LM Studio remains unchanged.

## Non‑Goals
- Changing the final number/quality of suggested tags.
- Adding a new UI for tag suggestions.

## Verification Steps
1. Set provider to OpenAI‑compatible and configure base URL/model.
2. Run the “Suggest Hashtags for Current Note” command on a note with content.
3. Verify suggestions appear and insertion flow works through `TagSuggestionModal`.
4. Repeat with provider set to Ollama and LM Studio to confirm no regressions.

