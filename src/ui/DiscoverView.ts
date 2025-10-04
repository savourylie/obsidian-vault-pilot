import { ItemView, WorkspaceLeaf, MarkdownView, TFile, App, setIcon } from 'obsidian';
import { RetrievalService } from '../services/RetrievalService';
import { ChatService } from '../services/ChatService';
import { OllamaAdapter } from '../llm/OllamaAdapter';
import { SessionManager } from '../services/SessionManager';

export const VIEW_TYPE_DISCOVER = 'serendipity-discover-view';

export class DiscoverView extends ItemView {
	private retrieval: RetrievalService | null = null;
	private contentEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private debounceTimer: number | null = null;
	private searchToken = 0;
	private chatService: ChatService;
	private chatContainer: HTMLElement | null = null;
	private chatMessagesEl: HTMLElement | null = null;
	private chatInputEl: HTMLTextAreaElement | null = null;
	private sessionManager: SessionManager | null = null;
	private sessionDropdown: HTMLElement | null = null;
	private onSessionSave: (() => Promise<void>) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		retrieval?: RetrievalService,
		ollamaUrl?: string,
		sessionManager?: SessionManager,
		onSessionSave?: () => Promise<void>
	) {
		super(leaf);
		this.retrieval = retrieval ?? null;
		this.sessionManager = sessionManager ?? null;
		this.onSessionSave = onSessionSave ?? null;
		const adapter = new OllamaAdapter(ollamaUrl || 'http://localhost:11434');
		this.chatService = new ChatService(adapter);

		// Wire session manager to chat service
		if (this.sessionManager) {
			this.chatService.setSessionManager(this.sessionManager);
		}
	}

	getViewType() {
		return VIEW_TYPE_DISCOVER;
	}

	getDisplayText() {
		return 'Discover';
	}

	getIcon() {
		return 'message-circle';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add('vp-discover');

		const header = container.createEl('div', { cls: 'vp-header' });
		const titleRow = header.createEl('div', { cls: 'vp-title-row' });
		titleRow.createEl('h4', { text: 'Discover' });

		// Add session controls
		if (this.sessionManager) {
			const sessionControls = titleRow.createEl('div', { cls: 'vp-session-controls' });

			// Timer icon for session history
			const historyBtn = sessionControls.createEl('button', { cls: 'vp-icon-btn', attr: { 'aria-label': 'Session history' } });
			setIcon(historyBtn, 'clock');
			historyBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleSessionDropdown();
			});

			// Edit icon for new session
			const newSessionBtn = sessionControls.createEl('button', { cls: 'vp-icon-btn', attr: { 'aria-label': 'New session' } });
			setIcon(newSessionBtn, 'edit');
			newSessionBtn.addEventListener('click', () => this.createNewSession());
		}

		this.statusEl = header.createEl('div', { cls: 'vp-status', text: 'Synthesis will appear here...' });

		const actions = container.createEl('div', { cls: 'vp-actions' });
		const refreshBtn = actions.createEl('button', { cls: 'vp-btn', text: 'Refresh' });
		refreshBtn.addEventListener('click', () => this.queueSearch());

		this.contentEl = container.createEl('div', { cls: 'vp-discover-content' });
		this.resultsEl = this.contentEl.createEl('div', { cls: 'vp-results' });

		// Add chat UI at the bottom
		this.createChatUI(container);

		// Load active session
		if (this.sessionManager) {
			this.chatService.loadActiveSession();
			this.renderChatHistory();
		}

		this.registerEvents();
		this.queueSearch();
		console.log('Discover view opened.');
	}

	async onClose() {
		console.log('Discover view closed.');
	}

	private registerEvents() {
		// File open changes active context
		this.registerEvent(this.app.workspace.on('file-open', () => this.queueSearch()));
		// Save/modify updates
		this.registerEvent(this.app.vault.on('modify', (file: any) => {
			if ((file as TFile)?.extension === 'md') this.queueSearch();
		}));
	}

	private queueSearch() {
		if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
		this.setLoading(true);
		this.debounceTimer = window.setTimeout(() => this.runSearch(), 600);
	}

	private setLoading(loading: boolean) {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		if (loading) {
		this.resultsEl.createEl('div', { cls: 'vp-empty', text: 'Searching…' });
		}
	}

	private async runSearch() {
		const token = ++this.searchToken;
		try {
			if (!this.retrieval) {
				this.renderEmpty('Index not initialized yet.');
				return;
			}
			const file = this.app.workspace.getActiveFile?.();
			if (!file || (file as any).extension !== 'md') {
				this.renderEmpty('Open a note to see related results.');
				return;
			}
			const content = await (this.app.vault as any).read(file);
			const query = this.makeQuery(file, content);
			const results = this.retrieval.search(query, { limit: 10 })
				.filter(r => r.path !== file.path);
			if (token !== this.searchToken) return; // stale
			this.renderResults(results);
		} catch (e) {
			console.error('Discover search error', e);
			this.renderEmpty('Error while searching.');
		}
	}

	private makeQuery(file: TFile, content: string): string {
		const head = content.slice(0, 500);
		return `${file.basename}\n\n${head}`;
	}

	private renderEmpty(msg: string) {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		this.resultsEl.createEl('div', { cls: 'vp-empty', text: msg });
	}

	private renderResults(results: Array<{ path: string; title: string; snippet: string; file: any }>) {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		if (results.length === 0) {
			this.renderEmpty('No related notes.');
			return;
		}
		for (const r of results) {
			const row = this.resultsEl.createEl('div', { cls: 'vp-result' });
			row.createEl('div', { cls: 'vp-title', text: r.title });
			row.createEl('div', { cls: 'vp-snippet', text: r.snippet });
			const btns = row.createEl('div', { cls: 'vp-actions' });
			const openBtn = btns.createEl('button', { cls: 'vp-btn vp-btn--primary', text: 'Open' });
			openBtn.addEventListener('click', () => this.openFile(r.path));
			const linkBtn = btns.createEl('button', { cls: 'vp-btn', text: 'Insert Link' });
			linkBtn.addEventListener('click', () => this.insertLink(r.path));
			const quoteBtn = btns.createEl('button', { cls: 'vp-btn', text: 'Quote' });
			quoteBtn.addEventListener('click', () => console.log('Quote placeholder for', r.path));
		}
	}

	private async openFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) return;
		const leaf = this.app.workspace.getLeaf?.(true);
		await (leaf as any)?.openFile?.(file);
	}

	private insertLink(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		const md = this.app.workspace.getActiveViewOfType?.(MarkdownView as any) as any;
		if (!file || !md || !md.editor) return;
		const target = file.basename || path;
		md.editor.replaceSelection(`[[${target}]]`);
	}

	private createChatUI(container: HTMLElement) {
		this.chatContainer = container.createEl('div', { cls: 'vp-chat-container' });

		const chatHeader = this.chatContainer.createEl('div', { cls: 'vp-chat-header' });
		chatHeader.createEl('h5', { text: 'Chat' });

		this.chatMessagesEl = this.chatContainer.createEl('div', { cls: 'vp-chat-messages' });

		const inputContainer = this.chatContainer.createEl('div', { cls: 'vp-chat-input-container' });
		this.chatInputEl = inputContainer.createEl('textarea', {
			cls: 'vp-chat-input',
			attr: { placeholder: 'Ask about the current document...' }
		});

		const sendBtn = inputContainer.createEl('button', { cls: 'vp-btn vp-btn--primary', text: 'Send' });
		sendBtn.addEventListener('click', () => this.sendMessage());

		// Send on Enter (but Shift+Enter for newline)
		this.chatInputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});
	}

	private async sendMessage() {
		if (!this.chatInputEl || !this.chatMessagesEl) return;

		const message = this.chatInputEl.value.trim();
		if (!message) return;

		// Get current document as context
		const file = this.app.workspace.getActiveFile?.();
		let context = '';
		if (file && (file as any).extension === 'md') {
			context = await (this.app.vault as any).read(file);
		}

		// Clear input
		this.chatInputEl.value = '';

		// Add user message to UI
		this.addMessageToUI('user', message);

		// Add assistant placeholder
		const assistantMsg = this.addMessageToUI('assistant', '');
		const assistantContent = assistantMsg.querySelector('.vp-chat-message-content') as HTMLElement;

		try {
			// Stream response
			await this.chatService.sendMessage(message, context, (chunk: string) => {
				if (assistantContent) {
					assistantContent.textContent += chunk;
					// Auto-scroll to bottom
					if (this.chatMessagesEl) {
						this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
					}
				}
			});

			// Save session after message is complete
			if (this.onSessionSave) {
				await this.onSessionSave();
			}
		} catch (err) {
			console.error('Chat error:', err);
			if (assistantContent) {
				assistantContent.textContent = 'Error: ' + (err instanceof Error ? err.message : 'Unknown error');
			}
		}
	}

	private addMessageToUI(role: 'user' | 'assistant', content: string): HTMLElement {
		if (!this.chatMessagesEl) return document.createElement('div');

		const msgEl = this.chatMessagesEl.createEl('div', { cls: `vp-chat-message vp-chat-message--${role}` });
		const roleLabel = msgEl.createEl('div', { cls: 'vp-chat-message-role' });
		roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';

		const contentEl = msgEl.createEl('div', { cls: 'vp-chat-message-content' });
		contentEl.textContent = content;

		// Auto-scroll to bottom
		this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;

		return msgEl;
	}

	private toggleSessionDropdown() {
		if (!this.sessionManager) return;

		// Close if already open
		if (this.sessionDropdown) {
			this.sessionDropdown.remove();
			this.sessionDropdown = null;
			return;
		}

		// Create dropdown
		this.sessionDropdown = document.body.createEl('div', { cls: 'vp-session-dropdown' });

		const sessions = this.sessionManager.getRecentSessions();
		const currentSessionId = this.chatService.getCurrentSessionId();

		if (sessions.length === 0) {
			this.sessionDropdown.createEl('div', { cls: 'vp-session-empty', text: 'No sessions yet' });
		} else {
			for (const session of sessions) {
				const item = this.sessionDropdown.createEl('div', { cls: 'vp-session-item' });
				if (session.id === currentSessionId) {
					item.classList.add('vp-session-item--active');
				}

				const title = item.createEl('div', { cls: 'vp-session-title', text: session.title });
				const time = new Date(session.lastActiveAt).toLocaleString('en-US', {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
				});
				item.createEl('div', { cls: 'vp-session-time', text: time });

				item.addEventListener('click', () => {
					this.loadSession(session.id);
					this.sessionDropdown?.remove();
					this.sessionDropdown = null;
				});
			}
		}

		// Position dropdown below the timer button
		const rect = this.containerEl.getBoundingClientRect();
		this.sessionDropdown.style.top = `${rect.top + 40}px`;
		this.sessionDropdown.style.left = `${rect.left + 150}px`;

		// Close on outside click
		const closeHandler = (e: MouseEvent) => {
			if (this.sessionDropdown && !this.sessionDropdown.contains(e.target as Node)) {
				this.sessionDropdown.remove();
				this.sessionDropdown = null;
				document.removeEventListener('click', closeHandler);
			}
		};
		setTimeout(() => document.addEventListener('click', closeHandler), 0);
	}

	private createNewSession() {
		if (!this.sessionManager) return;

		// Get current file for context
		const file = this.app.workspace.getActiveFile?.();
		const contextFile = file?.path;

		// Start new session
		this.chatService.startNewSession(contextFile);

		// Clear chat UI
		if (this.chatMessagesEl) {
			this.chatMessagesEl.empty();
		}
	}

	private loadSession(sessionId: string) {
		if (!this.sessionManager) return;

		// Load session into ChatService
		this.chatService.loadSession(sessionId);

		// Re-render chat history
		this.renderChatHistory();
	}

	private renderChatHistory() {
		if (!this.chatMessagesEl) return;

		// Clear existing messages
		this.chatMessagesEl.empty();

		// Render all messages from history
		const history = this.chatService.getHistory();
		for (const msg of history) {
			if (msg.role === 'user' || msg.role === 'assistant') {
				this.addMessageToUI(msg.role, msg.content);
			}
		}
	}
}
