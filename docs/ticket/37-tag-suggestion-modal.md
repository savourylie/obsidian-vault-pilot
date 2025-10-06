# 37 — Tag Suggestion Modal (Confirm Before Insert)

Goal
- Provide a simple confirmation modal that lists suggested tags with checkboxes and inserts selected ones.

Deliverables
- `TagSuggestionModal` in `src/ui/TagSuggestionModal.ts`:
  - Props: `{ app, suggestions: string[], onConfirm(selected: string[]): void }`.
  - Shows checkboxes (pre-checked) for each suggestion; buttons: “Insert” (primary) and “Cancel”.
  - Emits selected tags to `onConfirm`; modal closes on both actions.

Acceptance Criteria
- Modal renders with suggestions and allows deselecting.
- Clicking Insert calls `onConfirm` with only selected tags.
- Works in Obsidian runtime; no crash in headless builds (Modal stub present).

Notes
- Keep UI minimal; reuse existing styles where possible.
- Accessibility: ensure buttons are focusable; reasonable default focus.

