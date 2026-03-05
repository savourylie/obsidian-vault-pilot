import type { LLMAdapter, LLMProvider } from '../types/llm';
import { LMStudioAdapter } from './LMStudioAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { OllamaAdapter } from './OllamaAdapter';

export interface AdapterFactoryOptions {
	provider: LLMProvider;
	ollamaUrl?: string;
	lmStudioUrl?: string;
	openAIUrl?: string;
	openAIApiKey?: string;
	openAITemperature?: number;
	defaultModel?: string;
}

/**
 * Create an LLM adapter instance based on the selected provider.
 * Falls back to Ollama if provider is unknown.
 */
export function createAdapter(opts: AdapterFactoryOptions): LLMAdapter {
	const provider = opts.provider || 'ollama';
	const defaultModel = opts.defaultModel
		|| (provider === 'ollama'
			? 'gemma3n:e2b'
			: 'gpt-5-mini');

	if (provider === 'lmstudio') {
		return new LMStudioAdapter(opts.lmStudioUrl || 'http://localhost:1234', defaultModel);
	}

	if (provider === 'openai') {
		return new OpenAIAdapter(
			opts.openAIUrl || 'http://localhost:8080',
			defaultModel,
			opts.openAIApiKey,
			opts.openAITemperature
		);
	}

	return new OllamaAdapter(opts.ollamaUrl || 'http://localhost:11434', defaultModel);
}
