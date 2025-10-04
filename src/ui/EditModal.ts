import { App, Modal, TFile } from 'obsidian';

export interface EditModalOptions {
	selection: string;
	file: TFile;
	onSubmit: (instruction: string) => void;
}

const PRESETS = {
	rewrite: 'Rewrite this text to be clearer and more engaging.',
	tighten: 'Make this text more concise while preserving key information.',
	expand: 'Expand this text with more detail and examples.',
	grammar: 'Fix grammar, spelling, and punctuation errors.',
	translate: 'Translate this text to Spanish.',
};

/**
 * Modal for AI-powered text editing.
 * Provides preset actions and custom prompt input.
 * Default hotkey: Cmd/Ctrl+Shift+E (configurable in Settings → Hotkeys)
 */
export class EditModal extends Modal {
	private options: EditModalOptions;
	private instructionInput: HTMLTextAreaElement | null = null;
	private generateBtn: HTMLButtonElement | null = null;

	constructor(app: App, options: EditModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('vp-edit-modal');

		// Title
		contentEl.createEl('h2', { text: 'Edit with AI' });

		// Selection preview
		const preview = this.options.selection.slice(0, 200);
		const previewText = preview + (this.options.selection.length > 200 ? '…' : '');
		const previewEl = contentEl.createDiv({ cls: 'vp-selection-preview' });
		previewEl.createEl('strong', { text: 'Selected text:' });
		previewEl.createEl('p', { text: previewText });

		// Preset buttons
		const presetsEl = contentEl.createDiv({ cls: 'vp-presets' });
		presetsEl.createEl('strong', { text: 'Quick actions:' });

		const btnContainer = presetsEl.createDiv({ cls: 'vp-preset-buttons' });

		Object.entries(PRESETS).forEach(([key, instruction]) => {
			const btn = btnContainer.createEl('button', {
				cls: 'vp-preset-btn',
				text: this.capitalizeFirst(key),
			});
			btn.addEventListener('click', () => {
				if (this.instructionInput) {
					this.instructionInput.value = instruction;
					this.updateGenerateButton();
					this.instructionInput.focus();
				}
			});
		});

		// Custom prompt section
		const customEl = contentEl.createDiv({ cls: 'vp-custom-prompt' });
		customEl.createEl('strong', { text: 'Or describe what you want:' });

		this.instructionInput = customEl.createEl('textarea', {
			cls: 'vp-instruction-input',
			placeholder: 'Describe what you want to do...',
		});
		this.instructionInput.rows = 3;
		this.instructionInput.addEventListener('input', () => this.updateGenerateButton());
		this.instructionInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				this.handleSubmit();
			}
		});

		// Action buttons
		const actionsEl = contentEl.createDiv({ cls: 'vp-modal-actions' });

		const cancelBtn = actionsEl.createEl('button', {
			cls: 'vp-btn',
			text: 'Cancel',
		});
		cancelBtn.addEventListener('click', () => this.close());

		this.generateBtn = actionsEl.createEl('button', {
			cls: 'vp-btn vp-btn-primary',
			text: 'Generate',
		});
		this.generateBtn.disabled = true;
		this.generateBtn.addEventListener('click', () => this.handleSubmit());

		// Focus the instruction input
		setTimeout(() => this.instructionInput?.focus(), 10);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private updateGenerateButton() {
		if (this.generateBtn && this.instructionInput) {
			this.generateBtn.disabled = this.instructionInput.value.trim().length === 0;
		}
	}

	private handleSubmit() {
		if (!this.instructionInput) return;

		const instruction = this.instructionInput.value.trim();
		if (!instruction) return;

		this.options.onSubmit(instruction);
		this.close();
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
}
