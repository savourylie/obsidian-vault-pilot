import { App, TFile } from 'obsidian';

// Simple English stopwords list (trimmed)
const STOPWORDS = new Set([
	'the','a','an','and','or','but','if','then','else','for','on','in','to','of','at','by','with','is','it','this','that','these','those','be','as','are','was','were','from','has','had','have','not','no','can','could','should','would','will','just','so','we','you','i','they','he','she','them','his','her','their','our','your'
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[`_*#>\-\[\](){}~:;"'.,!?/\\]|\d+/g, ' ')
		.split(/\s+/)
		.filter((t) => t && !STOPWORDS.has(t));
}

function parseFrontmatterIndexFlag(content: string): boolean {
	// Returns true if file should be indexed (default true)
	if (!content.startsWith('---')) return true;
	const end = content.indexOf('\n---', 3);
	if (end === -1) return true;
	const fm = content.slice(3, end).toLowerCase();
	// very lightweight parse; accepts forms like: ai.index: false
	const m = fm.match(/\bai\.index\s*:\s*(true|false)\b/);
	if (!m) return true;
	return m[1] === 'true';
}

export interface SerializedIndexV1 {
	schemaVersion: 1;
	docCount: number;
	// docId: path
	docs: Record<string, { path: string; title: string; contentPreview: string }>;
	// term -> df
	df: Record<string, number>;
	// docId -> term -> tf
	tf: Record<string, Record<string, number>>;
}

export type AnySerializedIndex = SerializedIndexV1;

export class IndexingService {
	private app: App;
	// term -> df
	private df = new Map<string, number>();
	// docId -> term -> tf
	private tf = new Map<string, Map<string, number>>();
	// docId -> { path, title, contentPreview }
	private docs = new Map<string, { path: string; title: string; contentPreview: string }>();

	constructor(app: App) {
		this.app = app;
	}

	getDocCount(): number {
		return this.docs.size;
	}

	getDocs() {
		return this.docs;
	}

	getDF(term: string): number {
		return this.df.get(term) || 0;
	}

	getTF(docId: string, term: string): number {
		return this.tf.get(docId)?.get(term) || 0;
	}

	getDocMeta(docId: string) {
		return this.docs.get(docId);
	}

	async buildIndex(): Promise<void> {
		this.df.clear();
		this.tf.clear();
		this.docs.clear();

		const files = (this.app.vault as any).getMarkdownFiles?.() as TFile[];
		if (!files || files.length === 0) return;

		for (const file of files) {
			await this.updateIndex(file);
		}
	}

	async updateIndex(file: TFile): Promise<void> {
		if (!file || (file as any).extension !== 'md') return;
		const docId = file.path;

		// Remove existing before re-adding
		this.removeDocInternal(docId);

		const content = await (this.app.vault as any).read(file);
		if (!parseFrontmatterIndexFlag(content)) {
			return; // skip indexing
		}

		const title = (file as any).basename || file.name || file.path;
		const contentPreview = content.slice(0, 5000);

		const titleTokens = tokenize(title);
		const bodyTokens = tokenize(content);

		const tf = new Map<string, number>();
		for (const t of bodyTokens) tf.set(t, (tf.get(t) || 0) + 1);
		// Title weighting: +2 per title term
		for (const t of titleTokens) tf.set(t, (tf.get(t) || 0) + 2);

		// Update df
		for (const term of tf.keys()) {
			this.df.set(term, (this.df.get(term) || 0) + 1);
		}

		this.tf.set(docId, tf);
		this.docs.set(docId, { path: file.path, title, contentPreview });
	}

	removeFromIndex(file: TFile | string): void {
		const docId = typeof file === 'string' ? file : (file as TFile).path;
		this.removeDocInternal(docId);
	}

	private removeDocInternal(docId: string) {
		const tf = this.tf.get(docId);
		if (tf) {
			for (const term of tf.keys()) {
				const old = this.df.get(term) || 0;
				if (old <= 1) this.df.delete(term);
				else this.df.set(term, old - 1);
			}

			this.tf.delete(docId);
		}
		this.docs.delete(docId);
	}

	export(): SerializedIndexV1 {
		const out: SerializedIndexV1 = {
			schemaVersion: 1,
			docCount: this.docs.size,
			docs: {},
			df: {},
			tf: {},
		};

		for (const [term, v] of this.df.entries()) out.df[term] = v;
		for (const [docId, meta] of this.docs.entries()) out.docs[docId] = meta;
		for (const [docId, tfMap] of this.tf.entries()) {
			out.tf[docId] = {};
			for (const [term, v] of tfMap.entries()) out.tf[docId][term] = v;
		}
		return out;
	}

	load(data: AnySerializedIndex | undefined | null): void {
		if (!data || (data as any).schemaVersion !== 1) return;
		const d = data as SerializedIndexV1;
		this.df.clear();
		this.tf.clear();
		this.docs.clear();
		for (const term in d.df) this.df.set(term, d.df[term]);
		for (const docId in d.docs) this.docs.set(docId, d.docs[docId]);
		for (const docId in d.tf) {
			const m = new Map<string, number>();
			const row = d.tf[docId];
			for (const term in row) m.set(term, row[term]);
			this.tf.set(docId, m);
		}
	}
}
