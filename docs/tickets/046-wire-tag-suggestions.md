# Ticket 046 — Wire Tag Suggestions to Provider Adapter

- Type: integration
- Owner: @you
- Status: Ready

## Summary
Pass a provider-appropriate `llmAdapter` into `suggestTags()` so the LLM path works with LM Studio as well as Ollama. Preserve robust fallback behavior.

## Why
Tag suggestions currently assume Ollama when LLM is enabled.

## Scope
- `src/main.ts` when calling `suggestTags(...)`:
  - Construct adapter via factory and pass as `llmAdapter`.
  - Continue to pass max/min and model override.
- No changes to `TaggingService` logic; it already accepts `llmAdapter` and has TF‑IDF/keyword fallbacks.

## Out of Scope
- Changes to `TaggingService` internals.

## Acceptance Criteria
- With LLM enabled and provider server running, hashtags come from LLM output when valid; otherwise fallback.
- With server down or LLM disabled, fallback paths still work.

## Implementation Steps
1. Import factory in `src/main.ts` and pass adapter into `suggestTags` options.
2. Ensure no null pointer issues if adapter creation fails.

## Validation
- Manual with small notes; confirm tags are inserted or appropriate messages shown.

