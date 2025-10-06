# 35 — Suggest Tags (LLM + Fallback)

Goal
- Produce 3–5 candidate hashtags for the current note, preferring reuse of vault tags and avoiding duplicates already in the note.

Deliverables
- `suggestTags(app, content, opts, existingNoteTags?) => Promise<string[]>` with:
  - `opts.useLLM` (boolean), `opts.ollamaUrl`, `opts.model`, `opts.minSuggestions` (default 3), `opts.maxSuggestions` (default 5).
  - If `useLLM`: call `OllamaAdapter.generate` with a strict prompt to output only space-separated hashtags.
  - If the LLM call fails or yields fewer than `min`, fill via local keyword heuristic (token freq) and snap to vault tags when possible.
  - Normalize all outputs; dedupe; exclude tags already present in the note (inline or frontmatter).

Prompt (LLM)
- “Output only hashtags, space-separated; lowercase-dashes; prefer from this vault list: {vault_tags}; avoid these existing: {existing_note_tags}; return 3–5 that best fit. Document excerpt: {excerpt}”.

Acceptance Criteria
- With `useLLM=false`, function returns 3–5 normalized candidates from content; vault-known tags appear first.
- If the LLM throws/network fails, or returns content without valid `#hashtags` (or fewer than `min`), fallback still returns 3–5 tags.
- Existing note tags are not included in the returned list.

Notes
- Keep deterministic behavior for tests when `useLLM=false`.
- Slice vault list for prompt to a reasonable size (e.g., 200 tags) to avoid huge prompts.
