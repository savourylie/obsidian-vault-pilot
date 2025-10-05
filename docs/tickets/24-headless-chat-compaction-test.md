# Ticket 24: Headless Chat Compaction Test

**Phase:** 6 - Chat Windowing
**Status:** To Do
**Dependencies:** Ticket 23

## Description
Add a Node-based headless test script to validate windowing, compaction, and trimming using a stubbed LLM adapter. Print PASS/FAIL logs; no heavy test framework.

## Acceptance Criteria
1. New script `scripts/chat-window-test.js` runs via `npm run headless:test:chat`.
2. Uses a stub `LLMAdapter`:
   - `generate()` returns a deterministic summary string prefixed with `SUMMARIZED:`.
   - `stream()` returns a fixed response in chunks.
3. Covers scenarios: under budget, over budget (older→summary), recent window > budget, large context trimmed, summarization failure fallback.
4. Outputs clear PASS/FAIL lines, exits non-zero on failure.

## Implementation Details
- File: `scripts/chat-window-test.js`
  - Mimic the approach in `scripts/headless-test.js` but instantiate `ChatService` directly using the built bundle or by exporting it from the build (small export change allowed if needed).
  - Provide a simple harness to push messages, call `sendMessage()`, and inspect internal state via public getters.
- File: `package.json`
  - Add script: `headless:test:chat`.

## Tasks
- [ ] Add stub adapter and harness.
- [ ] Implement tests for the listed scenarios with PASS/FAIL logs.
- [ ] Add npm script.

## Testing
- Run `npm run headless:test:chat` and confirm all scenarios print PASS and exit code is 0.

