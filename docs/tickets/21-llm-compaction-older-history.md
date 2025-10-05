# Ticket 21: LLM Compaction of Older History into System Summary

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** Ticket 20

## Description
When the estimated tokens of the message history exceed the effective budget (`maxPromptTokens - reservedResponseTokens`), summarize all but the most recent `recentMessagesToKeep` messages into a single `system` message at the front of the history. Persist this change so sessions reload with the summary.

## Acceptance Criteria
1. On over-budget histories, older messages are replaced by a single `system` summary message plus the most recent `recentMessagesToKeep` messages.
2. The summary is produced via `adapter.generate()`; on error/offline, fallback to a truncated summary string.
3. The updated history is saved to the active session.
4. UI renders unchanged (system messages hidden in chat view).

## Implementation Details
- File: `src/services/ChatService.ts`
  - Add `private async compactHistoryIfNeeded(context: string)`; call it in `sendMessage()` immediately after pushing the user message and before building the prompt.
  - Summarization prompt: concise instruction to keep key facts, constraints, decisions, action items, unresolved questions; no invention.
  - If a previous `system` summary exists, include it as "Previous summary:" in the summarization input.
  - Always keep the last `recentMessagesToKeep` messages verbatim (this may be adjusted in Ticket 23 for edge cases).

## Tasks
- [x] Implement `compactHistoryIfNeeded(context)` covering the older→summary transformation.
- [x] Integrate call site in `sendMessage()`.
- [x] Persist via existing `saveToSession()`.

## Testing
- Create a long chat (simulate by pushing many messages), trigger compaction, and verify a single `system` message appears at index 0 with last N messages retained.
- Verify no UI changes in Discover panel.

