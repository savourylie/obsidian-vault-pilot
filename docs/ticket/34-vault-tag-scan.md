# 34 — Vault Tag Scan

Goal
- Build a helper to scan the vault and count tag occurrences to prefer reusing existing tags.

Deliverables
- `scanVaultTags(app: App): Promise<Map<string, number>>` — iterates markdown files and aggregates counts from both inline and frontmatter tags.

Acceptance Criteria
- With a headless setup of three notes containing overlapping tags, the map counts reflect total occurrences across notes (e.g., `#project-x: 2`, `#gardening: 1`).
- Skips non-markdown files; resilient if a read fails (continues scanning).

Notes
- Use the utilities from Ticket 33 to avoid duplication of parsing logic.
- Keep it efficient; single pass per file is fine for v1.

