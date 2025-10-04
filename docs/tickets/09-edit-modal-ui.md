# Ticket 9: Edit Modal UI

**Phase:** 4 - Inline Edit (⌘-⌥-K) with Ollama
**Status:** Done
**Dependencies:** None (UI only; integration in Ticket #11)

## Description

Create the user-facing modal that opens when the user presses `⌘-⌥-K`. The modal provides preset editing actions and a custom prompt input. This ticket focuses on the UI and modal lifecycle; integration with LLM and callout rendering happens in Ticket #11.

## Acceptance Criteria

1. `EditModal` class created in `src/ui/EditModal.ts`, extends `Modal`.
2. Modal opens when `⌘-Shift-E` is pressed with text selected (configurable in Settings → Hotkeys).
3. Modal displays:
   - Title: "Edit with AI"
   - Preview of selected text (truncated to ~200 chars)
   - Preset action buttons: **Rewrite**, **Tighten**, **Expand**, **Fix Grammar**, **Translate**
   - Custom prompt textarea (placeholder: "Describe what you want to do...")
   - **Generate** button (primary action)
   - **Cancel** button
4. Clicking a preset button populates the custom prompt field with that preset.
5. **Generate** button is disabled until either a preset is selected or custom prompt is entered.
6. Modal validates text selection exists before opening (show Notice if not).
7. Modal passes selected text, file, and instruction to a callback on submit.
8. Pressing `Escape` or clicking `Cancel` closes the modal.
9. Modal is keyboard-accessible (Tab navigation, Enter to submit).

## Implementation Details

### Preset Instructions
```typescript
const PRESETS = {
	rewrite: "Rewrite this text to be clearer and more engaging.",
	tighten: "Make this text more concise while preserving key information.",
	expand: "Expand this text with more detail and examples.",
	grammar: "Fix grammar, spelling, and punctuation errors.",
	translate: "Translate this text to [language]." // User fills in language
};
```

### Interface
```typescript
export interface EditModalOptions {
	selection: string;
	file: TFile;
	onSubmit: (instruction: string) => void;
}

export class EditModal extends Modal {
	constructor(app: App, private options: EditModalOptions) {
		super(app);
	}

	onOpen(): void {
		// Build UI
	}

	onClose(): void {
		// Cleanup
	}
}
```

## Tasks

- [ ] Create `src/ui/EditModal.ts` extending `Modal`.
- [ ] Implement `onOpen()` to build the modal UI:
  - Title element
  - Selection preview (truncated)
  - Preset buttons (use `createEl('button')`)
  - Custom prompt textarea
  - Generate + Cancel buttons
- [ ] Wire preset buttons to populate textarea.
- [ ] Wire Generate button to call `options.onSubmit(instruction)` and close modal.
- [ ] Add validation for empty instruction (disable Generate button).
- [ ] Implement `onClose()` cleanup.
- [ ] Update `src/main.ts` command callback:
  - Check for active MarkdownView
  - Get text selection via `editor.getSelection()`
  - Show Notice if no selection
  - Open `EditModal` with selection and file
- [ ] Add basic CSS for modal layout in `styles.css` (`.vp-edit-modal` class).

## Testing

### Manual Test
1. Build plugin: `npm run dev`
2. In Obsidian, select some text in a note
3. Press `⌘-⌥-K`
4. Verify modal opens with:
   - Selected text preview
   - Preset buttons
   - Custom prompt field
5. Click **Rewrite** preset → verify textarea populates
6. Type custom instruction → verify Generate button enables
7. Click Generate → verify modal closes and `onSubmit` is called (log to console)
8. Press `⌘-⌥-K` with no selection → verify Notice appears

## Success Metrics

- Modal opens and displays correctly
- Preset buttons populate textarea
- Generate button validation works
- Keyboard navigation works (Tab, Enter, Escape)
- No console errors

## Notes

- Keep UI simple and clean (follow Obsidian's design language)
- Use Obsidian's `Setting` class for form elements if applicable
- Future: add a "Show Context" toggle to preview retrieved snippets (Ticket #8 integration)
