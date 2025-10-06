# 38 — Command Wiring: Suggest Hashtags

Goal
- Add a new command and default hotkey to invoke tag suggestion and insertion for the current note.

Deliverables
- In `src/main.ts`:
  - Command id: `suggest-hashtags-current-note`, name: “Suggest Hashtags for Current Note”.
  - Default hotkey: Mod+Shift+H.
  - Handler: get active `MarkdownView` and editor; read content; collect existing tags; call `suggestTags`; open `TagSuggestionModal`; on confirm, call `mergeTagsIntoContent` and update editor; show Notice with inserted tags.
  - Guard: if no active note/editor → Notice and return.

Acceptance Criteria
- Command appears in Cmd+P and hotkey triggers it.
- In a note with content, the modal lists 3–5 suggestions; selecting and confirming appends/merges EOF hashtag line and shows a Notice.
- Idempotent: re-running on a note that already has those tags does not duplicate them.

Notes
- Respect settings (Ticket 39). For v1, default: confirm modal on; use LLM if enabled; min=3, max=5.

