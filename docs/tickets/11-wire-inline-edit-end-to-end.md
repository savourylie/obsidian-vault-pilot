# Ticket 11: Wire Inline Edit End-to-End

**Phase:** 4 - Inline Edit (⌘-⌥-K) with Ollama
**Status:** Done
**Dependencies:** Tickets #7, #8, #9, #10

## Description

Integrate all components (OllamaAdapter, ContextAssembler, EditModal, SuggestionCallout) into a complete end-to-end flow. When the user presses `⌘-⌥-K`, selects an action, and clicks Generate, the plugin should retrieve context, call Ollama, stream the response, display a diff, and allow the user to apply the suggestion.

## Acceptance Criteria

1. Pressing `⌘-⌥-K` with text selected opens the EditModal.
2. User selects a preset or types a custom instruction → clicks **Generate**.
3. Modal shows loading state ("Generating...") and disables buttons.
4. `ContextAssembler` retrieves relevant snippets and formats the prompt.
5. `OllamaAdapter` streams the response from Ollama.
6. As response streams, display progress indicator (spinner or streaming text preview).
7. When complete, modal closes and `SuggestionCallout` is inserted below the selection.
8. Callout displays original text, AI suggestion, and diff.
9. User clicks **Apply** → original text is replaced, callout is removed.
10. User clicks **Discard** → callout is removed without changes.
11. Error handling:
    - Ollama not running → show Notice: "Could not connect to Ollama. Is it running?"
    - Network error → show Notice with error message
    - Empty response → show Notice: "No suggestion generated"
    - User cancels during streaming → abort request gracefully
12. All actions are undoable (Cmd+Z).

## Implementation Details

### Flow
```
User presses ⌘-⌥-K
  ↓
EditModal opens
  ↓
User selects preset/instruction → clicks Generate
  ↓
Modal shows loading state
  ↓
ContextAssembler.assembleContext(selection, file, instruction)
  ↓
OllamaAdapter.stream(prompt, onChunk, options)
  ↓
Stream chunks → accumulate in buffer
  ↓
On complete → close modal
  ↓
SuggestionCallout.insert(editor, { original, suggestion })
  ↓
User clicks Apply → editor.replaceRange(suggestion)
  ↓
Done
```

### Integration in `src/main.ts`
```typescript
// In onload(), update ai-edit-selection callback:
this.addCommand({
	id: 'ai-edit-selection',
	name: 'Edit selection with AI',
	hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'k' }],
	callback: () => this.handleAIEdit(),
});

async handleAIEdit() {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) return;
	const editor = view.editor;
	const selection = editor.getSelection();
	if (!selection) {
		new Notice('Select some text first');
		return;
	}

	const file = view.file;
	if (!file) return;

	new EditModal(this.app, {
		selection,
		file,
		onSubmit: async (instruction) => {
			await this.generateSuggestion(editor, file, selection, instruction);
		}
	}).open();
}

async generateSuggestion(
	editor: Editor,
	file: TFile,
	selection: string,
	instruction: string
) {
	const assembler = new ContextAssembler(this.app, this.retrievalService);
	const prompt = assembler.assembleContext(selection, file, instruction);

	const adapter = new OllamaAdapter(this.settings.ollamaUrl);
	const chunks: string[] = [];

	try {
		await adapter.stream(prompt, (chunk) => {
			chunks.push(chunk);
		});

		const suggestion = chunks.join('');
		if (!suggestion) {
			new Notice('No suggestion generated');
			return;
		}

		const callout = new SuggestionCallout(this.app);
		callout.insert(editor, {
			original: selection,
			suggestion,
			selectionStart: editor.getCursor('from'),
			selectionEnd: editor.getCursor('to'),
		});
	} catch (err) {
		console.error('AI Edit error:', err);
		new Notice('Could not connect to Ollama. Is it running?');
	}
}
```

## Tasks

- [ ] Update `src/main.ts`:
  - Import all components (OllamaAdapter, ContextAssembler, EditModal, SuggestionCallout)
  - Implement `handleAIEdit()` method
  - Implement `generateSuggestion()` method
  - Wire command callback to `handleAIEdit()`
- [ ] Add loading state to EditModal:
  - Disable buttons during generation
  - Show spinner or "Generating..." text
  - Support cancellation (AbortController)
- [ ] Add error handling:
  - Catch Ollama connection errors
  - Catch empty responses
  - Catch selection mismatch errors
- [ ] Test end-to-end flow:
  1. Select text → press ⌘-⌥-K
  2. Choose preset → click Generate
  3. Verify loading state
  4. Verify callout insertion
  5. Click Apply → verify text replaced
  6. Test Undo (Cmd+Z)
- [ ] Add cancellation support:
  - Add "Cancel" button during generation
  - Abort fetch request with AbortController
  - Show Notice: "Generation cancelled"

## Testing

### Prerequisites
1. Ollama is running: `ollama serve`
2. Model is available: `ollama pull llama3.2`
3. Plugin is loaded in Obsidian

### Manual Test
1. Select a paragraph in a note
2. Press `⌘-⌥-K`
3. Click **Rewrite** → **Generate**
4. Wait for streaming to complete
5. Verify callout appears with diff
6. Click **Apply**
7. Verify text is replaced
8. Press `Cmd+Z` → verify undo works
9. Repeat with **Tighten**, **Expand**, custom prompt

### Error Tests
1. Stop Ollama → press ⌘-⌥-K → Generate
   - Verify error Notice appears
2. Select very long text (>5000 chars) → Generate
   - Verify graceful handling (truncation or error)
3. Edit selection before clicking Apply
   - Verify mismatch warning or graceful degradation

## Success Metrics

- End-to-end flow works without errors
- Streaming is smooth (no lag or freezing)
- Callout displays correctly with diff
- Apply/Discard work as expected
- Undo works (changes on undo stack)
- Error states are handled gracefully
- No console errors in production usage

## Notes

- Consider adding a progress bar or streaming preview in the modal
- Future: support cancellation mid-stream (show partial result)
- Future: retry on failure (exponential backoff)
- Future: add telemetry (local-only) for success/failure rates
- Document required Ollama setup in README

## Completion Criteria for Ticket #4

Once this ticket is done, Ticket #4 (Inline Edit with Ollama) is complete. All acceptance criteria from the original ticket will be satisfied:

✅ Pressing ⌘-⌥-K opens modal
✅ Modal has preset actions and custom prompt
✅ OllamaAdapter streams responses
✅ ContextAssembler retrieves context
✅ Response streams into callout
✅ Diff is displayed
✅ Apply button replaces text (undoable)
✅ Settings tab has Ollama URL config
