# 36 — Merge Tags into Content (EOF Line)

Goal
- Append/merge a single hashtag line at the bottom of the note, enforcing idempotency and no duplicates.

Deliverables
- `mergeTagsIntoContent(content: string, tags: string[]): { content: string; changed: boolean }`.
  - Normalize and dedupe inputs.
  - Compute existing tags (inline + frontmatter) to avoid inserting duplicates.
  - If the last non-empty line is a pure hashtag line, merge into it; otherwise append a blank line + hashtag line.

Acceptance Criteria
- Empty note + `['#alpha']` → content becomes `#alpha`.
- Note ending in text → a blank line then `#alpha #beta` is appended.
- Note ending with `#alpha` + input `['#alpha', '#beta']` → resulting last line is `#alpha #beta` (no duplicates).
- `changed=false` if no new tags would be added.

Notes
- Keep body intact; only operate at the end. Do not modify frontmatter.
- Preserve a trailing newline in the final content.

