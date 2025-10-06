import { ItemView, WorkspaceLeaf, MarkdownView, TFile, App, setIcon, MarkdownRenderer, requestUrl } from 'obsidian';
import { RetrievalService } from '../services/RetrievalService';
import { ChatService, ChatServiceOptions } from '../services/ChatService';
import { createAdapter } from '../llm/adapterFactory';
import { SessionManager } from '../services/SessionManager';
import { NoteSearchModal } from './NoteSearchModal';
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
	private modelSelectEl: HTMLSelectElement | null = null;
	private sessionManager: SessionManager | null = null;
	private sessionDropdown: HTMLElement | null = null;
	private onSessionSave: (() => Promise<void>) | null = null;
	private typingIndicator: HTMLElement | null = null;
	private ollamaUrl: string = 'http://localhost:11434';
	private lmStudioUrl: string = 'http://localhost:1234';
	private provider: 'ollama' | 'lmstudio' = 'ollama';
	private defaultChatModel: string | null = null;
	private contextChipsContainer: HTMLElement | null = null;
	private atMentionPopover: HTMLElement | null = null;
	private atMentionSelectedIndex: number = 0;
	private atMentionFiles: TFile[] = [];
	private atMentionQuery: string | null = null;
	private resultsSection: HTMLElement | null = null;
	private relatedNotesCollapsed: boolean = false;
	private resultsScrollEl: HTMLElement | null = null;
	private collapseBtn: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		retrieval?: RetrievalService,
		ollamaUrl?: string,
		sessionManager?: SessionManager,
		onSessionSave?: () => Promise<void>,
		chatOptions?: ChatServiceOptions,
		defaultChatModel?: string,
		provider?: 'ollama' | 'lmstudio',
		lmStudioUrl?: string
	) {
		super(leaf);
		this.retrieval = retrieval ?? null;
		this.sessionManager = sessionManager ?? null;
		this.onSessionSave = onSessionSave ?? null;
		this.ollamaUrl = ollamaUrl || 'http://localhost:11434';
		this.lmStudioUrl = lmStudioUrl || 'http://localhost:1234';
		this.provider = provider || 'ollama';
		this.defaultChatModel = defaultChatModel || null;
		const adapter = createAdapter({
			provider: this.provider,
			ollamaUrl: this.ollamaUrl,
			lmStudioUrl: this.lmStudioUrl,
			defaultModel: this.defaultChatModel || undefined,
		});
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
		this.resultsSection = body.createEl('section', { cls: 'vp-section vp-section--results' });
		const resultsHeader = this.resultsSection.createEl('div', { cls: 'vp-section-header' });

		// Header content wrapper
		const headerContent = resultsHeader.createEl('div', { cls: 'vp-section-header__content' });
		headerContent.createEl('h5', { text: 'Related Notes' });
		headerContent.createEl('p', {
			cls: 'vp-section-subtitle',
			text: 'Surface serendipitous connections from your vault.',
		});

		// Collapse/expand button
		this.collapseBtn = resultsHeader.createEl('button', {
			cls: 'vp-icon-btn vp-collapse-btn',
			attr: { 'aria-label': 'Collapse Related Notes' }
		});
		setIcon(this.collapseBtn, 'chevron-up');
		this.collapseBtn.addEventListener('click', () => this.toggleRelatedNotesCollapse());

		this.resultsScrollEl = this.resultsSection.createEl('div', { cls: 'vp-results-scroll' });
		this.contentEl = this.resultsScrollEl;
		this.resultsEl = this.contentEl.createEl('div', { cls: 'vp-results-list' });

		// Load collapsed state from localStorage
		try {
			const savedState = localStorage.getItem('vp-related-notes-collapsed');
				if (savedState === 'true') {
					this.relatedNotesCollapsed = true;
					// Apply collapsed state immediately (without animation on initial load)
					// Only hide the scroll container, keep header visible
					if (this.resultsScrollEl) {
						this.resultsScrollEl.style.height = '0px';
						this.resultsScrollEl.style.overflow = 'hidden';
						this.resultsScrollEl.style.flex = '0 0 auto';
					}
					if (this.resultsSection) {
						this.resultsSection.style.flex = '0 0 auto';
					}
					if (this.collapseBtn) {
						setIcon(this.collapseBtn, 'chevron-down');
						this.collapseBtn.setAttribute('aria-label', 'Expand Related Notes');
					}
				}
		} catch (e) {
			console.warn('Failed to load Related Notes collapsed state:', e);
		}

		// Add chat UI at the bottom
		this.createChatUI(body);

		// Load active session
		if (this.sessionManager) {
			this.chatService.loadActiveSession();
			this.renderChatHistory();
			this.renderContextChips();
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

	/**
	 * Toggle collapse/expand state of Related Notes section with smooth animations.
	 * Only collapses the content area, keeping the header visible.
	 */
	private toggleRelatedNotesCollapse() {
		this.relatedNotesCollapsed = !this.relatedNotesCollapsed;

		// Save state to localStorage
		try {
			localStorage.setItem('vp-related-notes-collapsed', String(this.relatedNotesCollapsed));
		} catch (e) {
			console.warn('Failed to save Related Notes collapsed state:', e);
		}

		// Update icon and aria-label
		if (this.collapseBtn) {
			setIcon(this.collapseBtn, this.relatedNotesCollapsed ? 'chevron-down' : 'chevron-up');
			this.collapseBtn.setAttribute('aria-label',
				this.relatedNotesCollapsed ? 'Expand Related Notes' : 'Collapse Related Notes'
			);
		}

		if (!this.resultsScrollEl) return;

		// Animate collapse/expand - only the scroll container, not the entire section
			if (this.relatedNotesCollapsed) {
				// Collapse: capture current height and set as explicit height, then animate to 0
				const currentHeight = this.resultsScrollEl.offsetHeight;
				this.resultsScrollEl.style.height = currentHeight + 'px'; // Set explicit height for animation
				this.resultsScrollEl.style.overflow = 'hidden';
				this.resultsScrollEl.style.flex = '0 0 auto';
				if (this.resultsSection) {
					this.resultsSection.style.flex = '0 0 auto';
				}

				anime({
					targets: this.resultsScrollEl,
					height: '0px',
					duration: 350,
				easing: 'easeInOutCubic',
			});
			} else {
				// Expand: measure target height, then animate from 0
				this.resultsScrollEl.style.flex = '0 0 auto';
				this.resultsScrollEl.style.overflow = 'hidden';
				this.resultsScrollEl.style.height = ''; // remove inline height to measure content
				const targetHeight = this.resultsScrollEl.scrollHeight;
				if (this.resultsSection) {
					this.resultsSection.style.flex = '0 0 auto';
				}

				// Reset to 0 for animation start
				this.resultsScrollEl.style.height = '0px';

				anime({
					targets: this.resultsScrollEl,
					height: targetHeight + 'px',
					duration: 350,
					easing: 'easeInOutCubic',
					complete: () => {
						if (this.resultsScrollEl) {
							this.resultsScrollEl.style.height = ''; // Clear height to restore flex behavior
							this.resultsScrollEl.style.overflow = '';
							this.resultsScrollEl.style.flex = ''; // Revert to stylesheet flex sizing
						}
						if (this.resultsSection) {
							this.resultsSection.style.flex = ''; // Restore default flex ratio
						}
					}
				});
			}
		}

	private createChatUI(parent: HTMLElement) {
		this.chatContainer = parent.createEl('section', { cls: 'vp-section vp-section--chat' });

		const chatHeader = this.chatContainer.createEl('div', { cls: 'vp-section-header vp-chat-header' });
		chatHeader.createEl('h5', { text: 'Assistant Chat' });
		chatHeader.createEl('p', {
			cls: 'vp-section-subtitle',
			text: 'Ask follow-up questions about the active note.',
		});

		// Context bar with chips and + button
		const contextBar = this.chatContainer.createEl('div', { cls: 'vp-context-bar' });

		// + button to add context
		const addBtn = contextBar.createEl('button', {
			cls: 'vp-add-context-btn',
			attr: { 'aria-label': 'Add context file' }
		});
		setIcon(addBtn, 'plus-circle');
		addBtn.addEventListener('click', () => this.showAddContextPicker());

		// Chips container
		this.contextChipsContainer = contextBar.createEl('div', { cls: 'vp-context-chips' });

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
			// Handle @ mention popover navigation
			if (this.atMentionPopover) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					this.atMentionSelectedIndex = Math.min(
						this.atMentionSelectedIndex + 1,
						this.atMentionFiles.length - 1
					);
					this.renderAtMentionPopover();
					return;
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					this.atMentionSelectedIndex = Math.max(this.atMentionSelectedIndex - 1, 0);
					this.renderAtMentionPopover();
					return;
				} else if (e.key === 'Enter') {
					e.preventDefault();
					if (this.atMentionFiles[this.atMentionSelectedIndex]) {
						this.selectAtMentionFile(this.atMentionFiles[this.atMentionSelectedIndex]);
					}
					return;
				} else if (e.key === 'Escape') {
					e.preventDefault();
					this.closeAtMentionPopover();
					return;
				}
			}

			// Normal enter key handling (send message)
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Listen for @ mentions
		this.chatInputEl.addEventListener('input', () => {
			this.handleAtMentionInput();
		});

		// Model selection dropdown below the chat box
		this.createModelSelector(chatSurface);
	}

	private createModelSelector(container: HTMLElement) {
		const bar = container.createEl('div', { cls: 'vp-chat-modelbar' });
		const label = bar.createEl('label', { cls: 'vp-model-label', text: 'Model' });
		this.modelSelectEl = bar.createEl('select', { cls: 'vp-model-select' }) as HTMLSelectElement;

		// Placeholder option
		this.modelSelectEl.appendChild(new Option('Loading models…', '', false, false));
		this.modelSelectEl.disabled = true;

		this.modelSelectEl.addEventListener('change', () => {
			const selected = this.modelSelectEl?.value || '';
			if (selected) {
				this.chatService.setModel(selected);
				try { localStorage.setItem('vp-selected-chat-model', selected); } catch {}
			}
		});

		// Load models asynchronously
		this.loadAvailableModels();
	}

	private async loadAvailableModels() {
		const fallback = ['gemma3n:e2b', 'llama3.1:8b', 'qwen2.5:7b'];
		let models: string[] = [];
		const provider = this.provider || 'ollama';
		try {
			if (provider === 'lmstudio') {
				const baseUrl = this.lmStudioUrl.replace(/\/$/, '');
				let text: string | null = null;
				try {
					const r = await requestUrl({ url: `${baseUrl}/v1/models`, method: 'GET' });
					text = (r as any)?.text ?? r?.json ? JSON.stringify((r as any).json) : (r as any)?.data ?? null;
				} catch (_err) {
					try {
						const resp = await fetch(`${baseUrl}/v1/models`);
						if (resp.ok) text = await resp.text();
					} catch {}
				}
				if (text) {
					let data: any = null;
					try { data = JSON.parse(text); } catch {
						const start = text.indexOf('{');
						const end = text.lastIndexOf('}');
						if (start !== -1 && end !== -1 && end > start) {
							try { data = JSON.parse(text.slice(start, end + 1)); } catch {}
						}
					}
					const arr: any[] = Array.isArray((data as any)?.data)
						? (data as any).data
						: Array.isArray((data as any)?.models)
							? (data as any).models
							: Array.isArray(data)
								? (data as any)
								: [];
					models = arr
						.map((m: any) => typeof m === 'string' ? m : (m?.id || m?.name || m?.model))
						.filter(Boolean);
				}
			} else {
				const resp = await fetch(`${this.ollamaUrl.replace(/\/$/, '')}/api/tags`);
				if (resp.ok) {
					const data = await resp.json();
					if (Array.isArray(data?.models)) {
						models = data.models.map((m: any) => m.model || m.name).filter(Boolean);
					}
				}
			}
		} catch (err) {
			console.warn(`${provider === 'lmstudio' ? 'LM Studio' : 'Ollama'} model list fetch failed; using fallback list`, err);
		}
		if (models.length === 0) models = fallback;

		if (!this.modelSelectEl) return;
		this.modelSelectEl.empty();
		for (const m of models) {
			this.modelSelectEl.appendChild(new Option(m, m, false, false));
		}

		// Preselect from localStorage or first option
		let selected = '';
		try {
			selected = localStorage.getItem('vp-selected-chat-model')
				|| localStorage.getItem('vp-selected-model')
				|| '';
		} catch {}
		if ((!selected || !models.includes(selected)) && this.defaultChatModel && models.includes(this.defaultChatModel)) {
			selected = this.defaultChatModel;
		}
		if (selected && models.includes(selected)) {
			this.modelSelectEl.value = selected;
		} else {
			this.modelSelectEl.selectedIndex = 0;
			selected = this.modelSelectEl.value;
		}

		this.modelSelectEl.disabled = false;
		if (selected) this.chatService.setModel(selected);
	}

	private async sendMessage() {
		if (!this.chatInputEl || !this.chatMessagesEl) return;

		const message = this.chatInputEl.value.trim();
		if (!message) return;

		// Build context from active file + attached files
		const context = await this.buildContextFromAttachments();

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
				const msg = (err instanceof Error ? err.message : 'Unknown error') || '';
				const isConnErr = /fetch|network|failed|ECONN|connection|refused|CORS/i.test(msg);
				if (isConnErr) {
					const friendly = this.provider === 'lmstudio'
						? 'Could not connect to LM Studio. Is Local Server enabled?'
						: 'Could not connect to Ollama. Is it running?';
					errorContent.textContent = `⚠️ ${friendly}`;
				} else {
					errorContent.textContent = 'Error: ' + (msg || 'Unknown error');
				}
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

		// Clear and re-render chips for new session
		this.renderContextChips();
	}

	private loadSession(sessionId: string) {
		if (!this.sessionManager) return;

		// Load session into ChatService
		this.chatService.loadSession(sessionId);

		// Re-render chat history
		this.renderChatHistory();

		// Re-render context chips
		this.renderContextChips();
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

	private renderContextChips() {
		if (!this.contextChipsContainer || !this.sessionManager) return;

		// Clear existing chips
		this.contextChipsContainer.empty();

		// Get active session's context files
		const activeSession = this.sessionManager.getActiveSession();
		if (!activeSession || !activeSession.contextFiles || activeSession.contextFiles.length === 0) {
			return;
		}

		// Render chip for each context file
		for (const filePath of activeSession.contextFiles) {
			const file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
			if (!file) continue; // Skip missing files

			const chip = this.contextChipsContainer.createEl('div', { cls: 'vp-context-chip' });
			chip.tabIndex = 0;

			// Chip content: basename • path
			const chipLabel = chip.createEl('span', { cls: 'vp-context-chip__label' });
			const basename = file.basename;
			const pathLabel = this.getResultPathLabel(filePath);
			chipLabel.textContent = `${basename} • ${pathLabel}`;

			// Remove button
			const removeBtn = chip.createEl('button', {
				cls: 'vp-context-chip__remove',
				attr: { 'aria-label': 'Remove from context' }
			});
			setIcon(removeBtn, 'x');

			// Click chip to open file
			chip.addEventListener('click', (e) => {
				if (e.target === removeBtn || removeBtn.contains(e.target as Node)) {
					return; // Let remove button handle its own click
				}
				this.openFile(filePath);
			});

			// Click × to remove
			removeBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.removeContextFile(filePath);
			});

			// Keyboard support
			chip.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
					e.preventDefault();
					this.openFile(filePath);
				}
			});
		}
	}

	private async removeContextFile(filePath: string) {
		if (!this.sessionManager) return;

		const activeSession = this.sessionManager.getActiveSession();
		if (!activeSession) return;

		// Remove from session
		this.sessionManager.removeContextFile(activeSession.id, filePath);

		// Save session
		if (this.onSessionSave) {
			await this.onSessionSave();
		}

		// Re-render chips
		this.renderContextChips();
	}

	private showAddContextPicker() {
		// Open searchable modal for selecting context files
		const modal = new NoteSearchModal(
			this.app,
			this.retrieval,
			async (path: string) => {
				await this.addContextFile(path);
			}
		);
		modal.open();
	}

	private async addContextFile(filePath: string) {
		if (!this.sessionManager) return;

		const activeSession = this.sessionManager.getActiveSession();
		if (!activeSession) return;

		// Add to session
		this.sessionManager.addContextFiles(activeSession.id, [filePath]);

		// Save session
		if (this.onSessionSave) {
			await this.onSessionSave();
		}

		// Re-render chips
		this.renderContextChips();
	}

	/**
	 * Public method to refresh context chips UI.
	 * Called externally (e.g., from main.ts context menu handler).
	 */
	refreshContextChips() {
		this.renderContextChips();
	}

	/**
	 * Handle @ mention input detection and popover management.
	 */
	private handleAtMentionInput() {
		if (!this.chatInputEl) return;

		const value = this.chatInputEl.value;
		const cursorPos = this.chatInputEl.selectionStart;

		// Find text from last whitespace (or start) to cursor
		const textBeforeCursor = value.substring(0, cursorPos);
		const lastWhitespace = Math.max(
			textBeforeCursor.lastIndexOf(' '),
			textBeforeCursor.lastIndexOf('\n')
		);
		const currentWord = textBeforeCursor.substring(lastWhitespace + 1);

		// Check if it starts with @
		const atMatch = currentWord.match(/^@(\w*)$/);

		if (atMatch) {
			const query = atMatch[1] || '';
			this.showAtMentionPopover(query);
		} else {
			this.closeAtMentionPopover();
		}
	}

	/**
	 * Show @ mention popover with file suggestions.
	 */
	private showAtMentionPopover(query: string) {
		this.atMentionQuery = query;
		this.atMentionFiles = this.getAtMentionSuggestions(query);
		this.atMentionSelectedIndex = 0;

		if (this.atMentionFiles.length === 0) {
			this.closeAtMentionPopover();
			return;
		}

		if (!this.atMentionPopover) {
			this.atMentionPopover = document.body.createEl('div', { cls: 'vp-at-mention-popover' });

			// Close on outside click
			const closeHandler = (e: MouseEvent) => {
				if (this.atMentionPopover && !this.atMentionPopover.contains(e.target as Node)) {
					this.closeAtMentionPopover();
					document.removeEventListener('click', closeHandler);
				}
			};
			setTimeout(() => document.addEventListener('click', closeHandler), 0);
		}

		this.renderAtMentionPopover();
		this.positionAtMentionPopover();
	}

	/**
	 * Render @ mention popover suggestions.
	 */
	private renderAtMentionPopover() {
		if (!this.atMentionPopover) return;

		this.atMentionPopover.empty();

		for (let i = 0; i < this.atMentionFiles.length; i++) {
			const file = this.atMentionFiles[i];
			const item = this.atMentionPopover.createEl('div', { cls: 'vp-at-mention-item' });

			if (i === this.atMentionSelectedIndex) {
				item.addClass('vp-at-mention-item--selected');
			}

			const title = item.createEl('div', { cls: 'vp-at-mention-title', text: file.basename });
			const path = item.createEl('div', { cls: 'vp-at-mention-path', text: this.getResultPathLabel(file.path) });

			item.addEventListener('click', () => {
				this.selectAtMentionFile(file);
			});

			// Scroll selected item into view
			if (i === this.atMentionSelectedIndex) {
				item.scrollIntoView({ block: 'nearest' });
			}
		}
	}

	/**
	 * Position @ mention popover below the chat input.
	 */
	private positionAtMentionPopover() {
		if (!this.atMentionPopover || !this.chatInputEl) return;

		const rect = this.chatInputEl.getBoundingClientRect();
		this.atMentionPopover.style.top = `${rect.bottom + 4}px`;
		this.atMentionPopover.style.left = `${rect.left}px`;
		this.atMentionPopover.style.width = `${rect.width}px`;
	}

	/**
	 * Close @ mention popover.
	 */
	private closeAtMentionPopover() {
		if (this.atMentionPopover) {
			this.atMentionPopover.remove();
			this.atMentionPopover = null;
		}
		this.atMentionFiles = [];
		this.atMentionSelectedIndex = 0;
		this.atMentionQuery = null;
	}

	/**
	 * Select a file from @ mention popover.
	 */
	private async selectAtMentionFile(file: TFile) {
		// Remove @ mention text from input
		if (this.chatInputEl) {
			const value = this.chatInputEl.value;
			const cursorPos = this.chatInputEl.selectionStart;
			const textBeforeCursor = value.substring(0, cursorPos);
			const lastWhitespace = Math.max(
				textBeforeCursor.lastIndexOf(' '),
				textBeforeCursor.lastIndexOf('\n')
			);
			const beforeAt = value.substring(0, lastWhitespace + 1);
			const afterCursor = value.substring(cursorPos);
			this.chatInputEl.value = beforeAt + afterCursor;
			this.chatInputEl.selectionStart = this.chatInputEl.selectionEnd = beforeAt.length;
		}

		// Attach file
		await this.addContextFile(file.path);

		// Close popover
		this.closeAtMentionPopover();

		// Focus back on input
		this.chatInputEl?.focus();
	}

	/**
	 * Get file suggestions for @ mention query.
	 */
	private getAtMentionSuggestions(query: string): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();

		// Empty query: return recent files
		if (!query || query.trim().length === 0) {
			return allFiles
				.sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
				.slice(0, 10);
		}

		// Try using RetrievalService for intelligent search
		if (this.retrieval) {
			try {
				const results = this.retrieval.search(query, { limit: 10 });
				const files: TFile[] = [];
				for (const result of results) {
					const file = this.app.vault.getAbstractFileByPath(result.path) as TFile;
					if (file) {
						files.push(file);
					}
				}
				if (files.length > 0) {
					return files;
				}
			} catch (err) {
				console.warn('DiscoverView: @ mention search failed, using fallback', err);
			}
		}

		// Fallback: simple basename filtering
		const lowerQuery = query.toLowerCase();
		return allFiles
			.filter(file => file.basename.toLowerCase().includes(lowerQuery))
			.slice(0, 10);
	}

	/**
	 * Build context string from active file + attached context files.
	 * Returns fenced content for each file with distinct markers.
	 */
	private async buildContextFromAttachments(): Promise<string> {
		const contextParts: string[] = [];
		const processedPaths = new Set<string>();

		// Track active file path
		const activeFile = this.app.workspace.getActiveFile?.();
		const activeFilePath = (activeFile && (activeFile as any).extension === 'md') ? activeFile.path : null;

		// Collect all paths to include
		const pathsToInclude: string[] = [];

		// Add active file
		if (activeFilePath) {
			pathsToInclude.push(activeFilePath);
		}

		// Add attached context files
		if (this.sessionManager) {
			const activeSession = this.sessionManager.getActiveSession();
			if (activeSession && activeSession.contextFiles) {
				pathsToInclude.push(...activeSession.contextFiles);
			}
		}

		// Dedupe paths
		const uniquePaths = Array.from(new Set(pathsToInclude));

		// Read and fence each file
		for (const filePath of uniquePaths) {
			if (processedPaths.has(filePath)) continue;
			processedPaths.add(filePath);

			const file = this.app.vault.getAbstractFileByPath(filePath) as TFile | null;
			if (!file) {
				console.log(`VaultPilot: Skipping missing file: ${filePath}`);
				continue;
			}

			try {
				const content = await (this.app.vault as any).read(file);

				// Use different fence markers for active file vs attached files
				const isActiveFile = filePath === activeFilePath;
				const beginMarker = isActiveFile
					? `--- BEGIN ACTIVE FILE: ${filePath} ---`
					: `--- BEGIN ATTACHED FILE: ${filePath} ---`;
				const endMarker = isActiveFile
					? `--- END ACTIVE FILE ---`
					: `--- END ATTACHED FILE ---`;

				const fencedContent = `${beginMarker}\n${content}\n${endMarker}\n\n`;
				contextParts.push(fencedContent);
			} catch (err) {
				console.warn(`VaultPilot: Error reading file ${filePath}:`, err);
			}
		}

		const finalContext = contextParts.join('');
		const fileCount = contextParts.length;
		const charCount = finalContext.length;

		if (fileCount > 0) {
			console.log(`VaultPilot: Assembled context from ${fileCount} file(s) (${charCount} chars total)`);
		}

		return finalContext;
	}
}
