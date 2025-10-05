# Ticket 23: Edge Case — Recent Window Exceeds Budget

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** Ticket 22

## Description
Handle the case where the most recent `recentMessagesToKeep` messages alone exceed the token budget. Prefer to preserve immediacy by shrinking the keep window down to `minRecentMessagesToKeep`, and if still over, summarize parts of the recent window while keeping the last 1–2 turns verbatim.

## Acceptance Criteria
1. If recent window exceeds budget, reduce `keepN` down to `minRecentMessagesToKeep` as needed.
2. If still over after `keepN = minRecentMessagesToKeep`, summarize earlier parts of the recent window to fit.
3. As a last resort, produce a concise system summary of the entire chat and include only the current user message verbatim.
4. No crashes; history remains coherent; content is not dropped, only summarized.

## Implementation Details
- File: `src/services/ChatService.ts`
  - Extend `compactHistoryIfNeeded()` to:
    - Trim context to zero first.
    - Dynamically shrink `keepN` with re-estimation between steps.
    - Summarize inside the recent block when necessary.

## Tasks
- [x] Implement dynamic shrinking of recent window.
- [x] Implement targeted summarization within recent window if needed.

## Testing
- Create very large recent messages and confirm the budget is met while preserving at least `minRecentMessagesToKeep` or a concise system summary + current user message.

