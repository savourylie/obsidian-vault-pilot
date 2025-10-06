# Plan: Context File Attachments in Assistant Chat

## Summary
Add the ability to attach one or more vault notes as context for the Assistant Chat. Users can:
- Click a “+” button in the chat to open a searchable dropdown and pick notes by title.
- Type "@" in the chat input to trigger an inline, type-ahead note picker.
- Right‑click files in the File Explorer and choose “Add to Assistant Context”.

Attached notes persist per chat session, display as removable chips, and are merged into the prompt context with BEGIN/END file fences. Token‑aware trimming stays in `ChatService`.


## Goals
- Fast, keyboard-friendly context picking via “+” and inline "@" mentions.
- Persist attachments per session and avoid duplicates.
- Keep prompt assembly simple: concatenate selected files and let existing token windowing handle trimming.
- Non‑destructive integration with current architecture and styles.


## Related Code
- Chat send pipeline: `src/ui/DiscoverView.ts:350`
- Chat prompt assembly + trimming: `src/services/ChatService.ts:92`
- Sessions persistence: `src/services/SessionManager.ts:19`
- Retrieval (title/text search): `src/services/RetrievalService.ts:12`
- Index data: `src/services/IndexingService.ts:1`
- Main plugin + vault events: `src/main.ts:140`


## UX
- “+” Button (header, next to model selector or input)
  - Opens a searchable dropdown (modal or anchored popover) with multi-select.
  - Shows top results by title, path, and recency; Enter to confirm selection.
- Inline "@" Mentions
  - When the user types `@` in the chat input, open an anchored suggestion list near the caret.
  - Results filter live by title tokens; arrow keys navigate; Enter inserts `@[[Title]]` (or immediately attaches without inserting text, per setting).
- Context Chips
  - Attached files appear above the input as chips: `Title • path` with an “×” to remove.
  - Clicking a chip opens the note in a new leaf.
- File Explorer Context Menu
  - Right‑click note → “Add to Assistant Context” to attach to the active chat session.


## Data Model & Persistence
- Extend `ChatSession` with `contextFiles: string[]` (paths). Backward compatible default `[]`.
- `SessionManager` helpers:
  - `addContextFiles(sessionId, paths: string[])`
  - `removeContextFile(sessionId, path: string)`
  - `renameContextFile(oldPath, newPath)` (used by vault `rename` event)
- Persist via existing `SessionManager.export()` and plugin `saveSessions()`.


## Search & Results
- Use `RetrievalService.search(query, { limit })` to power both the “+” picker and inline `@` suggestions.
- Match on title tokens first; optionally boost recent files (simple timestamp sort or `IndexingService` metadata when available).
- Filter to markdown files; allow duplicates across titles but dedupe by path when attaching.


## Prompt Assembly
- Before `ChatService.sendMessage()` in `DiscoverView`, build a single context string:
  - Optional: include active note content (current behavior).
  - For each attached file (unique paths): read content via `app.vault.read(file)`.
  - Concatenate with fences:
    - `--- BEGIN FILE: <path> ---\n<content>\n--- END FILE ---\n\n`
- Pass this string as `context` to `sendMessage()`; trimming occurs in `ChatService`.
- Existing token budgeting is preserved; logs already indicate trimming decisions.


## Events & Idempotency
- Vault events already handled in `src/main.ts:140` for index updates. Add:
  - On `rename`: call `SessionManager.renameContextFile(oldPath, newPath)` to keep attachments valid.
  - On `delete`: silently drop missing paths from the active session when assembling context.
- Prevent duplicate attachments by checking membership before push.


## UI Integration
- DiscoverView
  - Add a context bar above the messages list showing chips for `contextFiles`.
  - Add a “+” button that opens a `SuggestModal`-based picker using `RetrievalService.search()`.
  - Detect `@` in the input; on `@` + text, show inline `SuggestModal` anchored to caret. Close on escape or blur.
  - Persist session after attach/remove actions via the provided `onSessionSave` callback.
- Main
  - Register `app.workspace.on('file-menu', (menu, file) => { ... })` to add “Add to Assistant Context”. Route to the active DiscoverView session.


## Acceptance Criteria
- “+” opens a searchable dropdown; selecting items attaches them and shows chips.
- Typing `@<query>` shows an inline suggestion list; selecting attaches the file.
- Right‑click file → “Add to Assistant Context” attaches to the active chat session.
- Prompt includes attached files once, with BEGIN/END fences and paths.
- Token trimming works unchanged; large attachments get trimmed (log shows trim info).
- Attachments persist across reloads; renames update automatically.


## Implementation Tasks
1) Data model
- Add `contextFiles: string[]` to `ChatSession` with migration defaults.
- Add helpers in `SessionManager` for add/remove/rename and export.

2) File explorer menu
- Handle `file-menu` in `main.ts` and wire to active session.

3) UI: chips and actions
- DiscoverView: render chips, remove handler, open file on click.
- Add “+” button and `SuggestModal`-backed picker.
- Inline `@` mention detector + anchored suggestions.

4) Context assembly
- Read attached files + active note; dedupe; fence; pass to `sendMessage()`.

5) Rename/delete robustness
- Update attachments on rename; ignore missing paths when assembling context.

6) Tests (headless)
- Extend headless tests to stub reads for multiple files and verify:
  - Attach → present in prompt once
  - Large attachments → trimmed, no duplication
  - Rename → attachment path updated


## Edge Cases
- Non‑markdown files: exclude from pickers.
- Very large files: allow attach but rely on trimming; optional size notice in UI.
- No index yet: fallback to listing `app.vault.getMarkdownFiles()` and local filtering by title.
- Multiple Discover views: operate on the active Discover view’s session only.


## Future Enhancements
- Show token cost estimates per attachment in the picker.
- Attachment presets (“named scopes”) tying into Ticket 5 context scoping.
- Inline preview on hover for suggestion items.
- Keyboard shortcut to toggle the attachments bar.

