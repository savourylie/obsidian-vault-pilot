import { App, TFile } from 'obsidian';
import { IndexingService } from './IndexingService';

export interface SearchResult {
	file: TFile | null;
	path: string;
	title: string;
	score: number;
	snippet: string;
}

export class RetrievalService {
	private app: App;
	private index: IndexingService;

	constructor(app: App, index: IndexingService) {
		this.app = app;
		this.index = index;
	}

	search(query: string, opts?: { limit?: number }): SearchResult[] {
		const limit = opts?.limit ?? 10;
		const tokens = this.tokenize(query);
		if (tokens.length === 0) return [];

		const N = this.index.getDocCount() || 1;
		// docId -> score
		const scores = new Map<string, number>();

		// Compute TF-IDF score: sum( (tf) * idf ) with simple normalization
		for (const [docId] of this.index.getDocs().entries()) {
			let s = 0;
			for (const q of tokens) {
				const tf = this.index.getTF(docId, q);
				if (tf === 0) continue;
				const df = this.index.getDF(q) || 1;
				const idf = Math.log(1 + N / df);
				s += tf * idf;
			}
			if (s > 0) {
				scores.set(docId, s);
			}
		}

		const sorted = Array.from(scores.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit);

		return sorted.map(([docId, score]) => {
			const meta = this.index.getDocMeta(docId)!;
			const file = this.app.vault.getAbstractFileByPath(meta.path) as TFile | null;
			return {
				file: file ?? null,
				path: meta.path,
				title: meta.title,
				score,
				snippet: this.makeSnippet(meta.contentPreview, tokens),
			};
		});
	}

	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[`_*#>\-\[\](){}~:;"'.,!?/\\]|\d+/g, ' ')
			.split(/\s+/)
			.filter((t) => t);
	}

	private makeSnippet(content: string, tokens: string): string;
	private makeSnippet(content: string, tokens: string[]): string;
	private makeSnippet(content: string, tokens: string | string[]): string {
		const toks = Array.isArray(tokens) ? tokens : this.tokenize(tokens);
		if (!content) return '';
		const lower = content.toLowerCase();
		let idx = -1;
		for (const t of toks) {
			const i = lower.indexOf(t);
			if (i !== -1) {
				idx = i;
				break;
			}
		}
		if (idx === -1) idx = 0;
		const start = Math.max(0, idx - 60);
		const end = Math.min(content.length, idx + 120);
		const prefix = start > 0 ? '…' : '';
		const suffix = end < content.length ? '…' : '';
		return `${prefix}${content.slice(start, end)}${suffix}`;
	}
}
