import type { LLMAdapter } from '../types/llm';
import { OllamaAdapter } from './OllamaAdapter';
import { LMStudioAdapter } from './LMStudioAdapter';

export type LLMProvider = 'ollama' | 'lmstudio';

export interface AdapterFactoryOptions {
	provider: LLMProvider;
	ollamaUrl?: string;
	lmStudioUrl?: string;
	defaultModel?: string;
}

/**
 * Create an LLM adapter instance based on the selected provider.
 * Falls back to Ollama if provider is unknown.
 */
export function createAdapter(opts: AdapterFactoryOptions): LLMAdapter {
	const provider = opts.provider || 'ollama';
	const defaultModel = opts.defaultModel || (provider === 'lmstudio' ? 'gpt-3.5-turbo' : 'gemma3n:e2b');

	if (provider === 'lmstudio') {
		return new LMStudioAdapter(opts.lmStudioUrl || 'http://localhost:1234', defaultModel);
	}

	return new OllamaAdapter(opts.ollamaUrl || 'http://localhost:11434', defaultModel);
}

