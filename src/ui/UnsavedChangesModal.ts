import { App, Modal } from 'obsidian';

export type UnsavedChangesChoice = 'save' | 'discard' | 'cancel';

export class UnsavedChangesModal extends Modal {
	private resolveChoice: ((choice: UnsavedChangesChoice) => void) | null = null;
	private settled = false;
	private readonly message: string;

	constructor(app: App, message?: string) {
		super(app);
		this.message = message || 'You have unsaved changes to this LLM profile.';
	}

	static prompt(app: App, message?: string): Promise<UnsavedChangesChoice> {
		return new Promise((resolve) => {
			const modal = new UnsavedChangesModal(app, message);
			modal.resolveChoice = resolve;
			modal.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Unsaved Changes' });
		contentEl.createEl('p', { text: this.message });

		const actions = contentEl.createDiv({ cls: 'vp-modal-actions' });
		this.createActionButton(actions, 'Save', 'save');
		this.createActionButton(actions, 'Discard', 'discard');
		this.createActionButton(actions, 'Cancel', 'cancel');
	}

	onClose() {
		this.contentEl.empty();
		if (!this.settled) {
			this.finish('cancel');
		}
	}

	private createActionButton(
		container: HTMLElement,
		label: string,
		choice: UnsavedChangesChoice
	) {
		const button = container.createEl('button', { text: label });
		if (choice === 'save') {
			button.addClass('mod-cta');
		}
		button.addEventListener('click', () => {
			this.finish(choice);
			this.close();
		});
	}

	private finish(choice: UnsavedChangesChoice) {
		if (this.settled) return;
		this.settled = true;
		this.resolveChoice?.(choice);
	}
}
