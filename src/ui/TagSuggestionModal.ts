import { App, Modal } from 'obsidian';

export interface TagSuggestionModalOptions {
	suggestions: string[];
	onConfirm: (selected: string[]) => void;
	title?: string;
}

export class TagSuggestionModal extends Modal {
	private options: TagSuggestionModalOptions;

	constructor(app: App, options: TagSuggestionModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('vp-tag-modal');

		contentEl.createEl('h2', { text: this.options.title || 'Suggested Hashtags' });

		const listEl = contentEl.createDiv({ cls: 'vp-tag-list' });
		const selected = new Set<string>(this.options.suggestions);

		for (const tag of this.options.suggestions) {
			const row = listEl.createDiv({ cls: 'vp-tag-row' });
			const label = row.createEl('label', { cls: 'vp-tag-label' });
			const input = document.createElement('input');
			input.type = 'checkbox';
			input.checked = true;
			input.addEventListener('change', () => {
				if (input.checked) selected.add(tag); else selected.delete(tag);
			});
			label.appendChild(input);
			const span = document.createElement('span');
			span.textContent = tag;
			label.appendChild(span);
		}

		const actions = contentEl.createDiv({ cls: 'vp-modal-actions' });
		const cancelBtn = actions.createEl('button', { cls: 'vp-btn', text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const insertBtn = actions.createEl('button', { cls: 'vp-btn vp-btn-primary', text: 'Insert' });
		insertBtn.addEventListener('click', () => {
			const out = Array.from(selected);
			try { this.options.onConfirm(out); } finally { this.close(); }
		});

		setTimeout(() => {
			try {
				const first = contentEl.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
				first?.focus?.();
			} catch {}
		}, 10);
	}

	onClose() {
		this.contentEl.empty();
	}
}

