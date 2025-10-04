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
