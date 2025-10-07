import { LLMAdapter } from '../types/llm';
import { ChatMessage } from '../types/chat';
import { SessionManager } from './SessionManager';

export interface ChatServiceOptions {
	maxPromptTokens?: number;
	reservedResponseTokens?: number;
	recentMessagesToKeep?: number;
	minRecentMessagesToKeep?: number;
}

/**
 * ChatService manages conversation history and interaction with LLM.
 * Used by the chat UI in the Discover panel.
 */
export class ChatService {
	private adapter: LLMAdapter;
	private messages: ChatMessage[] = [];
	private sessionManager: SessionManager | null = null;
	private currentSessionId: string | null = null;
	private options: Required<ChatServiceOptions>;
	private currentModel: string | null = null;

	constructor(adapter: LLMAdapter, options?: ChatServiceOptions) {
		this.adapter = adapter;
		// Apply defaults for any missing options
		this.options = {
			maxPromptTokens: options?.maxPromptTokens ?? 8192,
			reservedResponseTokens: options?.reservedResponseTokens ?? 512,
			recentMessagesToKeep: options?.recentMessagesToKeep ?? 6,
			minRecentMessagesToKeep: options?.minRecentMessagesToKeep ?? 2,
		};
	}

	/**
	 * Set/get the active model used for all generations.
	 */
	setModel(model: string) {
		this.currentModel = model || null;
	}

	getModel(): string | null {
		return this.currentModel;
	}

	/**
	 * Update the LLM adapter (e.g., when provider or base URL changes).
	 */
	setAdapter(adapter: LLMAdapter) {
		this.adapter = adapter;
	}

	/**
	 * Set the session manager for persistence.
	 */
	setSessionManager(sessionManager: SessionManager) {
		this.sessionManager = sessionManager;
	}

	/**
	 * Send a message and stream the response.
	 * @param userMessage - The user's message
	 * @param context - Optional context (e.g., current document content)
	 * @param onChunk - Callback for each chunk of the response
	 */
	async sendMessage(
		userMessage: string,
		context: string,
		onChunk: (chunk: string) => void
	): Promise<void> {
		// Add user message to history
		this.messages.push({ role: 'user', content: userMessage });

		// Compact history if needed (token windowing)
		await this.compactHistoryIfNeeded(context);

		// Build prompt with context
		const prompt = this.buildPrompt(userMessage, context);

		// Stream response
		const responseChunks: string[] = [];
		await this.adapter.stream(prompt, (chunk) => {
			responseChunks.push(chunk);
			onChunk(chunk);
		}, { model: this.currentModel || undefined });

		// Add assistant response to history
		const fullResponse = responseChunks.join('');
		this.messages.push({ role: 'assistant', content: fullResponse });

		// Auto-save to session if session manager is set
		this.saveToSession();
	}

	/**
	 * Build prompt with context and conversation history.
	 * Token-aware: trims context to fit within budget.
	 */
	private buildPrompt(userMessage: string, context: string): string {
		console.log('🔨 Building prompt (token-aware)...');

		// Calculate effective budget
		const effectiveBudget = this.options.maxPromptTokens - this.options.reservedResponseTokens;

		// Check for system summary (compacted history)
		let systemSummary = '';
		if (this.messages.length > 0 && this.messages[0].role === 'system') {
			systemSummary = this.messages[0].content;
		}

		// Get conversation history (exclude system message and current user message)
		const startIdx = systemSummary ? 1 : 0;
		const historyMessages = this.messages.slice(startIdx, -1);

		// Estimate tokens for messages (without context)
		let messagesTokens = 0;

		// System summary tokens
		if (systemSummary) {
			messagesTokens += this.estimateTokens(`Conversation summary: ${systemSummary}\n\n`);
		}

		// History messages tokens
		if (historyMessages.length > 0) {
			messagesTokens += this.estimateTokens('Previous conversation:\n');
			for (const msg of historyMessages) {
				if (msg.role === 'system') continue;
				messagesTokens += this.estimateTokens(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`);
			}
			messagesTokens += this.estimateTokens('\n');
		}

		// Current user message tokens
		messagesTokens += this.estimateTokens(`User: ${userMessage}\n`);
		messagesTokens += this.estimateTokens('Assistant:');

		// Calculate remaining budget for context
		const remainingBudget = effectiveBudget - messagesTokens;

		console.log(`📊 Token budget allocation:`, {
			effectiveBudget,
			messagesTokens,
			remainingBudgetForContext: remainingBudget
		});

		// Trim context to fit remaining budget
		let trimmedContext = '';
		let contextTokens = 0;
		const contextOverhead = this.estimateTokens('You are a helpful assistant. You have access to the following document:\n\n--- BEGIN DOCUMENT ---\n\n--- END DOCUMENT ---\n\n');

		if (context && context.trim().length > 0 && remainingBudget > contextOverhead) {
			const availableForContextContent = remainingBudget - contextOverhead;

			// Estimate how much context we can include
			// Rough approximation: 4 chars per token
			const maxContextChars = availableForContextContent * 4;

			if (maxContextChars > 0) {
				trimmedContext = context.slice(0, maxContextChars);
				contextTokens = this.estimateTokens(trimmedContext) + contextOverhead;

				// If we're still over budget after rough estimate, trim more precisely
				while (contextTokens > remainingBudget && trimmedContext.length > 0) {
					trimmedContext = trimmedContext.slice(0, Math.floor(trimmedContext.length * 0.9));
					contextTokens = this.estimateTokens(trimmedContext) + contextOverhead;
				}

				if (trimmedContext.length < context.length) {
					console.log(`✂️ Context trimmed: ${context.length} chars → ${trimmedContext.length} chars (~${contextTokens} tokens)`);
				} else {
					console.log(`📄 Including full context: ${context.length} chars (~${contextTokens} tokens)`);
				}
			} else {
				console.log(`⚠️ No budget for context (need ${contextOverhead} tokens for overhead, have ${remainingBudget})`);
			}
		} else if (context && context.trim().length > 0) {
			console.log(`⚠️ No budget for context (messages use ${messagesTokens} tokens, budget is ${effectiveBudget})`);
		}

		// Build the final prompt
		let prompt = '';

		// Add context if we have any
		if (trimmedContext.length > 0) {
			prompt += 'You are a helpful assistant. You have access to the following document:\n\n';
			prompt += '--- BEGIN DOCUMENT ---\n';
			prompt += trimmedContext;
			prompt += '\n--- END DOCUMENT ---\n\n';
		}

		// Add conversation summary if present
		if (systemSummary) {
			console.log(`📋 Including system summary (${systemSummary.length} chars)`);
			prompt += `Conversation summary: ${systemSummary}\n\n`;
		} else {
			console.log('📋 No system summary present');
		}

		// Add conversation history
		console.log(`💬 Including ${historyMessages.length} history messages`);

		if (historyMessages.length > 0) {
			prompt += 'Previous conversation:\n';
			for (const msg of historyMessages) {
				if (msg.role === 'system') continue;
				prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
			}
			prompt += '\n';
		}

		// Add current user message (appears only once, at the end)
		prompt += `User: ${userMessage}\n`;
		prompt += 'Assistant:';

		const finalTokens = this.estimateTokens(prompt);
		console.log(`✅ Prompt built: ${prompt.length} chars, ~${finalTokens} tokens (budget: ${effectiveBudget})`);

		if (finalTokens > effectiveBudget) {
			console.warn(`⚠️ WARNING: Prompt exceeds budget by ~${finalTokens - effectiveBudget} tokens`);
		}

		console.log(''); // blank line for readability

		return prompt;
	}

	/**
	 * Clear conversation history.
	 */
	clearHistory() {
		this.messages = [];
	}

	/**
	 * Get conversation history.
	 */
	getHistory(): ChatMessage[] {
		return [...this.messages];
	}

	/**
	 * Load a session's messages.
	 */
	loadSession(sessionId: string) {
		if (!this.sessionManager) return;

		const session = this.sessionManager.switchSession(sessionId);
		if (session) {
			this.currentSessionId = sessionId;
			this.messages = [...session.messages];
		}
	}

	/**
	 * Start a new session and clear messages.
	 */
	startNewSession(contextFile?: string) {
		if (!this.sessionManager) {
			this.messages = [];
			return;
		}

		const session = this.sessionManager.createSession(contextFile);
		this.currentSessionId = session.id;
		this.messages = [];
	}

	/**
	 * Load the active session or create one if none exists.
	 */
	loadActiveSession() {
		if (!this.sessionManager) return;

		const session = this.sessionManager.getActiveSession();
		this.currentSessionId = session.id;
		this.messages = [...session.messages];
	}

	/**
	 * Save current messages to the active session.
	 */
	private saveToSession() {
		if (!this.sessionManager || !this.currentSessionId) return;

		this.sessionManager.updateSession(this.currentSessionId, this.messages);
	}

	/**
	 * Get current session ID.
	 */
	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	/**
	 * Estimate tokens for a text string using a simple heuristic.
	 * Approximation: ~4 characters per token, plus overhead for formatting.
	 */
	private estimateTokens(text: string): number {
		if (!text || text.length === 0) return 0;
		// Base estimate: 4 chars per token
		const baseTokens = Math.ceil(text.length / 4);
		// Add small overhead for formatting/whitespace
		const overhead = Math.ceil(baseTokens * 0.05);
		return baseTokens + overhead;
	}

	/**
	 * Estimate total tokens for an array of chat messages.
	 * Includes overhead for role labels and newlines.
	 */
	private estimateMessagesTokens(messages: ChatMessage[]): number {
		if (!messages || messages.length === 0) return 0;

		let total = 0;
		for (const msg of messages) {
			// Estimate content tokens
			total += this.estimateTokens(msg.content);
			// Add overhead for role label (e.g., "User: " or "Assistant: ")
			total += 2;
		}
		return total;
	}

	/**
	 * Compact history if it exceeds the token budget.
	 * Summarizes older messages into a system message, keeps recent messages verbatim.
	 */
	private async compactHistoryIfNeeded(context: string): Promise<void> {
		// Calculate effective budget
		const effectiveBudget = this.options.maxPromptTokens - this.options.reservedResponseTokens;

		// Estimate current message tokens
		const messagesTokens = this.estimateMessagesTokens(this.messages);
		const contextTokens = this.estimateTokens(context);
		const totalTokens = messagesTokens + contextTokens;

		// Debug logging
		console.log('═══ VaultPilot: Token Window Check ═══');
		console.log('Settings:', {
			maxPromptTokens: this.options.maxPromptTokens,
			reservedResponseTokens: this.options.reservedResponseTokens,
			recentMessagesToKeep: this.options.recentMessagesToKeep,
			effectiveBudget: effectiveBudget
		});
		console.log('Current usage:', {
			messageCount: this.messages.length,
			messagesTokens: messagesTokens,
			contextTokens: contextTokens,
			totalTokens: totalTokens,
			remainingBudget: effectiveBudget - totalTokens
		});
		console.log('Over budget?', totalTokens > effectiveBudget ? '❌ YES - WILL COMPACT' : '✅ NO - WITHIN BUDGET');

		// If under budget, no compaction needed
		if (totalTokens <= effectiveBudget) {
			return;
		}

		console.log('🔄 COMPACTION TRIGGERED');

		// Over budget: compact older messages
		const keepN = this.options.recentMessagesToKeep;

		// Not enough messages to compact
		if (this.messages.length <= keepN) {
			console.log(`⚠️ Not enough messages to compact (have ${this.messages.length}, need > ${keepN})`);
			return;
		}

		// Partition: recent messages to keep verbatim
		const recentMessages = this.messages.slice(-keepN);

		// Older messages to summarize (excluding any existing system message)
		const olderMessages = this.messages.slice(0, -keepN);

		console.log(`📊 Partitioning: ${olderMessages.length} older messages → summary, ${recentMessages.length} recent messages → keep verbatim`);

		// Find existing system summary
		let previousSummary = '';
		const nonSystemOlder = olderMessages.filter(msg => {
			if (msg.role === 'system') {
				if (previousSummary === '') {
					previousSummary = msg.content;
				}
				return false;
			}
			return true;
		});

		if (previousSummary) {
			console.log(`♻️ Found existing system summary (${previousSummary.length} chars)`);
		}
		console.log(`📝 Messages to summarize: ${nonSystemOlder.length}`);

		// If no older messages to summarize (only system), skip
		if (nonSystemOlder.length === 0 && previousSummary !== '') {
			// Already have a summary, just keep it with recent messages
			this.messages = [
				{ role: 'system', content: previousSummary },
				...recentMessages
			];
			console.log('✅ Kept existing summary with recent messages (no new older messages to summarize)');
			return;
		}

		// Build summarization prompt
		let summarizationPrompt = 'Summarize the conversation so far for an assistant. Keep key facts, constraints, decisions, action items, and unresolved questions. Be concise. Do not invent details.\n\n';

		if (previousSummary) {
			summarizationPrompt += `Previous summary: ${previousSummary}\n\n`;
		}

		if (nonSystemOlder.length > 0) {
			summarizationPrompt += 'Conversation to summarize:\n';
			for (const msg of nonSystemOlder) {
				const role = msg.role === 'user' ? 'User' : 'Assistant';
				summarizationPrompt += `${role}: ${msg.content}\n`;
			}
		}

		// Generate summary using LLM
		let summary: string;
		console.log('🤖 Calling LLM to generate summary...');
		try {
			summary = await this.adapter.generate(summarizationPrompt, { temperature: 0.3, model: this.currentModel || undefined });
			summary = summary.trim();
			console.log('✅ Summary generated successfully');
			console.log('📄 Summary preview:', summary.slice(0, 150) + (summary.length > 150 ? '...' : ''));
		} catch (err) {
			console.error('❌ VaultPilot: Summarization failed, using fallback', err);
			// Fallback: truncated summary
			const truncated = nonSystemOlder.slice(0, 2).map(msg => {
				const role = msg.role === 'user' ? 'User' : 'Assistant';
				return `${role}: ${msg.content.slice(0, 100)}...`;
			}).join(' ');
			summary = `[Summarized due to token limit] ${previousSummary ? previousSummary + ' ' : ''}${truncated}`;
			console.log('⚠️ Using fallback summary:', summary);
		}

		// Replace history with summary + recent messages
		const beforeCount = this.messages.length;
		this.messages = [
			{ role: 'system', content: summary },
			...recentMessages
		];

		// Edge case: Check if recent window alone (without context) exceeds budget
		const messagesOnlyTokens = this.estimateMessagesTokens(this.messages);
		if (messagesOnlyTokens > effectiveBudget) {
			console.log(`⚠️ Edge case: Recent window alone exceeds budget (${messagesOnlyTokens} > ${effectiveBudget})`);
			await this.handleOversizedRecentWindow(effectiveBudget, summary);
		}

		const afterCount = this.messages.length;
		console.log(`✅ Compaction complete: ${beforeCount} messages → ${afterCount} messages`);
		console.log('═══════════════════════════════════════\n');
	}

	/**
	 * Handle edge case where recent messages alone exceed token budget.
	 * Shrinks recent window from recentMessagesToKeep to minRecentMessagesToKeep,
	 * and if still over, summarizes parts of the recent window.
	 */
	private async handleOversizedRecentWindow(effectiveBudget: number, existingSummary: string): Promise<void> {
		console.log('🔧 Handling oversized recent window...');

		const minKeep = this.options.minRecentMessagesToKeep;
		const currentKeep = this.options.recentMessagesToKeep;

		// Try shrinking the recent window gradually
		for (let keepN = currentKeep - 1; keepN >= minKeep; keepN--) {
			console.log(`📉 Trying to shrink recent window to ${keepN} messages...`);

			// Get system summary (first message if it's a system message)
			const systemMsg = this.messages[0].role === 'system' ? this.messages[0] : null;
			const nonSystemMessages = systemMsg ? this.messages.slice(1) : this.messages;

			// Keep last keepN messages
			const newRecentMessages = nonSystemMessages.slice(-keepN);
			const toSummarize = nonSystemMessages.slice(0, -keepN);

			if (toSummarize.length === 0) {
				// No older messages to summarize, just use existing summary with fewer recent
				this.messages = systemMsg
					? [systemMsg, ...newRecentMessages]
					: newRecentMessages;
			} else {
				// Summarize the messages being dropped from recent window
				let updatedSummary = existingSummary;
				try {
					const summarizationPrompt = `Update this summary with additional context. Keep it concise.\n\nExisting summary: ${existingSummary}\n\nAdditional messages:\n${toSummarize.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n')}`;
					updatedSummary = await this.adapter.generate(summarizationPrompt, { temperature: 0.3, model: this.currentModel || undefined });
					updatedSummary = updatedSummary.trim();
					console.log(`✅ Updated summary with ${toSummarize.length} dropped messages`);
				} catch (err) {
					console.error('❌ Summary update failed, keeping existing summary', err);
				}

				this.messages = [
					{ role: 'system', content: updatedSummary },
					...newRecentMessages
				];
			}

			// Re-check budget
			const newTokens = this.estimateMessagesTokens(this.messages);
			console.log(`📊 After shrinking to ${keepN}: ${newTokens} tokens (budget: ${effectiveBudget})`);

			if (newTokens <= effectiveBudget) {
				console.log(`✅ Recent window fits budget with ${keepN} messages`);
				return;
			}
		}

		// Still over budget even with minRecentMessagesToKeep
		// Last resort: Create ultra-concise summary and keep only the last user+assistant pair (or just current user if first message)
		console.log(`⚠️ Even minimum recent window (${minKeep}) exceeds budget. Using last-resort summarization.`);

		const systemMsg = this.messages[0].role === 'system' ? this.messages[0] : null;
		const nonSystemMessages = systemMsg ? this.messages.slice(1) : this.messages;

		// Keep absolute minimum: last 1-2 messages (current user message at minimum)
		const absoluteMinimum = Math.min(2, nonSystemMessages.length);
		const keptMessages = nonSystemMessages.slice(-absoluteMinimum);
		const toSummarize = nonSystemMessages.slice(0, -absoluteMinimum);

		let finalSummary = existingSummary;
		if (toSummarize.length > 0) {
			try {
				const summarizationPrompt = `Create an extremely concise summary (max 2-3 sentences) of this conversation.\n\nExisting summary: ${existingSummary}\n\nAdditional messages:\n${toSummarize.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.slice(0, 200)}`).join('\n')}`;
				finalSummary = await this.adapter.generate(summarizationPrompt, { temperature: 0.3, model: this.currentModel || undefined });
				finalSummary = finalSummary.trim();
				console.log(`✅ Created ultra-concise summary, keeping ${keptMessages.length} most recent messages`);
			} catch (err) {
				console.error('❌ Last-resort summarization failed, using truncated fallback', err);
				finalSummary = `[Conversation summary] ${existingSummary.slice(0, 150)}`;
			}
		}

		this.messages = [
			{ role: 'system', content: finalSummary },
			...keptMessages
		];

		const finalTokens = this.estimateMessagesTokens(this.messages);
		console.log(`📊 Last-resort result: ${finalTokens} tokens with ${keptMessages.length} messages + summary`);

		if (finalTokens > effectiveBudget) {
			console.warn(`⚠️ WARNING: Even last-resort compaction exceeds budget. Individual messages may be too large.`);
		}
	}
}
