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
	private apiKey?: string;
	private defaultTemperature?: number;

	constructor(baseUrl: string = 'http://localhost:8080', defaultModel: string = 'gpt-5-mini', apiKey?: string, temperature?: number) {
		// Step 1: Strip trailing slash
		this.baseUrl = baseUrl.replace(/\/$/, '');

		// Step 2: Smart /v1 handling - detect if URL already includes /v1 or full path
		if (this.baseUrl.endsWith('/v1/chat/completions')) {
			// Full path already provided, extract base without the path
			this.baseUrl = this.baseUrl.replace(/\/v1\/chat\/completions$/, '');
			console.log(`VaultPilot [OpenAI]: Base URL included full path '/v1/chat/completions', extracted base: ${this.baseUrl}`);
		} else if (this.baseUrl.endsWith('/chat/completions')) {
			// Partial path without /v1 prefix
			this.baseUrl = this.baseUrl.replace(/\/chat\/completions$/, '');
			console.log(`VaultPilot [OpenAI]: Base URL included '/chat/completions', extracted base: ${this.baseUrl}`);
		} else if (this.baseUrl.endsWith('/v1')) {
			// Already has /v1 suffix, will append only /chat/completions
			console.log(`VaultPilot [OpenAI]: Base URL already includes '/v1' suffix, will append '/chat/completions'`);
		} else {
			// No /v1, will append full /v1/chat/completions
			console.log(`VaultPilot [OpenAI]: Base URL doesn't include '/v1', will append '/v1/chat/completions'`);
		}

		this.defaultModel = defaultModel;
		this.apiKey = apiKey;
		this.defaultTemperature = temperature;
	}

	/**
	 * Build the chat completions endpoint URL.
	 * Smartly handles cases where baseUrl already includes /v1.
	 */
	private buildEndpointUrl(): string {
		if (this.baseUrl.endsWith('/v1')) {
			// Base already has /v1, just append /chat/completions
			return `${this.baseUrl}/chat/completions`;
		}
		// Base doesn't have /v1, append full path
		return `${this.baseUrl}/v1/chat/completions`;
	}

	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? this.defaultTemperature;
		const targetUrl = this.buildEndpointUrl();

		const tempDisplay = temperature !== undefined ? temperature.toString() : 'not set (using model default)';
		console.log(`VaultPilot [OpenAI]: Starting request to ${targetUrl}`);
		console.log(`VaultPilot [OpenAI]: Model: ${model}, Temperature: ${tempDisplay}, API Key configured: ${this.apiKey ? 'yes' : 'no'}`);
		console.log(`VaultPilot [OpenAI]: Prompt length: ${prompt.length} chars`);

		const payload: any = {
			model,
			messages: [{ role: 'user', content: prompt }],
			stream: false,
		};

		// Only include temperature if specified (some models like GPT-5 don't support it)
		if (temperature !== undefined) {
			payload.temperature = temperature;
		}

		let text: string | null = null;
		let lastErrorMessage: string | null = null;
		let requestUrlStatus = 0;

		try {
			const headers: Record<string, string> = { accept: 'application/json' };
			if (this.apiKey) {
				headers['Authorization'] = `Bearer ${this.apiKey}`;
			}
			console.log(`VaultPilot [OpenAI]: requestUrl attempt - Auth header: ${this.apiKey ? 'present' : 'not set'}`);

			const r: any = await requestUrl({
				url: targetUrl,
				method: 'POST',
				contentType: 'application/json',
				headers,
				throw: false as any,
				body: JSON.stringify(payload),
			});
			const status = (r as any)?.status ?? 0;
			requestUrlStatus = status;
			const ok = status >= 200 && status < 300;
			text = (r as any)?.text ?? ((r as any)?.json ? JSON.stringify((r as any).json) : (r as any)?.data) ?? null;

			console.log(`VaultPilot [OpenAI]: requestUrl response - Status: ${status}, Success: ${ok}, Body preview: ${text ? text.substring(0, 200) + (text.length > 200 ? '...' : '') : 'null'}`);

			if (!ok) {
				const msg = this.extractErrorMessage(text, status);
				console.warn(`VaultPilot [OpenAI]: requestUrl failed with status ${status}: ${msg}`);
				throw new Error(msg);
			}
		} catch (err) {
			lastErrorMessage = err instanceof Error ? err.message : String(err);
			console.warn(`VaultPilot [OpenAI]: requestUrl attempt failed: ${lastErrorMessage}`);
			text = null;
		}

		if (text === null) {
			console.log(`VaultPilot [OpenAI]: Retrying with fetch fallback...`);
			try {
				const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json', accept: 'application/json' };
				if (this.apiKey) {
					fetchHeaders['Authorization'] = `Bearer ${this.apiKey}`;
				}
				console.log(`VaultPilot [OpenAI]: fetch attempt - Auth header: ${this.apiKey ? 'present' : 'not set'}`);

				const resp = await fetch(targetUrl, {
					method: 'POST',
					headers: fetchHeaders,
					body: JSON.stringify(payload),
				});
				const respText = await resp.text();

				console.log(`VaultPilot [OpenAI]: fetch response - Status: ${resp.status}, OK: ${resp.ok}, Body preview: ${respText ? respText.substring(0, 200) + (respText.length > 200 ? '...' : '') : 'null'}`);

				if (!resp.ok) {
					const msg = this.extractErrorMessage(respText, resp.status);
					console.error(`VaultPilot [OpenAI]: fetch failed with status ${resp.status}: ${msg}`);
					throw new Error(msg);
				}
				text = respText;
			} catch (err) {
				const fetchMessage = err instanceof Error ? err.message : String(err);
				console.error(`VaultPilot [OpenAI]: fetch attempt failed: ${fetchMessage}`);

				// Detect CORS errors specifically
				const isCorsError = /CORS|No 'Access-Control-Allow-Origin'|has been blocked by CORS policy/i.test(fetchMessage) || /CORS|No 'Access-Control-Allow-Origin'|has been blocked by CORS policy/i.test(lastErrorMessage || '');

				if (isCorsError) {
					console.error(`VaultPilot [OpenAI]: CORS error detected - The server at ${this.baseUrl} does not allow requests from Obsidian (app://obsidian.md).`);
					console.error(`VaultPilot [OpenAI]: CORS errors cannot be fixed client-side. Solutions:`);
					console.error(`  1. Use a local CORS proxy`);
					console.error(`  2. Switch to a local provider (Ollama, LM Studio)`);
					console.error(`  3. Use a provider with Obsidian-compatible CORS (OpenAI, OpenRouter)`);

					throw new Error(`CORS blocked: ${this.baseUrl} doesn't allow requests from Obsidian. Use a local provider or CORS proxy.`);
				}

				const connectionHint = /ECONN|ENOTFOUND|ETIMEDOUT|Failed to fetch|network/i.test(fetchMessage)
					? 'Could not connect to the OpenAI-compatible server. Is it running and reachable?'
					: null;

				// Log comprehensive error context
				console.error(`VaultPilot [OpenAI]: Connection error summary:`, {
					targetUrl,
					model,
					apiKeyPresent: !!this.apiKey,
					requestUrlStatus,
					requestUrlError: lastErrorMessage,
					fetchError: fetchMessage,
					isCorsError,
					connectionHint
				});

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
			console.log(`VaultPilot [OpenAI]: Response parsed successfully, choices count: ${data?.choices?.length ?? 0}`);
		} catch (parseErr) {
			console.error(`VaultPilot [OpenAI]: Failed to parse response JSON:`, parseErr);
			console.error(`VaultPilot [OpenAI]: Raw response text preview: ${text ? text.substring(0, 300) : 'null'}`);
			data = null;
		}

		const content = data?.choices?.[0]?.message?.content ?? '';
		console.log(`VaultPilot [OpenAI]: Extracted content length: ${content.length} chars`);
		return content || '';
	}

	async stream(
		prompt: string,
		onChunk: (text: string) => void,
		options?: StreamOptions
	): Promise<void> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? this.defaultTemperature;
		const onStats = options?.onStats;

		console.log(`VaultPilot [OpenAI]: stream() called, delegating to generate() (non-streaming mode)`);

		const startTime = Date.now();
		const full = await this.generate(prompt, { model, temperature });

		if (full) {
			console.log(`VaultPilot [OpenAI]: stream() received ${full.length} chars from generate(), emitting as single chunk`);
			onChunk(full);

			if (onStats) {
				const elapsedMs = Date.now() - startTime;
				const estimatedTokens = Math.ceil(full.length / 4);
				const tokensPerSecond = elapsedMs > 0 ? (estimatedTokens / elapsedMs) * 1000 : 0;
				console.log(`VaultPilot [OpenAI]: stream() stats - Elapsed: ${elapsedMs}ms, Est. tokens: ${estimatedTokens}, Tokens/s: ${tokensPerSecond.toFixed(2)}`);
				onStats({
					tokenCount: estimatedTokens,
					tokensPerSecond,
				});
			}
		} else {
			console.warn(`VaultPilot [OpenAI]: stream() received empty response from generate()`);
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
