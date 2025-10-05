import { App, TFile } from 'obsidian';
import { RetrievalService } from './RetrievalService';

export interface ContextConfig {
	maxSnippets?: number;
	maxPromptLength?: number;
	maxSelectionLength?: number;
	systemPrompt?: string;
}

const DEFAULT_CONFIG: Required<ContextConfig> = {
	maxSnippets: 5,
	maxPromptLength: 8000,
	maxSelectionLength: 2000,
	systemPrompt: 'You are an AI writing assistant for Obsidian. Your task is to help the user edit their note.'
};

/**
 * Assembles context for LLM prompts by combining user selections
 * with relevant vault snippets.
 */
export class ContextAssembler {
	private config: Required<ContextConfig>;

	constructor(
		private app: App,
		private retrieval: RetrievalService,
		config?: ContextConfig
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Assembles a formatted prompt with context from the vault.
	 * @param selection - The user's selected text
	 * @param file - The current file
	 * @param instruction - The user's instruction (e.g., "Rewrite this")
	 * @returns Formatted prompt ready for LLM
	 */
	assembleContext(selection: string, file: TFile, instruction: string): string {
		// Truncate very long selections
		let truncatedSelection = selection;
		if (selection.length > this.config.maxSelectionLength) {
			truncatedSelection = selection.slice(0, this.config.maxSelectionLength) + '…';
		}

		// Retrieve relevant snippets from vault
		const results = this.retrieval
			.search(selection, { limit: this.config.maxSnippets })
			.filter((r) => r.path !== file.path); // Exclude current file

		// Build context section
		let contextSection = '';
		if (results.length > 0) {
			contextSection = 'Relevant context from vault:\n';
			for (const result of results) {
				contextSection += `---\nSource: [[${result.title}]]\n${result.snippet}\n`;
			}
		} else {
			contextSection = 'No additional context from vault.\n';
		}

		// Assemble the full prompt
		const system = this.config.systemPrompt || DEFAULT_CONFIG.systemPrompt;
		const prompt = `${system}

Current note: [[${file.basename}]]
Path: ${file.path}

${contextSection}
User's selection:
"""
${truncatedSelection}
"""

Instruction: ${instruction}

Provide your response as a direct replacement for the user's selection. Do not include explanations or preamble.`;

		// Truncate if prompt exceeds max length
		if (prompt.length > this.config.maxPromptLength) {
			return prompt.slice(0, this.config.maxPromptLength) + '\n\n[Prompt truncated due to length]';
		}

		return prompt;
	}
}
