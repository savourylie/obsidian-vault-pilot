import { App, Editor, Notice, EditorPosition } from 'obsidian';

export interface SuggestionOptions {
	original: string;
	suggestion: string;
	sources?: string[];
	selectionStart: EditorPosition;
	selectionEnd: EditorPosition;
}

/**
 * Handles rendering and interaction with AI suggestion callouts.
 * Inserts a markdown callout with diff view and interactive Apply/Discard buttons.
 */
export class SuggestionCallout {
	constructor(private app: App) {}

	/**
	 * Insert a suggestion callout into the editor.
	 * The callout is inserted after the current selection.
	 */
	insert(editor: Editor, options: SuggestionOptions): void {
		const { original, suggestion, sources, selectionStart, selectionEnd } = options;

		// Build callout markdown
		const sourcesText = sources && sources.length > 0
			? ` — Sources: ${sources.map(s => `[[${s}]]`).join(', ')}`
			: '';

		const callout = `
> [!ai-suggestion] AI Suggestion${sourcesText}
>
> **Original:**
> \`\`\`
> ${original}
> \`\`\`
>
> **Suggestion:**
> \`\`\`
> ${suggestion}
> \`\`\`
`;

		// Insert callout after the selection
		const insertPos = { line: selectionEnd.line + 1, ch: 0 };
		editor.replaceRange(callout, insertPos);

		// Schedule button attachment after Obsidian renders the callout
		// Try multiple times with increasing delays to ensure rendering is complete
		setTimeout(() => this.attachButtons(editor, options), 200);
		setTimeout(() => this.attachButtons(editor, options), 500);
		setTimeout(() => this.attachButtons(editor, options), 1000);
	}

	/**
	 * Attach interactive Apply/Discard buttons to the callout via DOM manipulation.
	 * Uses the last (most recent) ai-suggestion callout.
	 */
	private attachButtons(editor: Editor, options: SuggestionOptions): void {
		const { original, suggestion, selectionStart, selectionEnd } = options;

		// Find all callouts with ai-suggestion type
		const callouts = document.querySelectorAll('.callout[data-callout="ai-suggestion"]');

		console.log('VaultPilot: Found', callouts.length, 'ai-suggestion callouts');

		if (callouts.length === 0) {
			console.warn('VaultPilot: No ai-suggestion callouts found in DOM');
			return;
		}

		// Get the last (most recent) callout
		const targetCallout = callouts[callouts.length - 1];

		// Check if buttons already exist
		if (targetCallout.querySelector('.vp-suggestion-actions')) {
			console.log('VaultPilot: Buttons already attached to this callout');
			return;
		}

		console.log('VaultPilot: Attaching buttons to most recent callout');

		// Create action buttons
		const actionsDiv = document.createElement('div');
		actionsDiv.className = 'vp-suggestion-actions';

		const applyBtn = document.createElement('button');
		applyBtn.className = 'vp-btn vp-btn-primary vp-apply-btn';
		applyBtn.textContent = 'Apply';
		applyBtn.onclick = () => this.handleApply(editor, options);

		const discardBtn = document.createElement('button');
		discardBtn.className = 'vp-btn vp-discard-btn';
		discardBtn.textContent = 'Discard';
		discardBtn.onclick = () => this.handleDiscard(editor);

		actionsDiv.appendChild(applyBtn);
		actionsDiv.appendChild(discardBtn);

		// Append buttons to callout
		targetCallout.appendChild(actionsDiv);

		console.log('VaultPilot: Buttons attached successfully');
	}

	/**
	 * Handle Apply button click.
	 * Replaces the original selection with the suggestion.
	 */
	private handleApply(editor: Editor, options: SuggestionOptions): void {
		const { original, suggestion, selectionStart, selectionEnd } = options;

		// Verify the original text hasn't changed
		const currentText = editor.getRange(selectionStart, selectionEnd);
		if (currentText !== original) {
			new Notice('⚠️ Original text has changed. Cannot apply suggestion.');
			return;
		}

		// Replace the selection FIRST (while positions are still valid)
		editor.replaceRange(suggestion, selectionStart, selectionEnd);

		// Calculate the end position after replacement (handle multi-line text)
		const lines = suggestion.split('\n');
		const newEndPos = {
			line: selectionStart.line + lines.length - 1,
			ch: lines.length > 1 ? lines[lines.length - 1].length : selectionStart.ch + suggestion.length
		};

		// Set cursor to end of replaced text (prevents weird selection)
		editor.setCursor(newEndPos);

		// Then remove the callout (positions changed but we don't care)
		this.removeCallout(editor);

		new Notice('✓ Applied AI suggestion');
	}

	/**
	 * Handle Discard button click.
	 * Removes the callout without applying changes.
	 */
	private handleDiscard(editor: Editor): void {
		this.removeCallout(editor);
		new Notice('Suggestion discarded');
	}

	/**
	 * Remove the callout from the editor.
	 * Finds and removes the last ai-suggestion callout block.
	 */
	private removeCallout(editor: Editor): void {
		const content = editor.getValue();

		// Find the last occurrence of the ai-suggestion callout header
		const headerPattern = '> [!ai-suggestion]';
		let lastIndex = content.lastIndexOf(headerPattern);

		if (lastIndex === -1) {
			console.warn('VaultPilot: Could not find ai-suggestion callout to remove');
			return;
		}

		// Find the start of the line containing the header
		let startIndex = lastIndex;
		while (startIndex > 0 && content[startIndex - 1] !== '\n') {
			startIndex--;
		}

		// Find the end of the callout (first line that doesn't start with >)
		let endIndex = lastIndex;
		const lines = content.substring(startIndex).split('\n');
		let lineCount = 0;

		for (const line of lines) {
			if (lineCount > 0 && !line.startsWith('>') && line.trim() !== '') {
				break;
			}
			endIndex += line.length + 1; // +1 for newline
			lineCount++;
		}

		// Include trailing empty lines
		while (endIndex < content.length && content[endIndex] === '\n') {
			endIndex++;
		}

		// Calculate positions
		const startPos = editor.offsetToPos(startIndex);
		const endPos = editor.offsetToPos(endIndex);

		// Remove the callout
		editor.replaceRange('', startPos, endPos);
	}

}
