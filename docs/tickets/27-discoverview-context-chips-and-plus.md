# Ticket 27: DiscoverView context chips and “+” entrypoint (skeleton)

## Summary
Show attached context files as removable chips in DiscoverView and add a “+” button that opens a placeholder picker (to be replaced by Ticket 28).

## Changes
- DiscoverView UI
  - Render a context bar above messages with chips for each `contextFiles` path of the active session.
  - Chip content: `basename • path`, actions: click → open file, “×” → remove and save.
  - Add a “+” button that currently opens a minimal placeholder dialog listing recent `getMarkdownFiles()`.
- Wire remove handler to `SessionManager.removeContextFile()`; call `onSessionSave` after changes.

## Acceptance Criteria
- When session has `contextFiles`, chips appear and are removable.
- Clicking a chip opens the note in a new leaf.
- “+” shows a minimal picker (no search yet), selecting adds to `contextFiles`.
- No duplicates added; UI updates immediately.

## Test Ideas (Manual)
- Start a new session, attach via Ticket 26, verify chips are visible and behave as expected.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
