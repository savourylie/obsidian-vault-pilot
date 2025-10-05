# Ticket 20: Add Heuristic Token Estimator

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** Ticket 19

## Description
Add simple, dependency-free token estimation helpers in `ChatService` to budget the prompt length.

## Acceptance Criteria
1. `ChatService` exposes private helpers:
   - `estimateTokens(text: string): number`
   - `estimateMessagesTokens(messages: ChatMessage[]): number`
2. Estimator uses a reasonable heuristic (e.g., `Math.ceil(len / 4)` plus small overhead for labels/newlines).
3. No behavior change yet to compaction; functions are used in later tickets.

## Implementation Details
- File: `src/services/ChatService.ts`
  - Implement both helpers and unit-like internal usage points for future steps.
  - Keep functions pure and small.

## Tasks
- [x] Implement `estimateTokens()`.
- [x] Implement `estimateMessagesTokens()`.
- [x] Add minimal inline usage (e.g., temporary console checks) and remove after verification.

## Testing
- Manually compare estimates for short vs long strings and ensure monotonic behavior.

