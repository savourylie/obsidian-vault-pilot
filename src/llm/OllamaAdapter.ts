import { LLMAdapter, GenerateOptions, StreamOptions } from '../types/llm';

/**
 * Ollama API response format for streaming.
 * Each line is a JSON object in NDJSON format.
 */
interface OllamaStreamResponse {
	model: string;
	created_at: string;
	response: string;
	done: boolean;
	eval_count?: number;
	eval_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	total_duration?: number;
}

/**
 * LLM adapter for local Ollama instances.
 * Connects to Ollama's HTTP API for text generation.
 *
 * API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 */
export class OllamaAdapter implements LLMAdapter {
	private baseUrl: string;
	private defaultModel: string;

	constructor(baseUrl: string = 'http://localhost:11434', defaultModel: string = 'gemma3n:e2b') {
		this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
		this.defaultModel = defaultModel;
	}

	/**
	 * Generate a complete response without streaming.
	 */
	async generate(prompt: string, options?: GenerateOptions): Promise<string> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? 0.7;

		const response = await fetch(`${this.baseUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				temperature,
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return data.response || '';
	}

	/**
	 * Stream a response chunk-by-chunk.
	 * Each chunk is passed to the onChunk callback as it arrives.
	 */
	async stream(
		prompt: string,
		onChunk: (text: string) => void,
		options?: StreamOptions
	): Promise<void> {
		const model = options?.model ?? this.defaultModel;
		const temperature = options?.temperature ?? 0.7;
		const signal = options?.signal;
		const onStats = options?.onStats;

		const response = await fetch(`${this.baseUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				temperature,
				stream: true,
			}),
			signal,
		});

		if (!response.ok) {
			throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error('Response body is null');
		}

		// Read the stream line by line (newline-delimited JSON)
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		const startTime = Date.now();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');

				// Process all complete lines (last one might be incomplete)
				for (let i = 0; i < lines.length - 1; i++) {
					const line = lines[i].trim();
					if (!line) continue;

					try {
						const json: OllamaStreamResponse = JSON.parse(line);
						if (json.response) {
							onChunk(json.response);
						}
						if (json.done) {
							// Extract token stats from final response
							if (onStats && json.eval_count && json.eval_duration) {
								const tokensPerSecond = (json.eval_count / json.eval_duration) * 1e9;
								onStats({
									tokenCount: json.eval_count,
									tokensPerSecond
								});
							} else if (onStats) {
								// Fallback: estimate from elapsed time if eval_duration not available
								const elapsedMs = Date.now() - startTime;
								const estimatedTokens = json.eval_count || 0;
								const tokensPerSecond = estimatedTokens > 0 ? (estimatedTokens / elapsedMs) * 1000 : 0;
								onStats({
									tokenCount: estimatedTokens,
									tokensPerSecond
								});
							}
							return; // Stream complete
						}
					} catch (err) {
						console.error('Failed to parse Ollama response line:', line, err);
					}
				}

				// Keep the incomplete line in the buffer
				buffer = lines[lines.length - 1];
			}
		} finally {
			reader.releaseLock();
		}
	}
}
