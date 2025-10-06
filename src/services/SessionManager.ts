import { ChatSession, ChatSessionsData, ChatMessage } from '../types/chat';

/**
 * SessionManager handles persistence and management of chat sessions.
 */
export class SessionManager {
	private data: ChatSessionsData;

	constructor(persistedData?: ChatSessionsData) {
		this.data = persistedData || {
			sessions: {},
			activeSessionId: null,
		};

		// Migrate legacy sessions: ensure contextFiles is initialized
		for (const sessionId in this.data.sessions) {
			const session = this.data.sessions[sessionId];
			if (!session.contextFiles) {
				session.contextFiles = [];
				// Migrate singular contextFile if present
				if (session.contextFile) {
					session.contextFiles.push(session.contextFile);
				}
			}
		}
	}

	/**
	 * Create a new session with auto-generated title.
	 */
	createSession(contextFile?: string): ChatSession {
		const now = Date.now();
		const id = `session_${now}`;
		const title = this.generateTitle(now);

		const session: ChatSession = {
			id,
			title,
			createdAt: now,
			lastActiveAt: now,
			messages: [],
			contextFile,
			contextFiles: [],
		};

		this.data.sessions[id] = session;
		this.data.activeSessionId = id;

		return session;
	}

	/**
	 * Get active session, or create one if none exists.
	 */
	getActiveSession(): ChatSession {
		if (this.data.activeSessionId && this.data.sessions[this.data.activeSessionId]) {
			return this.data.sessions[this.data.activeSessionId];
		}

		// No active session, create one
		return this.createSession();
	}

	/**
	 * Switch to a different session.
	 */
	switchSession(sessionId: string): ChatSession | null {
		if (!this.data.sessions[sessionId]) {
			return null;
		}

		this.data.activeSessionId = sessionId;
		this.data.sessions[sessionId].lastActiveAt = Date.now();

		return this.data.sessions[sessionId];
	}

	/**
	 * Get list of sessions sorted by recency (most recent first).
	 */
	getRecentSessions(limit: number = 15): ChatSession[] {
		const sessions = Object.values(this.data.sessions);
		return sessions
			.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
			.slice(0, limit);
	}

	/**
	 * Update session with new messages.
	 */
	updateSession(sessionId: string, messages: ChatMessage[]): void {
		if (!this.data.sessions[sessionId]) {
			return;
		}

		this.data.sessions[sessionId].messages = messages;
		this.data.sessions[sessionId].lastActiveAt = Date.now();

		// Auto-update title from first user message if still using default
		const session = this.data.sessions[sessionId];
		if (this.isDefaultTitle(session.title) && messages.length > 0) {
			const firstUserMsg = messages.find(m => m.role === 'user');
			if (firstUserMsg) {
				session.title = this.generateTitleFromMessage(firstUserMsg.content);
			}
		}
	}

	/**
	 * Delete a session.
	 */
	deleteSession(sessionId: string): void {
		delete this.data.sessions[sessionId];

		if (this.data.activeSessionId === sessionId) {
			this.data.activeSessionId = null;
		}
	}

	/**
	 * Add context files to a session (deduplicates).
	 */
	addContextFiles(sessionId: string, paths: string[]): void {
		const session = this.data.sessions[sessionId];
		if (!session) {
			return;
		}

		// Deduplicate: only add paths not already present
		const existingSet = new Set(session.contextFiles);
		for (const path of paths) {
			if (!existingSet.has(path)) {
				session.contextFiles.push(path);
				existingSet.add(path);
			}
		}

		session.lastActiveAt = Date.now();
	}

	/**
	 * Remove a context file from a session.
	 */
	removeContextFile(sessionId: string, path: string): void {
		const session = this.data.sessions[sessionId];
		if (!session) {
			return;
		}

		session.contextFiles = session.contextFiles.filter(p => p !== path);
		session.lastActiveAt = Date.now();
	}

	/**
	 * Rename a context file across all sessions.
	 */
	renameContextFile(oldPath: string, newPath: string): void {
		for (const sessionId in this.data.sessions) {
			const session = this.data.sessions[sessionId];
			const index = session.contextFiles.indexOf(oldPath);
			if (index !== -1) {
				session.contextFiles[index] = newPath;
			}
		}
	}

	/**
	 * Delete a context file from all sessions.
	 */
	deleteContextFile(path: string): void {
		for (const sessionId in this.data.sessions) {
			const session = this.data.sessions[sessionId];
			session.contextFiles = session.contextFiles.filter(p => p !== path);
		}
	}

	/**
	 * Export data for persistence.
	 */
	export(): ChatSessionsData {
		return { ...this.data };
	}

	/**
	 * Generate title from timestamp.
	 */
	private generateTitle(timestamp: number): string {
		const date = new Date(timestamp);
		const formatted = date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
		return `Chat - ${formatted}`;
	}

	/**
	 * Generate title from first user message (truncated).
	 */
	private generateTitleFromMessage(content: string): string {
		const truncated = content.slice(0, 40).trim();
		return truncated.length < content.length ? `${truncated}...` : truncated;
	}

	/**
	 * Check if title is still the default timestamp-based one.
	 */
	private isDefaultTitle(title: string): boolean {
		return title.startsWith('Chat - ');
	}

	/**
	 * Get current active session ID.
	 */
	getActiveSessionId(): string | null {
		return this.data.activeSessionId;
	}
}
