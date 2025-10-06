/**
 * Chat session and message types for persistent conversations.
 */

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface ChatSession {
	id: string;
	title: string;
	createdAt: number;
	lastActiveAt: number;
	messages: ChatMessage[];
	contextFile?: string; // Legacy field, migrated to contextFiles
	contextFiles: string[]; // Attached context file paths
}

export interface ChatSessionsData {
	sessions: { [sessionId: string]: ChatSession };
	activeSessionId: string | null;
}
