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
		// Use Obsidian requestUrl to bypass CORS
		try {
			const r: any = await requestUrl({
				url: `${this.baseUrl}/v1/chat/completions`,
				method: 'POST',
				contentType: 'application/json',
				headers: { accept: 'application/json' },
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
		} catch (err) {
			// Improve error message for connection failures
			const errorMsg = err instanceof Error ? err.message : String(err);
			// Check if it's a connection error
			if (/ECONN|ENOTFOUND|ETIMEDOUT|network|fetch|Failed to fetch/i.test(errorMsg)) {
				throw new Error('Could not connect to LM Studio. Is Local Server enabled?');
			}
			// Re-throw other errors with context
			throw new Error(`LM Studio request failed: ${errorMsg}`);
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
