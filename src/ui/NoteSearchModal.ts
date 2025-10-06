import { App, SuggestModal, TFile } from 'obsidian';
import { RetrievalService } from '../services/RetrievalService';

/**
 * Modal for searching and selecting notes to attach as context.
 * Uses RetrievalService for intelligent search, with fallback to basename filtering.
 */
export class NoteSearchModal extends SuggestModal<TFile> {
	private retrievalService: RetrievalService | null;
	private onChoose: (path: string) => void;

	constructor(
		app: App,
		retrievalService: RetrievalService | null,
		onChoose: (path: string) => void
	) {
		super(app);
		this.retrievalService = retrievalService;
		this.onChoose = onChoose;
		this.setPlaceholder('Search notes to add as context...');
	}

	getSuggestions(query: string): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();

		// Empty query: return recent files
		if (!query || query.trim().length === 0) {
			return allFiles
				.sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
				.slice(0, 20);
		}

		// Try using RetrievalService for intelligent search
		if (this.retrievalService) {
			try {
				const results = this.retrievalService.search(query, { limit: 20 });
				// Map search results to TFile objects
				const files: TFile[] = [];
				for (const result of results) {
					const file = this.app.vault.getAbstractFileByPath(result.path) as TFile;
					if (file) {
						files.push(file);
					}
				}
				if (files.length > 0) {
					return files;
				}
			} catch (err) {
				console.warn('NoteSearchModal: RetrievalService search failed, using fallback', err);
			}
		}

		// Fallback: simple basename filtering
		const lowerQuery = query.toLowerCase();
		return allFiles
			.filter(file => file.basename.toLowerCase().includes(lowerQuery))
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.empty();
		el.addClass('vp-note-search-suggestion');

		// Title
		const titleEl = el.createEl('div', { cls: 'vp-note-search-title' });
		titleEl.textContent = file.basename;

		// Path
		const pathEl = el.createEl('div', { cls: 'vp-note-search-path' });
		pathEl.textContent = this.getPathLabel(file.path);
	}

	onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(file.path);
	}

	/**
	 * Format path for display (show last 3 segments).
	 */
	private getPathLabel(path: string): string {
		const withoutExt = path.replace(/\.md$/i, '');
		const parts = withoutExt.split('/').filter(Boolean);
		if (parts.length === 0) return withoutExt;
		const visibleParts = parts.slice(-3);
		return visibleParts.join(' / ');
	}
}
