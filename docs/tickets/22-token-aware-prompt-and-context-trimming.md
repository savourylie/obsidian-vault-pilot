# Ticket 22: Token-Aware Prompt Assembly and Context Trimming

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** Ticket 21

## Description
Build the prompt to fit within the effective budget, reserving `reservedResponseTokens` headroom. Include optional context, a conversation summary (system), recent history (excluding the current user message), and the current user message once. Trim context token‑aware to fit the remaining budget after messages.

## Acceptance Criteria
1. Prompt token estimate never exceeds `maxPromptTokens - reservedResponseTokens`.
2. If context is large, it is trimmed to fit; if necessary, context may be reduced to empty.
3. The current user message is included exactly once at the end.
4. If a system summary exists, it's included as a "Conversation summary:" section.

## Implementation Details
- File: `src/services/ChatService.ts`
  - Update `buildPrompt()` to:
    - Use estimator to compute remaining budget and trim context accordingly.
    - Include system summary when present.
    - Exclude the just-added user message from the previous conversation section.

## Tasks
- [x] Make `buildPrompt()` token-aware and context-trimming.
- [x] Verify prompt assembly with and without context/summary.

## Testing
- With a large context string, confirm that the prompt estimate fits budget and context is trimmed.

