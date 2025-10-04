import { LLMAdapter } from '../types/llm';
import { ChatMessage } from '../types/chat';
import { SessionManager } from './SessionManager';

/**
 * ChatService manages conversation history and interaction with LLM.
 * Used by the chat UI in the Discover panel.
 */
export class ChatService {
	private adapter: LLMAdapter;
	private messages: ChatMessage[] = [];
	private sessionManager: SessionManager | null = null;
	private currentSessionId: string | null = null;

	constructor(adapter: LLMAdapter) {
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

		// Build prompt with context
		const prompt = this.buildPrompt(userMessage, context);

		// Stream response
		const responseChunks: string[] = [];
		await this.adapter.stream(prompt, (chunk) => {
			responseChunks.push(chunk);
			onChunk(chunk);
		});

		// Add assistant response to history
		const fullResponse = responseChunks.join('');
		this.messages.push({ role: 'assistant', content: fullResponse });

		// Auto-save to session if session manager is set
		this.saveToSession();
	}

	/**
	 * Build prompt with context and conversation history.
	 */
	private buildPrompt(userMessage: string, context: string): string {
		let prompt = '';

		// Add context if provided
		if (context && context.trim().length > 0) {
			prompt += 'You are a helpful assistant. You have access to the following document:\n\n';
			prompt += '--- BEGIN DOCUMENT ---\n';
			prompt += context.slice(0, 8000); // Limit context to avoid token overflow
			prompt += '\n--- END DOCUMENT ---\n\n';
		}

		// Add conversation history (last 5 messages to keep context manageable)
		const recentMessages = this.messages.slice(-5);
		if (recentMessages.length > 0) {
			prompt += 'Previous conversation:\n';
			for (const msg of recentMessages) {
				prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
			}
			prompt += '\n';
		}

		// Add current user message
		prompt += `User: ${userMessage}\n`;
		prompt += 'Assistant:';

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
}
