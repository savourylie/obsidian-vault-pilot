import { requestUrl } from 'obsidian';
import { GenerateOptions, LLMAdapter, StreamOptions } from '../types/llm';

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

/**
 * Adapter for OpenAI-compatible chat completion endpoints.
 * Uses non-streaming responses and emits them as a single chunk.
 */
export class OpenAIAdapter implements LLMAdapter {
	private baseUrl: string;
	private defaultModel: string;

	constructor(baseUrl: string = 'http://localhost:8080', defaultModel: string = 'gpt-5-mini') {
		this.baseUrl = baseUrl.replace(/\/$/, '');
		this.defaultModel = defaultModel;
	}

	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? 0.7;

		const payload = {
			model,
			messages: [{ role: 'user', content: prompt }],
			temperature,
			stream: false,
		};

		let text: string | null = null;
		let lastErrorMessage: string | null = null;

		try {
			const r: any = await requestUrl({
				url: `${this.baseUrl}/v1/chat/completions`,
				method: 'POST',
				contentType: 'application/json',
				headers: { accept: 'application/json' },
				throw: false as any,
				body: JSON.stringify(payload),
			});
			const status = (r as any)?.status ?? 0;
			const ok = status >= 200 && status < 300;
			text = (r as any)?.text ?? ((r as any)?.json ? JSON.stringify((r as any).json) : (r as any)?.data) ?? null;
			if (!ok) {
				const msg = this.extractErrorMessage(text, status);
				throw new Error(msg);
			}
		} catch (err) {
			lastErrorMessage = err instanceof Error ? err.message : String(err);
			text = null;
		}

		if (text === null) {
			try {
				const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', accept: 'application/json' },
					body: JSON.stringify(payload),
				});
				const respText = await resp.text();
				if (!resp.ok) {
					const msg = this.extractErrorMessage(respText, resp.status);
					throw new Error(msg);
				}
				text = respText;
			} catch (err) {
				const fetchMessage = err instanceof Error ? err.message : String(err);
				const connectionHint = /ECONN|ENOTFOUND|ETIMEDOUT|Failed to fetch|network/i.test(fetchMessage)
					? 'Could not connect to the OpenAI-compatible server. Is it running and reachable?'
					: null;
				if (connectionHint) {
					throw new Error(connectionHint);
				}
				if (lastErrorMessage) {
					throw new Error(`OpenAI-compatible request failed: ${fetchMessage || lastErrorMessage}`);
				}
				throw new Error(`OpenAI-compatible request failed: ${fetchMessage}`);
			}
		}

		let data: OpenAIChatCompletionResponse | null = null;
		try {
			data = text ? (JSON.parse(text) as OpenAIChatCompletionResponse) : null;
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

		const startTime = Date.now();
		const full = await this.generate(prompt, { model, temperature });

		if (full) {
			onChunk(full);

			if (onStats) {
				const elapsedMs = Date.now() - startTime;
				const estimatedTokens = Math.ceil(full.length / 4);
				const tokensPerSecond = elapsedMs > 0 ? (estimatedTokens / elapsedMs) * 1000 : 0;
				onStats({
					tokenCount: estimatedTokens,
					tokensPerSecond,
				});
			}
		}
	}

	private extractErrorMessage(body: string | null, status: number): string {
		if (body) {
			try {
				const parsed = JSON.parse(body);
				const message = parsed?.error?.message || parsed?.message || parsed?.error;
				if (message) {
					return String(message);
				}
			} catch {
				// Ignore parse errors, fall back to raw body below.
			}
			return body;
		}
		return `HTTP ${status || 0}`;
	}
}
