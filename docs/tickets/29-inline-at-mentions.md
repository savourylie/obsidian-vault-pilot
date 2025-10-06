# Ticket 29: Inline "@" mentions for attaching notes

## Summary
Typing `@` in the chat input opens an anchored suggestion list to attach notes without leaving the keyboard.

## Changes
- Detect `@` trigger in the chat input of DiscoverView:
  - On key input, if substring after the last whitespace matches `/@\w*/`, open a suggestion popover near the caret.
  - Use the same `NoteSearchModal` data source but render as an anchored list.
  - Selecting an item attaches the file; optional setting to insert `@[[Title]]` text is deferred.
- Close on Escape, Enter (selection), or click outside.

## Acceptance Criteria
- Typing `@<query>` shows suggestions near the caret.
- Arrow keys navigate; Enter attaches the selected note and closes the list.
- No exceptions when typing fast or deleting `@`.

## Test Ideas (Manual)
- Stress test rapid typing/deletion; verify stable open/close and single attachment.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
