# Ticket 31: Attachment robustness on rename/delete

## Summary
Keep session attachments accurate when files are renamed or deleted in the vault.

## Changes
- `src/main.ts` vault events:
  - On `rename(oldPath, newPath)`: call `SessionManager.renameContextFile(oldPath, newPath)`.
  - On `delete(file)`: remove `file.path` from any session `contextFiles` or ignore during context assembly.
- Ensure DiscoverView re-renders chips when the active session’s attachments change.

## Acceptance Criteria
- Renaming an attached file updates the chip and the path shown in the context menu item behavior.
- Deleting an attached file removes the chip on next render and does not break prompt assembly.
- No stale paths remain in the active session after rename/delete.

## Test Ideas (Headless/Manual)
- Manual: attach, rename, and delete the file; confirm chips and logs.
- Headless: call the rename helper against mock session data and assert path substitution.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
