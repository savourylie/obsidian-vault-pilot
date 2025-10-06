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
		const { original, suggestion, sources, selectionEnd } = options;

		// Build callout markdown
		const sourcesText = sources && sources.length > 0
			? ` — Sources: ${sources.map(s => `[[${s}]]`).join(', ')}`
			: '';

		const quoteLines = (text: string) => text.split('\n').map(l => `> ${l}`).join('\n');

		const callout = `> [!ai-suggestion] AI Suggestion${sourcesText}
>
> **Original:**
> \`\`\`
${quoteLines(original)}
> \`\`\`
>
> **Suggestion:**
> \`\`\`
${quoteLines(suggestion)}
> \`\`\`
`;

		// Insert callout after the selection
		const insertPos = { line: selectionEnd.line + 1, ch: 0 };
		editor.replaceRange(callout, insertPos);

		// Schedule button attachment after Obsidian renders the callout
		setTimeout(() => this.attachButtons(editor, options), 200);
		setTimeout(() => this.attachButtons(editor, options), 500);
		setTimeout(() => this.attachButtons(editor, options), 1000);
	}

	/**
	 * Attach interactive Apply/Discard buttons to the callout via DOM manipulation.
	 * Uses the last (most recent) ai-suggestion callout.
	 */
	private attachButtons(editor: Editor, options: SuggestionOptions): void {
		const callouts = document.querySelectorAll('.callout[data-callout="ai-suggestion"]');
		if (callouts.length === 0) return;
		const targetCallout = callouts[callouts.length - 1];
		if (targetCallout.querySelector('.vp-suggestion-actions')) return;

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
		targetCallout.appendChild(actionsDiv);
	}

	/**
	 * Handle Apply button click.
	 * Replaces the original selection with the suggestion.
	 */
	private handleApply(editor: Editor, options: SuggestionOptions): void {
		const { original, suggestion, selectionStart, selectionEnd } = options;

		const currentText = editor.getRange(selectionStart, selectionEnd);
		if (currentText !== original) {
			new Notice('⚠️ Original text has changed. Cannot apply suggestion.');
			return;
		}

		// Replace the selection first
		editor.replaceRange(suggestion, selectionStart, selectionEnd);

		// Compute the new cursor position after replacement
		const lines = suggestion.split('\n');
		const newEndPos = {
			line: selectionStart.line + lines.length - 1,
			ch: lines.length > 1 ? lines[lines.length - 1].length : selectionStart.ch + suggestion.length,
		};

		// Remove callout
		this.removeCallout(editor);

		setTimeout(() => {
			editor.focus();
			editor.setCursor(newEndPos);
		}, 50);

		new Notice('✓ Applied AI suggestion');
	}

	/**
	 * Handle Discard button click.
	 */
	private handleDiscard(editor: Editor): void {
		this.removeCallout(editor);
		new Notice('Suggestion discarded');
	}

	/**
	 * Remove the last ai-suggestion callout from the editor.
	 */
	private removeCallout(editor: Editor): void {
		const content = editor.getValue();

		// Detect last callout region: start at header, then consume contiguous '>' lines
		const headerPattern = '> [!ai-suggestion]';
		let hdrIndex = content.lastIndexOf(headerPattern);
		if (hdrIndex === -1) return;
		// Move to start of the header line
		let startIndex = hdrIndex;
		while (startIndex > 0 && content[startIndex - 1] !== '\n') startIndex--;

		// Walk forward until the first non-blockquote line
		let cursor = startIndex;
		while (cursor < content.length) {
			const nl = content.indexOf('\n', cursor);
			if (nl === -1) { cursor = content.length; break; }
			const nextStart = nl + 1;
			const nextChar = content.charAt(nextStart);
			if (nextStart >= content.length || nextChar !== '>') { cursor = nextStart; break; }
			cursor = nextStart;
		}
		const endIndex = cursor;

		const startPos = editor.offsetToPos(startIndex);
		const endPos = editor.offsetToPos(endIndex);
		editor.replaceRange('', startPos, endPos);

		// Defensive cleanup: remove any isolated leftover blockquote code fence lines
		const content2 = editor.getValue();
		const strayPattern = /^>\s*`{3}.*\n?/m;
		if (strayPattern.test(content2)) {
			editor.setValue(content2.replace(strayPattern, ''));
		}
	}
}
