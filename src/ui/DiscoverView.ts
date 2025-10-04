import { ItemView, WorkspaceLeaf, MarkdownView, TFile } from 'obsidian';
import { RetrievalService } from '../services/RetrievalService';

export const VIEW_TYPE_DISCOVER = 'serendipity-discover-view';

export class DiscoverView extends ItemView {
	private retrieval: RetrievalService | null = null;
	private contentEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private debounceTimer: number | null = null;
	private searchToken = 0;

	constructor(leaf: WorkspaceLeaf, retrieval?: RetrievalService) {
		super(leaf);
		this.retrieval = retrieval ?? null;
	}

	getViewType() {
		return VIEW_TYPE_DISCOVER;
	}

	getDisplayText() {
		return 'Discover';
	}

	getIcon() {
		return 'message-circle';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add('vp-discover');

		const header = container.createEl('div', { cls: 'vp-header' });
		header.createEl('h4', { text: 'Discover' });
		this.statusEl = header.createEl('div', { cls: 'vp-status', text: 'Synthesis will appear here...' });

		const actions = container.createEl('div', { cls: 'vp-actions' });
		const refreshBtn = actions.createEl('button', { cls: 'vp-btn', text: 'Refresh' });
		refreshBtn.addEventListener('click', () => this.queueSearch());

		this.contentEl = container.createEl('div');
		this.resultsEl = this.contentEl.createEl('div', { cls: 'vp-results' });

		this.registerEvents();
		this.queueSearch();
		console.log('Discover view opened.');
	}

	async onClose() {
		console.log('Discover view closed.');
	}

	private registerEvents() {
		// File open changes active context
		this.registerEvent(this.app.workspace.on('file-open', () => this.queueSearch()));
		// Save/modify updates
		this.registerEvent(this.app.vault.on('modify', (file: any) => {
			if ((file as TFile)?.extension === 'md') this.queueSearch();
		}));
	}

	private queueSearch() {
		if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
		this.setLoading(true);
		this.debounceTimer = window.setTimeout(() => this.runSearch(), 600);
	}

	private setLoading(loading: boolean) {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		if (loading) {
		this.resultsEl.createEl('div', { cls: 'vp-empty', text: 'Searching…' });
		}
	}

	private async runSearch() {
		const token = ++this.searchToken;
		try {
			if (!this.retrieval) {
				this.renderEmpty('Index not initialized yet.');
				return;
			}
			const file = this.app.workspace.getActiveFile?.();
			if (!file || (file as any).extension !== 'md') {
				this.renderEmpty('Open a note to see related results.');
				return;
			}
			const content = await (this.app.vault as any).read(file);
			const query = this.makeQuery(file, content);
			const results = this.retrieval.search(query, { limit: 10 })
				.filter(r => r.path !== file.path);
			if (token !== this.searchToken) return; // stale
			this.renderResults(results);
		} catch (e) {
			console.error('Discover search error', e);
			this.renderEmpty('Error while searching.');
		}
	}

	private makeQuery(file: TFile, content: string): string {
		const head = content.slice(0, 500);
		return `${file.basename}\n\n${head}`;
	}

	private renderEmpty(msg: string) {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		this.resultsEl.createEl('div', { cls: 'vp-empty', text: msg });
	}

	private renderResults(results: Array<{ path: string; title: string; snippet: string; file: any }>) {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		if (results.length === 0) {
			this.renderEmpty('No related notes.');
			return;
		}
		for (const r of results) {
			const row = this.resultsEl.createEl('div', { cls: 'vp-result' });
			row.createEl('div', { cls: 'vp-title', text: r.title });
			row.createEl('div', { cls: 'vp-snippet', text: r.snippet });
			const btns = row.createEl('div', { cls: 'vp-actions' });
			const openBtn = btns.createEl('button', { cls: 'vp-btn vp-btn--primary', text: 'Open' });
			openBtn.addEventListener('click', () => this.openFile(r.path));
			const linkBtn = btns.createEl('button', { cls: 'vp-btn', text: 'Insert Link' });
			linkBtn.addEventListener('click', () => this.insertLink(r.path));
			const quoteBtn = btns.createEl('button', { cls: 'vp-btn', text: 'Quote' });
			quoteBtn.addEventListener('click', () => console.log('Quote placeholder for', r.path));
		}
	}

	private async openFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) return;
		const leaf = this.app.workspace.getLeaf?.(true);
		await (leaf as any)?.openFile?.(file);
	}

	private insertLink(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		const md = this.app.workspace.getActiveViewOfType?.(MarkdownView as any) as any;
		if (!file || !md || !md.editor) return;
		const target = file.basename || path;
		md.editor.replaceSelection(`[[${target}]]`);
	}
}
