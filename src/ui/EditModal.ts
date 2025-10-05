import { App, Modal, TFile } from 'obsidian';

export interface EditModalOptions {
	selection: string;
	file: TFile;
	ollamaUrl?: string;
	onSubmit: (instruction: string, model: string) => Promise<void>;
	// Optional custom presets supplied by settings
	presets?: Record<string, string>;
}

const DEFAULT_PRESETS = {
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
	private cancelBtn: HTMLButtonElement | null = null;
	private isGenerating: boolean = false;
	private modelSelect: HTMLSelectElement | null = null;
	private presets: Record<string, string>;

	constructor(app: App, options: EditModalOptions) {
		super(app);
		this.options = options;
		this.presets = options.presets && Object.keys(options.presets).length > 0
			? options.presets
			: DEFAULT_PRESETS;
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

		Object.entries(this.presets).forEach(([key, instruction]) => {
			const btn = btnContainer.createEl('button', {
				cls: 'vp-preset-btn',
				text: this.capitalizeFirst(key),
			});
			btn.addEventListener('click', () => {
				if (this.instructionInput) {
					this.instructionInput.value = instruction;
					this.updateGenerateButton();
					this.instructionInput.focus();
					// Execute immediately when a quick action is clicked
					this.handleSubmit();
				}
			});
		});

		// Model selector
		const modelRow = contentEl.createDiv({ cls: 'vp-model-row' });
		modelRow.createEl('label', { cls: 'vp-model-label', text: 'Model' });
		this.modelSelect = modelRow.createEl('select', { cls: 'vp-model-select' }) as HTMLSelectElement;
		this.modelSelect.appendChild(new Option('Loading models…', '', false, false));
		this.modelSelect.disabled = true;
		this.modelSelect.addEventListener('change', () => {
			const m = this.modelSelect?.value || '';
			try { localStorage.setItem('vp-selected-model', m); } catch {}
			this.updateGenerateButton();
		});
		this.loadModels();

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

		this.cancelBtn = actionsEl.createEl('button', {
			cls: 'vp-btn',
			text: 'Cancel',
		});
		this.cancelBtn.addEventListener('click', () => this.close());

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

	private async handleSubmit() {
		if (!this.instructionInput || this.isGenerating) return;

		const instruction = this.instructionInput.value.trim();
		if (!instruction) return;
		const model = this.modelSelect?.value || '';

		// Set loading state
		this.isGenerating = true;
		if (this.generateBtn) {
			this.generateBtn.textContent = 'Generating...';
			this.generateBtn.disabled = true;
		}
		if (this.cancelBtn) {
			this.cancelBtn.disabled = true;
		}
		if (this.instructionInput) {
			this.instructionInput.disabled = true;
		}

		try {
			await this.options.onSubmit(instruction, model);
			this.close();
		} catch (err) {
			console.error('EditModal: Error during generation:', err);
			// Reset UI on error
			this.isGenerating = false;
			if (this.generateBtn) {
				this.generateBtn.textContent = 'Generate';
				this.generateBtn.disabled = false;
			}
			if (this.cancelBtn) {
				this.cancelBtn.disabled = false;
			}
			if (this.instructionInput) {
				this.instructionInput.disabled = false;
			}
		}
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	private async loadModels() {
		const baseUrl = (this.options.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
		const fallback = ['gemma3n:e2b', 'llama3.1:8b', 'qwen2.5:7b'];
		let models: string[] = [];
		try {
			const resp = await fetch(`${baseUrl}/api/tags`);
			if (resp.ok) {
				const data = await resp.json();
				if (Array.isArray(data?.models)) {
					models = data.models.map((m: any) => m.model || m.name).filter(Boolean);
				}
			}
		} catch (_) {}
		if (models.length === 0) models = fallback;

		if (!this.modelSelect) return;
		this.modelSelect.empty();
		for (const m of models) this.modelSelect.appendChild(new Option(m, m));

		let selected = '';
		try { selected = localStorage.getItem('vp-selected-model') || ''; } catch {}
		if (selected && models.includes(selected)) {
			this.modelSelect.value = selected;
		} else {
			this.modelSelect.selectedIndex = 0;
		}
		this.modelSelect.disabled = false;
	}
}
