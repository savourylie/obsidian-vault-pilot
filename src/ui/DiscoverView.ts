import { ItemView, WorkspaceLeaf, MarkdownView, TFile, App, setIcon, MarkdownRenderer } from 'obsidian';
import { RetrievalService } from '../services/RetrievalService';
import { ChatService, ChatServiceOptions } from '../services/ChatService';
import { OllamaAdapter } from '../llm/OllamaAdapter';
import { SessionManager } from '../services/SessionManager';
import anime from 'animejs';

export const VIEW_TYPE_DISCOVER = 'serendipity-discover-view';

export class DiscoverView extends ItemView {
	private retrieval: RetrievalService | null = null;
	private contentEl: HTMLElement | null = null;
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
	private typingIndicator: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		retrieval?: RetrievalService,
		ollamaUrl?: string,
		sessionManager?: SessionManager,
		onSessionSave?: () => Promise<void>,
		chatOptions?: ChatServiceOptions
	) {
		super(leaf);
		this.retrieval = retrieval ?? null;
		this.sessionManager = sessionManager ?? null;
		this.onSessionSave = onSessionSave ?? null;
		const adapter = new OllamaAdapter(ollamaUrl || 'http://localhost:11434');
		this.chatService = new ChatService(adapter, chatOptions);

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

		const header = container.createEl('header', { cls: 'vp-header' });
		const titleRow = header.createEl('div', { cls: 'vp-title-row' });
		titleRow.createEl('h4', { cls: 'vp-brand-title', text: 'VaultPilot' });

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

		const body = container.createEl('div', { cls: 'vp-body' });
		const resultsSection = body.createEl('section', { cls: 'vp-section vp-section--results' });
		const resultsHeader = resultsSection.createEl('div', { cls: 'vp-section-header' });
		resultsHeader.createEl('h5', { text: 'Related Notes' });
		resultsHeader.createEl('p', {
			cls: 'vp-section-subtitle',
			text: 'Surface serendipitous connections from your vault.',
		});

		this.contentEl = resultsSection.createEl('div', { cls: 'vp-results-scroll' });
		this.resultsEl = this.contentEl.createEl('div', { cls: 'vp-results-list' });

		// Add chat UI at the bottom
		this.createChatUI(body);

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

		const cards: HTMLElement[] = [];
		for (const r of results) {
			const card = this.resultsEl.createEl('article', { cls: 'vp-result-card vp-result-card--clickable' });
			card.tabIndex = 0;
			card.addEventListener('click', () => this.openFile(r.path));
			card.addEventListener('keydown', (event: KeyboardEvent) => {
				if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
					event.preventDefault();
					this.openFile(r.path);
				}
			});

			const header = card.createEl('div', { cls: 'vp-result-card__header' });
			header.createEl('div', { cls: 'vp-result-card__title', text: r.title });
			const metaText = this.getResultPathLabel(r.path);
			if (metaText) {
				header.createEl('div', { cls: 'vp-result-card__meta', text: metaText });
			}

			card.createEl('div', { cls: 'vp-result-card__snippet', text: r.snippet });

			// Set initial state for animation
			card.style.opacity = '0';
			card.style.transform = 'translateY(10px)';
			cards.push(card);
		}

		// Staggered animation for all results
		anime({
			targets: cards,
			opacity: [0, 1],
			translateY: [10, 0],
			duration: 350,
			delay: anime.stagger(60),
			easing: 'easeOutCubic'
		});
	}

	private async openFile(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) return;
		const leaf = this.app.workspace.getLeaf?.(true);
		await (leaf as any)?.openFile?.(file);
	}

	private getResultPathLabel(path: string): string {
		const withoutExt = path.replace(/\.md$/i, '');
		const parts = withoutExt.split('/').filter(Boolean);
		if (parts.length === 0) return withoutExt;
		const visibleParts = parts.slice(-3);
		return visibleParts.join(' / ');
	}

	private insertLink(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		const md = this.app.workspace.getActiveViewOfType?.(MarkdownView as any) as any;
		if (!file || !md || !md.editor) return;
		const target = file.basename || path;
		md.editor.replaceSelection(`[[${target}]]`);
	}

	private createChatUI(parent: HTMLElement) {
		this.chatContainer = parent.createEl('section', { cls: 'vp-section vp-section--chat' });

		const chatHeader = this.chatContainer.createEl('div', { cls: 'vp-section-header vp-chat-header' });
		chatHeader.createEl('h5', { text: 'Assistant Chat' });
		chatHeader.createEl('p', {
			cls: 'vp-section-subtitle',
			text: 'Ask follow-up questions about the active note.',
		});

		const chatSurface = this.chatContainer.createEl('div', { cls: 'vp-chat-surface' });
		this.chatMessagesEl = chatSurface.createEl('div', { cls: 'vp-chat-messages' });

		const inputContainer = chatSurface.createEl('div', { cls: 'vp-chat-input-container' });
		this.chatInputEl = inputContainer.createEl('textarea', {
			cls: 'vp-chat-input',
			attr: { placeholder: 'Ask about the current document...' }
		});

		const sendBtn = inputContainer.createEl('button', {
			cls: 'vp-chat-send',
			attr: { 'aria-label': 'Send' }
		});
		setIcon(sendBtn, 'arrow-up');
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

		// Show typing indicator
		this.showTypingIndicator();

		try {
			let accumulatedContent = '';
			let assistantMsg: HTMLElement | null = null;
			let assistantContent: HTMLElement | null = null;

			await this.chatService.sendMessage(message, context, (chunk: string) => {
				// On first chunk, hide typing indicator and create message
				if (!assistantMsg) {
					this.hideTypingIndicator();
					assistantMsg = this.addMessageToUI('assistant', '');
					assistantContent = assistantMsg.querySelector('.vp-chat-message-content') as HTMLElement;
				}

				if (!assistantContent) return;
				accumulatedContent += chunk;
				this.renderMarkdownContent(assistantContent, accumulatedContent);
				this.smoothScrollToBottom();
			});

			// Save session after message is complete
			if (this.onSessionSave) {
				await this.onSessionSave();
			}
		} catch (err) {
			console.error('Chat error:', err);
			this.hideTypingIndicator();
			const errorMsg = this.addMessageToUI('assistant', '');
			const errorContent = errorMsg.querySelector('.vp-chat-message-content') as HTMLElement;
			if (errorContent) {
				errorContent.empty();
				errorContent.textContent = 'Error: ' + (err instanceof Error ? err.message : 'Unknown error');
			}
		}
	}

	private addMessageToUI(role: 'user' | 'assistant', content: string): HTMLElement {
		if (!this.chatMessagesEl) return document.createElement('div');

		const msgEl = this.chatMessagesEl.createEl('div', { cls: `vp-chat-message vp-chat-message--${role}` });
		const roleLabel = msgEl.createEl('div', { cls: 'vp-chat-message-role' });
		roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';

		const contentEl = msgEl.createEl('div', { cls: 'vp-chat-message-content' });
		this.renderMarkdownContent(contentEl, content);

		// Animate message entry
		const translateX = role === 'user' ? -20 : 20;
		msgEl.style.opacity = '0';
		msgEl.style.transform = `translateX(${translateX}px)`;

		anime({
			targets: msgEl,
			opacity: [0, 1],
			translateX: [translateX, 0],
			duration: 400,
			easing: 'easeOutCubic'
		});

		// Smooth auto-scroll to bottom
		this.smoothScrollToBottom();

		return msgEl;
	}

	private smoothScrollToBottom() {
		if (!this.chatMessagesEl) return;

		anime({
			targets: this.chatMessagesEl,
			scrollTop: this.chatMessagesEl.scrollHeight,
			duration: 300,
			easing: 'easeOutQuad'
		});
	}

	private showTypingIndicator() {
		if (!this.chatMessagesEl) return;

		// Remove existing indicator if any
		this.hideTypingIndicator();

		// Create typing indicator
		this.typingIndicator = this.chatMessagesEl.createEl('div', { cls: 'vp-chat-message vp-chat-message--assistant' });
		const roleLabel = this.typingIndicator.createEl('div', { cls: 'vp-chat-message-role' });
		roleLabel.textContent = 'Assistant';

		const contentEl = this.typingIndicator.createEl('div', { cls: 'vp-chat-message-content vp-typing-indicator' });
		const dot1 = contentEl.createEl('span', { cls: 'vp-typing-dot' });
		const dot2 = contentEl.createEl('span', { cls: 'vp-typing-dot' });
		const dot3 = contentEl.createEl('span', { cls: 'vp-typing-dot' });

		// Animate entry
		this.typingIndicator.style.opacity = '0';
		this.typingIndicator.style.transform = 'translateX(20px)';

		anime({
			targets: this.typingIndicator,
			opacity: [0, 1],
			translateX: [20, 0],
			duration: 400,
			easing: 'easeOutCubic'
		});

		// Animate dots with stagger
		anime({
			targets: [dot1, dot2, dot3],
			scale: [0.8, 1],
			opacity: [0.5, 1],
			duration: 600,
			loop: true,
			direction: 'alternate',
			delay: anime.stagger(150),
			easing: 'easeInOutQuad'
		});

		this.smoothScrollToBottom();
	}

	private hideTypingIndicator() {
		if (!this.typingIndicator) return;

		anime({
			targets: this.typingIndicator,
			opacity: [1, 0],
			duration: 200,
			easing: 'easeOutQuad',
			complete: () => {
				this.typingIndicator?.remove();
				this.typingIndicator = null;
			}
		});
	}

	private renderMarkdownContent(target: HTMLElement, markdown: string) {
		target.empty();
		if (!markdown) return;
		MarkdownRenderer.renderMarkdown(markdown, target, '', this);
	}

	private toggleSessionDropdown() {
		if (!this.sessionManager) return;

		// Close if already open
		if (this.sessionDropdown) {
			// Animate exit
			anime({
				targets: this.sessionDropdown,
				opacity: [1, 0],
				translateY: [0, -8],
				duration: 200,
				easing: 'easeOutQuad',
				complete: () => {
					this.sessionDropdown?.remove();
					this.sessionDropdown = null;
				}
			});
			return;
		}

		// Create dropdown
		this.sessionDropdown = document.body.createEl('div', { cls: 'vp-session-dropdown' });

		const sessions = this.sessionManager.getRecentSessions();
		const currentSessionId = this.chatService.getCurrentSessionId();

		const items: HTMLElement[] = [];

		if (sessions.length === 0) {
			const emptyEl = this.sessionDropdown.createEl('div', { cls: 'vp-session-empty', text: 'No sessions yet' });
			items.push(emptyEl);
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
					// Animated close
					anime({
						targets: this.sessionDropdown,
						opacity: [1, 0],
						duration: 150,
						easing: 'easeOutQuad',
						complete: () => {
							this.sessionDropdown?.remove();
							this.sessionDropdown = null;
						}
					});
				});

				// Set initial state for stagger animation
				item.style.opacity = '0';
				item.style.transform = 'translateX(-5px)';
				items.push(item);
			}
		}

		// Position dropdown below the timer button
		const rect = this.containerEl.getBoundingClientRect();
		this.sessionDropdown.style.top = `${rect.top + 40}px`;
		this.sessionDropdown.style.left = `${rect.left + 150}px`;

		// Set initial state for dropdown
		this.sessionDropdown.style.opacity = '0';
		this.sessionDropdown.style.transform = 'translateY(-8px)';

		// Animate dropdown entry
		anime({
			targets: this.sessionDropdown,
			opacity: [0, 1],
			translateY: [-8, 0],
			duration: 250,
			easing: 'easeOutQuad'
		});

		// Stagger animate items
		if (items.length > 0) {
			anime({
				targets: items,
				opacity: [0, 1],
				translateX: [-5, 0],
				duration: 200,
				delay: anime.stagger(30, { start: 100 }),
				easing: 'easeOutQuad'
			});
		}

		// Close on outside click
		const closeHandler = (e: MouseEvent) => {
			if (this.sessionDropdown && !this.sessionDropdown.contains(e.target as Node)) {
				anime({
					targets: this.sessionDropdown,
					opacity: [1, 0],
					translateY: [0, -8],
					duration: 200,
					easing: 'easeOutQuad',
					complete: () => {
						this.sessionDropdown?.remove();
						this.sessionDropdown = null;
						document.removeEventListener('click', closeHandler);
					}
				});
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
