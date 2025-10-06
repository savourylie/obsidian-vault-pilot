import type { App } from 'obsidian';
import { OllamaAdapter } from '../llm/OllamaAdapter';
import type { LLMAdapter } from '../types/llm';

// Ticket 33 — TaggingService: Normalize + Extract

/**
 * Convert arbitrary text into an Obsidian-style hashtag:
 * - strip leading '#', trim
 * - lowercase
 * - whitespace/underscores -> dashes
 * - keep only [a-z0-9-]
 * - collapse duplicate dashes; trim edge dashes
 * - prefix '#'
 * Returns '' if nothing valid remains.
 */
export function normalizeTag(tag: string): string {
	let t = String(tag || '');
	if (!t) return '';
	// strip leading '#', trim
	t = t.replace(/^#+/, '').trim();
	// whitespace/underscores -> dashes
	t = t.replace(/[\s_]+/g, '-');
	// lowercase & drop invalid chars
	t = t.toLowerCase().replace(/[^a-z0-9-]+/g, '');
	// collapse dashes
	t = t.replace(/-+/g, '-');
	// trim edge dashes
	t = t.replace(/^-/g, '').replace(/-$/g, '');
	if (!t) return '';
	return `#${t}`;
}

/**
 * Extract inline hashtags from note body. Returns normalized unique tags.
 */
export function extractInlineTags(content: string): Set<string> {
	const tags = new Set<string>();
	if (!content) return tags;
	const re = /(^|\s)#([A-Za-z0-9][\w-]*)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		const raw = m[2] || '';
		const n = normalizeTag(raw);
		if (n) tags.add(n);
	}
	return tags;
}

/**
 * Extract YAML frontmatter tags from a note (read-only).
 * Supports:
 * - tags: a, b
 * - tags: [a, b]
 * - tags:\n  - a\n  - b
 */
export function extractFrontmatterTags(content: string): Set<string> {
	const out = new Set<string>();
	if (!content || !content.startsWith('---')) return out;
	const end = content.indexOf('\n---', 3);
	if (end === -1) return out;
	const fm = content.slice(3, end).trim();
	const lines = fm.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const m = /^tags\s*:\s*(.*)$/i.exec(line);
		if (!m) continue;
		const rest = m[1].trim();
		if (rest.startsWith('[')) {
			// Inline array: [a, b]
			const inner = rest.replace(/^\[|\]$/g, '');
			for (const item of inner.split(',')) {
				const n = normalizeTag(item.trim());
				if (n) out.add(n);
			}
		} else if (rest.length === 0) {
			// Multi-line list under tags:
			for (let j = i + 1; j < lines.length; j++) {
				const li = /^\s*[-*]\s*(.+)$/.exec(lines[j]);
				if (!li) break;
				const n = normalizeTag(li[1].trim());
				if (n) out.add(n);
			}
		} else {
			// Comma/space separated
			for (const item of rest.split(/[\s,]+/)) {
				const n = normalizeTag(item.trim());
				if (n) out.add(n);
			}
		}
		break;
	}
	return out;
}

/**
 * Scan the vault for tag usage across all markdown files.
 * Counts both inline and frontmatter tags.
 */
export async function scanVaultTags(app: App): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	const files = (app?.vault as any)?.getMarkdownFiles?.() || [];
	for (const f of files) {
		try {
			const txt = await (app.vault as any).read(f);
			for (const t of extractInlineTags(txt)) {
				counts.set(t, (counts.get(t) || 0) + 1);
			}
			for (const t of extractFrontmatterTags(txt)) {
				counts.set(t, (counts.get(t) || 0) + 1);
			}
		} catch (_e) {
			// Skip file on read error
		}
	}
	return counts;
}

function tokenize(text: string): string[] {
	return (text || '')
		.toLowerCase()
		.replace(/[`_*#>\-\[\](){}~:;"'.,!?/\\]|\d+/g, ' ')
		.split(/\s+/)
		.filter((t) => t && t.length > 2);
}

function keywordFallback(content: string, vaultTags: Set<string>, existing: Set<string>, min: number, max: number): string[] {
	const freq = new Map<string, number>();
	for (const t of tokenize(content)) freq.set(t, (freq.get(t) || 0) + 1);
	const ordered = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map(([w]) => w);
	const candidates: string[] = [];
	for (const w of ordered) {
		const tag = normalizeTag(w);
		if (!tag) continue;
		if (existing.has(tag)) continue;
		candidates.push(tag);
		if (candidates.length >= max * 2) break;
	}
	// prefer vault-known first
	const preferred: string[] = [];
	const others: string[] = [];
	for (const t of candidates) (vaultTags.has(t) ? preferred : others).push(t);
	let final = Array.from(new Set(preferred.concat(others)));
	if (final.length > max) final = final.slice(0, max);
	// ensure min by drawing from vault tags
	if (final.length < min) {
		for (const t of vaultTags) {
			if (existing.has(t) || final.includes(t)) continue;
			final.push(t);
			if (final.length >= min) break;
		}
	}
	return final;
}

function parseLLMTags(raw: string): string[] {
	// Only accept explicit hashtags from the model output; ignore plain words
	const matches = (raw || '').match(/#[A-Za-z0-9][\w-]*/g) || [];
	const out = Array.from(new Set(matches.map(normalizeTag).filter(Boolean)));
	return out;
}

export interface TagSuggestOptions {
	useLLM: boolean;
	ollamaUrl?: string;
	model?: string;
	minSuggestions?: number;
	maxSuggestions?: number;
	// Optional injection for testing or custom providers
	llmAdapter?: LLMAdapter;
}

/**
 * Suggest hashtags for a note using LLM (optional) with robust fallback.
 * - If LLM returns non-hashtag content or too few tags, fallback to keywords.
 */
export async function suggestTags(
	app: App,
	content: string,
	options: TagSuggestOptions,
	existingNoteTags?: Set<string>,
): Promise<string[]> {
	const min = Math.max(1, options.minSuggestions ?? 3);
	const max = Math.max(min, options.maxSuggestions ?? 5);
	const existing = existingNoteTags || new Set<string>();
	const vaultCounts = await scanVaultTags(app);
	const vaultSet = new Set<string>(vaultCounts.keys());

	let candidates: string[] = [];
	console.log('VaultPilot: suggestTags start', {
		useLLM: !!options.useLLM,
		ollamaUrl: options.ollamaUrl ? 'set' : 'unset',
		model: options.model || 'default',
		contentLen: (content || '').length,
		existingCount: existing.size,
		vaultTagCount: vaultSet.size,
		min,
		max,
	});

	if (options.useLLM && (options.ollamaUrl || options.llmAdapter)) {
		try {
			const adapter: LLMAdapter = options.llmAdapter || new OllamaAdapter(options.ollamaUrl, options.model || 'gemma3n:e2b');
			const excerpt = (content || '').slice(0, 4000);
			const vaultList = Array.from(vaultSet).slice(0, 200).join(' ');
			const existingList = Array.from(existing).join(' ');
			const prompt = [
				'You generate hashtags for an Obsidian note.',
				'Rules:',
				'- Output only hashtags, space-separated. No explanations.',
				'- Use lowercase and dashes (kebab-case), e.g., #my-topic.',
				vaultList ? `- Prefer reusing from this vault list when relevant: ${vaultList}` : '',
				existingList ? `- Avoid duplicates already in the note: ${existingList}` : '',
				`Return ${min}-${max} tags that best fit the document.`,
				'',
				'Document excerpt:',
				excerpt,
			].filter(Boolean).join('\n');
			console.log('VaultPilot: Calling LLM generate for hashtag suggestions');
			const TIMEOUT_MS = 8000;
			const raw = await Promise.race<string>([
				adapter.generate(prompt, { model: options.model }),
				new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), TIMEOUT_MS)) as Promise<string>,
			]);
			candidates = parseLLMTags(raw);
			console.log('VaultPilot: LLM produced hashtag count =', candidates.length);
		} catch (_e) {
			console.warn('VaultPilot: LLM call failed, falling back');
			candidates = [];
		}
	}

	// Fallback if LLM is off, failed, or produced too few valid hashtags
	if (candidates.length < min) {
		candidates = keywordFallback(content || '', vaultSet, existing, min, max);
		console.log('VaultPilot: Fallback produced hashtag count =', candidates.length);
	}

	// Exclude existing tags and cap
	const final = candidates.filter((t) => !existing.has(t)).slice(0, max);
	console.log('VaultPilot: suggestTags final count =', final.length, 'tags =', final);
	return final;
}

/**
 * Merge a set of tags into the note by appending or updating the last hashtag line.
 * - Avoid duplicates already present (inline or frontmatter)
 * - If last non-empty line is a pure hashtag line, merge into it.
 * - Else append a blank line and a new hashtag line.
 */
export function mergeTagsIntoContent(content: string, tagsToAdd: string[]): { content: string; changed: boolean } {
	const norm = Array.from(new Set(tagsToAdd.map(normalizeTag).filter(Boolean)));
	if (norm.length === 0) return { content, changed: false };

	const existing = new Set<string>([
		...extractInlineTags(content),
		...extractFrontmatterTags(content),
	]);
	const add = norm.filter((t) => !existing.has(t));
	if (add.length === 0) return { content, changed: false };

	const trimmedEnd = content.replace(/\s+$/s, '');
	const lines = trimmedEnd.split('\n');
	// Find last non-empty line
	let lastIdx = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].trim().length > 0) { lastIdx = i; break; }
	}
	if (lastIdx === -1) {
		// Empty document
		return { content: add.join(' '), changed: true };
	}

	const last = lines[lastIdx];
	const isTagLine = /^(?:\s*#[a-z0-9][a-z0-9\-]*\s*)+$/i.test(last);
	if (isTagLine) {
		const current = last.trim().split(/\s+/).map(normalizeTag).filter(Boolean);
		const merged = Array.from(new Set([...current, ...add]));
		lines[lastIdx] = merged.join(' ');
		return { content: lines.join('\n') + '\n', changed: true };
	}

	const updated = lines.concat(['', add.join(' ')]).join('\n') + '\n';
	return { content: updated, changed: true };
}
