# Ticket 30: Prompt assembly for attached files

## Summary
Merge attached files into the `context` string passed to `ChatService.sendMessage()`, keeping token-aware trimming unchanged.

## Changes
- DiscoverView: before calling `chatService.sendMessage(message, context, ...)`:
  - Read the active note content (current behavior).
  - Read each path in `contextFiles` via `app.vault.getAbstractFileByPath` + `read`.
  - Dedupe identical paths, ignore missing files.
  - Concatenate with fences per file:
    - `--- BEGIN FILE: <path> ---\n<content>\n--- END FILE ---\n\n`
  - Pass the merged string as `context`.
- Log included file counts and character length for debugging.

## Acceptance Criteria
- When attachments exist, context passed to `ChatService` includes them once, fenced with their paths.
- Missing/renamed files don’t throw; they’re skipped with a log.
- Large attachments show trimming logs from `ChatService` as usual.

## Test Ideas (Headless)
- Stub vault reads for multiple files; verify the built context string contains both fences and content snippets once.
- Ensure duplicates are removed before read.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
