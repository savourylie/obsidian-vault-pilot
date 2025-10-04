# Ticket 10: Suggestion Callout Rendering & Apply Logic

**Phase:** 4 - Inline Edit (⌘-⌥-K) with Ollama
**Status:** Done
**Dependencies:** None (standalone UI component)

## Description

Implement the "Suggestions Sandbox" callout block that displays AI-generated text with a diff view and an Apply button. The callout is inserted into the active note below the user's selection, providing a safe preview before applying changes.

## Acceptance Criteria

1. `SuggestionCallout` class created in `src/ui/SuggestionCallout.ts`.
2. Inserts a `> [!ai-suggestion]` callout block into the active note.
3. Callout displays:
   - Header: "AI Suggestion" with source citations (if available)
   - Original text (user's selection)
   - AI-generated suggestion
   - Unified diff view (+ additions, - deletions)
   - Action buttons: **Apply**, **Discard**
4. Diff is generated using the `diff` npm package (or `diff-match-patch`).
5. **Apply** button:
   - Replaces the original selection with the AI suggestion
   - Uses `editor.replaceRange()` to preserve undo history
   - Removes the callout after applying
   - Shows Notice: "Applied AI suggestion"
6. **Discard** button removes the callout without applying changes.
7. Callout is inserted at the end of the current paragraph or line.
8. Handles edge cases:
   - Selection was deleted/modified before applying (detect and warn)
   - Very long diffs (truncate or scroll)

## Implementation Details

### Callout Format
```markdown
> [!ai-suggestion] AI Suggestion — Sources: [[Note A]], [[Note B]]
>
> **Original:**
> ```
> This is the original text that the user selected.
> ```
>
> **Suggestion:**
> ```
> This is the AI-generated replacement text.
> ```
>
> **Diff:**
> ```diff
> - This is the original text that the user selected.
> + This is the AI-generated replacement text.
> ```
>
> <button class="vp-apply-btn">Apply</button> <button class="vp-discard-btn">Discard</button>
```

**Note:** Obsidian callouts don't support interactive buttons inside markdown. Instead, we'll insert the callout as markdown and add interactive elements via DOM manipulation.

### Alternative Approach (DOM-based)
- Insert a plain callout with diff as markdown
- Add a `.vp-suggestion-actions` div below the callout
- Attach click handlers to Apply/Discard buttons

### Interface
```typescript
export interface SuggestionOptions {
	original: string;
	suggestion: string;
	sources?: string[];
	selectionStart: { line: number; ch: number };
	selectionEnd: { line: number; ch: number };
}

export class SuggestionCallout {
	constructor(private app: App) {}

	insert(
		editor: Editor,
		options: SuggestionOptions
	): void

	private generateDiff(original: string, suggestion: string): string
}
```

## Tasks

- [ ] Install `diff` package: `npm install diff` (and `@types/diff` as devDependency).
- [ ] Create `src/ui/SuggestionCallout.ts` with class skeleton.
- [ ] Implement `generateDiff()` using `diff.createPatch()` or `diff.diffLines()`.
- [ ] Implement `insert()` method:
  - Build callout markdown with original, suggestion, and diff
  - Insert at cursor position or end of paragraph
  - Attach interactive buttons via DOM manipulation
- [ ] Implement Apply button logic:
  - Find original selection in editor (verify it hasn't changed)
  - Replace with `editor.replaceRange(suggestion, start, end)`
  - Remove callout
  - Show success Notice
- [ ] Implement Discard button logic:
  - Remove callout
  - Show Notice: "Suggestion discarded"
- [ ] Add CSS for buttons in `styles.css`:
  - `.vp-apply-btn` (primary action)
  - `.vp-discard-btn` (secondary action)
- [ ] Add error handling for selection mismatch (user edited text before applying).

## Testing

### Manual Test
1. In Obsidian, manually insert a test callout using `SuggestionCallout.insert()`.
2. Verify callout displays with:
   - Original text
   - Suggestion text
   - Diff view (+ and - lines)
   - Apply and Discard buttons
3. Click **Apply** → verify:
   - Original text is replaced with suggestion
   - Callout is removed
   - Success Notice appears
   - Undo (Cmd+Z) reverts the change
4. Insert another callout → click **Discard** → verify callout is removed

### Headless Test (optional)
- Mock `Editor` object and verify `replaceRange()` is called with correct arguments

## Success Metrics

- Callout renders correctly in Obsidian
- Diff is readable and accurate
- Apply button replaces text successfully
- Undo works (changes are on the undo stack)
- Discard removes callout
- No console errors

## Notes

- Use `diff.createPatch()` for unified diff format (most readable)
- Future: support "partial apply" for multi-chunk diffs (select which changes to apply)
- Future: add syntax highlighting to diff view (requires custom renderer)
- Consider using `editor.getCursor()` to determine insertion position (after selection or at end of line)
