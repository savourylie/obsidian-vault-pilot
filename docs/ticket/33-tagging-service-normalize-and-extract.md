# 33 — TaggingService: Normalize + Extract

Goal
- Implement core utilities to normalize tags and extract existing tags from a note body and frontmatter.

Deliverables
- `normalizeTag(tag: string): string` → `#lowercase-dashes` (returns empty string if nothing valid).
- `extractInlineTags(content: string): Set<string>` — find inline hashtags in body.
- `extractFrontmatterTags(content: string): Set<string>` — parse YAML `tags:` (read-only).

Details
- Normalization rules: strip leading `#`, trim, convert to lowercase, replace whitespace/underscores with dashes, keep only `[a-z0-9-]`, collapse `-+`, trim edge dashes, prefix with `#`.
- Inline detection: allow `#topic`, `#project-x`, ignore duplicates; basic regex is sufficient.
- Frontmatter detection: if file starts with `--- ... ---`, parse a simple `tags:` field in one of forms: `tags: a, b`, `tags: [a, b]`, or list `tags:` then `- a`.

Acceptance Criteria
- `normalizeTag('  #Project_X  ') === '#project-x'`.
- `extractInlineTags('Foo #Bar baz #bar #x-y')` returns `{'#bar', '#x-y'}`.
- Given frontmatter `---\ntags: [Project X, research]\n---`, `extractFrontmatterTags(...)` returns `{'#project-x', '#research'}`.
- Empty or invalid inputs return empty sets; functions are pure and side-effect free.

Notes
- No frontmatter editing in this ticket (read-only for duplicates filtering later).
- Keep functions small; no external deps.

