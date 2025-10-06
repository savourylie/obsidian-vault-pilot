# 40 — Headless Tests: Tagging

Goal
- Add focused headless tests to validate TaggingService behavior and EOF merge logic without Obsidian UI.

Deliverables
- New script: `scripts/tagging-test.js` that:
  1) Stubs `obsidian` via `scripts/mocks/obsidian.js`.
  2) Requires `main.js` (built) to access exported/attached helpers or loads `TaggingService` if exported.
  3) Unit-tests pure functions via direct import or a small local replica for the test (ok for headless).
  4) Asserts PASS/FAIL with process exit codes.

Test Cases
- normalizeTag: input variants → `#kebab-case` or empty.
- extractInlineTags and extractFrontmatterTags: multiple inputs return expected sets.
- mergeTagsIntoContent: empty note, text ending, and existing tag line — produce expected content and `changed` flag.
- suggestTags fallback (no LLM): returns 3–5 normalized tags; avoids duplicates from existing sets.

Acceptance Criteria
- Running `node scripts/tagging-test.js` prints PASS and exits 0.
- Future: wire into npm script (optional).

Notes
- Keep the test self-contained; avoid network calls (force LLM off).
- Keep console output minimal and clear.

