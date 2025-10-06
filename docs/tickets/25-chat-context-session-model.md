# Ticket 25: Session model for context attachments

## Summary
Extend chat sessions to persist attached context files. Provide helper methods in `SessionManager` and keep backward compatibility.

## Changes
- Types: add `contextFiles: string[]` to `ChatSession` (default `[]`).
- `SessionManager`:
  - `addContextFiles(sessionId: string, paths: string[])`
  - `removeContextFile(sessionId: string, path: string)`
  - `renameContextFile(oldPath: string, newPath: string)`
  - Ensure `export()`/`load()` include the new field.
- Migration: when loading legacy sessions, initialize `contextFiles` to `[]`.

## Acceptance Criteria
- Creating a new session sets `contextFiles` to an empty array.
- Adding/removing updates the active session and `saveSessions()` persists it.
- Renaming updates existing paths in the active session data structure (covered more in Ticket 31 but method exists here).
- No crashes if `contextFiles` is missing in old data.

## Test Ideas (Headless)
- Initialize `SessionManager` with legacy-shaped data (no `contextFiles`) and verify it reads and writes with `[]`.
- Add two paths (including a duplicate); verify it stores each path once.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
