# 39 — Settings: Tag Suggestions

Goal
- Add a settings section to configure tag suggestion behavior.

Deliverables
- In `SerendipitySettingTab.display()` add section “Tag Suggestions” with:
  - `Use LLM for tag suggestions` (boolean, default: true).
  - `Min suggestions` (number, default: 3).
  - `Max suggestions` (number, default: 5).
  - `Confirm before inserting` (boolean, default: true).
  - Optional `Model override` (string) — if empty, fall back to plugin default model.
- Persist in plugin settings object and save on change.

Acceptance Criteria
- Settings appear and persist across reloads.
- Command (Ticket 38) reads these settings to drive behavior.

Notes
- Keep labels concise; add brief descriptions.
- Validate: `1 ≤ min ≤ max ≤ 10` (or a reasonable upper bound) to prevent accidental extremes.

