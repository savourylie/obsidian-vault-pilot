# Ticket 26: File Explorer “Add to Assistant Context”

## Summary
Add a context menu action in the File Explorer to attach a file to the active Assistant Chat session.

## Changes
- In `src/main.ts`, register `app.workspace.on('file-menu', (menu, file) => { ... })`.
- Add a menu item: “Add to Assistant Context”.
- On click:
  - Resolve active Discover view/session.
  - Call `SessionManager.addContextFiles(activeSessionId, [file.path])`.
  - Trigger `saveSessions()` and show a `Notice`.
- Guard null leaves and absent Discover view.

## Acceptance Criteria
- Right‑clicking a markdown note shows the menu item.
- Clicking the action adds the file path to the active session’s `contextFiles` (no duplicates).
- A success `Notice` appears; logs show the updated session.
- No errors when Discover view or session is not available (menu item disabled or shows an informative `Notice`).

## Test Ideas (Headless/Manual)
- Manual: add via context menu, reopen the panel, verify chips appear once Ticket 27 lands.
- Headless: simulate calling a small exported handler with a mock `TFile` and confirm `SessionManager` state updates.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
