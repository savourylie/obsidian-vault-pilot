import { LLMAdapter, GenerateOptions, StreamOptions } from '../types/llm';
import { requestUrl } from 'obsidian';

interface OpenAIChatCompletionChoice {
	message?: { role: string; content: string };
	delta?: { content?: string };
	finish_reason?: string | null;
}

interface OpenAIChatCompletionResponse {
	id?: string;
	object?: string;
	choices?: Array<OpenAIChatCompletionChoice>;
	model?: string;
}

export class LMStudioAdapter implements LLMAdapter {
	private baseUrl: string;
	private defaultModel: string;

	constructor(baseUrl: string = 'http://localhost:1234', defaultModel: string = 'gpt-3.5-turbo') {
		this.baseUrl = baseUrl.replace(/\/$/, '');
		this.defaultModel = defaultModel;
	}

	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? 0.7;

		const payload = {
			model,
			messages: [ { role: 'user', content: prompt } ],
			temperature,
			stream: false,
		};

		let text: string | null = null;
		// Prefer Obsidian requestUrl to bypass CORS and sandbox issues
		try {
			const r: any = await requestUrl({
				url: `${this.baseUrl}/v1/chat/completions`,
				method: 'POST',
				// Ensure JSON content-type is correctly conveyed to the main process
				contentType: 'application/json',
				headers: { accept: 'application/json' },
				// Do not throw on non-2xx so we can surface server error messages
				throw: false as any,
				body: JSON.stringify(payload),
			});
			// If HTTP error, try to extract meaningful message from body
			const status = (r as any)?.status ?? 0;
			const ok = status >= 200 && status < 300;
			text = (r as any)?.text ?? ((r as any)?.json ? JSON.stringify((r as any).json) : (r as any)?.data) ?? null;
			if (!ok) {
				const msg = (() => {
					try {
						const j = text ? JSON.parse(text) : null;
						return j?.error?.message || j?.message || text || `HTTP ${status}`;
					} catch {
						return text || `HTTP ${status}`;
					}
				})();
				throw new Error(String(msg));
			}
		} catch (_primaryErr) {
			// Fallback to fetch (may fail due to CORS in Obsidian)
			try {
				const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', accept: 'application/json' },
					body: JSON.stringify(payload),
				});
				if (!resp.ok) {
					let errText = '';
					try { errText = await resp.text(); } catch {}
					// Try to surface server-provided error message
					try {
						const j = errText ? JSON.parse(errText) : null;
						errText = j?.error?.message || j?.message || errText || `${resp.status} ${resp.statusText}`;
					} catch {}
					throw new Error(errText || `LM Studio request failed: ${resp.status} ${resp.statusText}`);
				}
				text = await resp.text();
			} catch (err) {
				throw err instanceof Error ? err : new Error('LM Studio request failed');
			}
		}

		let data: OpenAIChatCompletionResponse | null = null;
		try {
			data = text ? JSON.parse(text) as OpenAIChatCompletionResponse : null;
		} catch {
			data = null;
		}
		const content = data?.choices?.[0]?.message?.content ?? '';
		return content || '';
	}

	async stream(
		prompt: string,
		onChunk: (text: string) => void,
		options?: StreamOptions
	): Promise<void> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? 0.7;
		const onStats = options?.onStats;

		// CORS in Obsidian prevents fetch streaming for LM Studio. Use non-streaming via requestUrl and emit once.
		const startTime = Date.now();
		const full = await this.generate(prompt, { model, temperature });

		if (full) {
			onChunk(full);

			// Calculate stats based on character estimation
			if (onStats) {
				const elapsedMs = Date.now() - startTime;
				// Rough estimate: ~4 characters per token
				const estimatedTokens = Math.ceil(full.length / 4);
				const tokensPerSecond = elapsedMs > 0 ? (estimatedTokens / elapsedMs) * 1000 : 0;

				onStats({
					tokenCount: estimatedTokens,
					tokensPerSecond
				});
			}
		}
	}
}
