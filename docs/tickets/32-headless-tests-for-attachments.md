# Ticket 32: Headless tests for context attachments

## Summary
Add/extend headless tests to exercise attachment-aware prompt assembly and persistence.

## Changes
- Add `scripts/headless-test-attachments.js` using the existing mocked Obsidian API in `scripts/mocks/obsidian.js`.
- Test cases:
  1) Attach two files; verify merged context includes both fenced blocks once.
  2) Duplicate attach attempts result in single inclusion.
  3) Large attachment: confirm `ChatService` logs show context trimmed.
  4) Rename scenario: run `renameContextFile()` before assembly and confirm updated fence path.
- Update `package.json` scripts with `headless:test:attachments`.

## Acceptance Criteria
- Running the test script prints PASS for the four scenarios.
- No reliance on network; use stub LLM adapter.

---
Related plan: `docs/CHAT_CONTEXT_ATTACHMENTS_PLAN.md`
