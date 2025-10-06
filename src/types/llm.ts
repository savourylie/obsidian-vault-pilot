/**
 * Shared interfaces for LLM adapters.
 * This ensures a consistent contract across different providers (Ollama, OpenAI, Claude, etc.).
 */

export interface StreamOptions {
	model?: string;
	temperature?: number;
	signal?: AbortSignal;
}

export interface GenerateOptions {
	model?: string;
	temperature?: number;
}

/**
 * Generic LLM adapter interface.
 * Implementations should handle provider-specific API details.
 */
export interface LLMAdapter {
	/**
	 * Generate a complete response (non-streaming).
	 * @param prompt - The input prompt
	 * @param options - Optional generation parameters
	 * @returns The complete generated text
	 */
	generate(prompt: string, options?: GenerateOptions): Promise<string>;

	/**
	 * Stream a response chunk-by-chunk.
	 * @param prompt - The input prompt
	 * @param onChunk - Callback invoked for each chunk of text
	 * @param options - Optional streaming parameters
	 */
	stream(
		prompt: string,
		onChunk: (text: string) => void,
		options?: StreamOptions
	): Promise<void>;
}
