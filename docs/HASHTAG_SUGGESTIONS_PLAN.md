# Hashtag Suggestions Plan

Auto-generate and append hashtags at the bottom of the current note using: (1) the note’s content, (2) existing tags in the note, and (3) existing tags in the vault. Prefer reuse of vault tags; enforce lowercase and dashes; idempotent and safe.

## Decisions (Confirmed)
- Tag format: lowercase with dashes (kebab-case), e.g., `#project-x`.
- Default count: 3–5 tags per insert.
- Default flow: show confirmation modal before writing; append/merge at EOF only.
- Default hotkey: Mod+Shift+H (user can rebind). Also available via Cmd+P.
- Model: use the plugin’s default model (existing setting). LLM optional with graceful fallback.
- No frontmatter changes in v1 (only append/merge EOF tag line).

## Scope
- Append a single hashtag line at the end of the note: `#tag1 #tag2 #tag3`.
- If the last non-empty line already consists solely of hashtags, merge into that line (no duplicates).
- Prefer vault-known tags that match the content; avoid adding duplicates already present inline or in frontmatter.
- If LLM is unavailable, use a local keyword heuristic to still return 3–5 relevant tags.

Non-goals (v1):
- Do not modify YAML frontmatter `tags:` (can be a future toggle).
- Do not auto-write without confirmation (future “quick apply” command is optional).

## User Flow
1. User triggers “Suggest Hashtags for Current Note” (Cmd+P) or presses Mod+Shift+H.
2. Plugin collects: current note content, existing note tags (inline + frontmatter), and vault tag frequencies.
3. Suggestion engine:
   - If LLM enabled, call Ollama with a compact prompt to return only hashtags.
   - Else, use local keyword heuristics and prefer vault tags.
4. Normalize, dedupe, and pick 3–5 suggestions. Show confirmation modal with checkboxes (pre-selected).
5. On confirm, append/merge a single hashtag line at EOF. Show a Notice with the inserted tags.

## Architecture
- `TaggingService.ts`
  - `normalizeTag(tag)`: string → `#lowercase-dashes`; strips invalid characters.
  - `extractInlineTags(text)`: find inline `#tags` within the body.
  - `extractFrontmatterTags(text)`: parse YAML `tags:` (read-only, used only to avoid duplicates).
  - `scanVaultTags(app)`: scan all markdown files and count tag occurrences.
  - `suggestTags(app, content, opts, existing)`: returns 3–5 candidate tags.
    - LLM path: `OllamaAdapter.generate()` with strict instructions to output only space-separated hashtags.
    - Fallback: top keywords from content → normalized to tags → prefer those present in vault.
  - `mergeTagsIntoContent(content, tags)`: returns `{ content, changed }`, merging with an existing tag line or appending a new one (blank line + tags).

- `TagSuggestionModal.ts`
  - Minimal modal with a list of suggested tags (checkboxes). Buttons: “Insert” (primary) and “Cancel”.
  - Pre-select all suggestions; user can uncheck.

- `src/main.ts`
  - Command: `suggest-hashtags-current-note` (“Suggest Hashtags for Current Note”).
  - Default hotkey: Mod+Shift+H. Also appears in Cmd+P.
  - Handler: gather inputs → `TaggingService.suggestTags` → open modal → on confirm, call `mergeTagsIntoContent` and update editor.

## LLM Prompt (draft)
```
You generate hashtags for an Obsidian note.
Rules:
- Output only hashtags, space-separated. No explanations or punctuation.
- Use lowercase and dashes (kebab-case), e.g., #my-topic.
- Prefer reusing from this vault list when relevant: {vault_tags}
- Avoid duplicates already in the note: {existing_note_tags}
Return 3–5 tags that best fit the document.

Document excerpt:
{excerpt}
```
Parsing: split on whitespace; normalize each token as a tag; drop empties.

## Settings (v1)
- `tagSuggestions.useLLM` (boolean, default: true).
- `tagSuggestions.min` (number, default: 3).
- `tagSuggestions.max` (number, default: 5).
- `tagSuggestions.confirmBeforeInsert` (boolean, default: true).
- `tagSuggestions.model` (string, default: plugin default model; optional override).

## Edge Cases
- No active note or editor → Notice; no action.
- Empty note → fallback suggestions; still insert if any.
- Last line already has hashtags → merge (dedupe) rather than append a second line.
- Unicode or punctuation-heavy tokens → normalization drops invalid characters; skip empty results.
- LLM offline → fallback path produces 3–5 hashtags when possible.

## Testing Plan (Headless)
- Unit-ish tests for `TaggingService` functions in a headless script:
  - Extract existing inline/frontmatter tags.
  - Vault scan produces frequencies from multiple files.
  - Merge behavior: existing tag line vs no tag line; idempotency and dedupe.
  - Fallback suggestions work when LLM fails.
- Manual check: bind Mod+Shift+H, ensure modal appears and insertion merges correctly.

## Implementation Steps
1. Add `src/services/TaggingService.ts` with normalization, extraction, vault scan, LLM+fallback suggestion, and merge utilities.
2. Add `src/ui/TagSuggestionModal.ts` with basic checkbox UI and Insert/Cancel.
3. Wire command + handler + default hotkey in `src/main.ts`.
4. Add settings in `SerendipitySettingTab` under a new “Tag Suggestions” section.
5. Add a focused headless test script for tagging.
6. Verify locally with `npm run dev` and headless tests.

## Future (Optional)
- Toggle to also update YAML frontmatter `tags:` in addition to EOF line.
- “Quick Apply” command without modal.
- Include folder/topic-aware priors when vault tags are sparse.

