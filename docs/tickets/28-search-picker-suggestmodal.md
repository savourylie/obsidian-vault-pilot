# Ticket 28: Searchable picker via SuggestModal ("+" button)

## Summary
Replace the placeholder picker with a `SuggestModal` that searches vault notes by title using `RetrievalService`.

## Changes
- Build `NoteSearchModal` extending `SuggestModal<string>`:
  - `getSuggestions(query)`: `RetrievalService.search(query, { limit: 20 })` → map to file paths.
  - `renderSuggestion(item, el)`: show title and short path.
  - `onChooseSuggestion(path)`: attach path → `SessionManager.addContextFiles()`.
- Wire “+” button to open `NoteSearchModal`.
- Guard against empty index; fallback to filtering `getMarkdownFiles()` by basename.

## Acceptance Criteria
- Typing in the modal filters results by title tokens with live updates.
- Selecting an item attaches it once and closes the modal.
- Works without prior indexing (fallback path) and shows no errors.

## Test Ideas (Manual)
- With and without the local index built, confirm search results and attachment behavior.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
