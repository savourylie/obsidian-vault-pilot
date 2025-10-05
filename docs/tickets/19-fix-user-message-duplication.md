# Ticket 19: Fix Duplicate Inclusion of Latest User Message

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** Ticket 18

## Description
Currently, `buildPrompt()` includes the latest user message twice: once in the history slice and again as the current input. Adjust the history section to exclude the just-added user message so it appears only once at the end.

## Acceptance Criteria
1. The prompt contains the latest user message exactly once.
2. Previous conversation still appears (recent history), but not the current user message.
3. No other behavior or formatting changes.

## Implementation Details
- File: `src/services/ChatService.ts`
  - In `buildPrompt(userMessage, context)`, build the history from `this.messages` excluding the last element (the current user message just pushed in `sendMessage()`).
  - Keep the rest of the rendering consistent, including role labels and newlines.

## Tasks
- [x] Adjust recent history slice to exclude the current user message.
- [x] Quick manual verification by logging the built prompt for a single turn.

## Testing
- Send a message and confirm the LLM receives only one instance of the current user message in the “User:” lines.

