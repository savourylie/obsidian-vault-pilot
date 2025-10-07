import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Editor, TFile, EditorPosition, requestUrl } from 'obsidian';
import { DiscoverView, VIEW_TYPE_DISCOVER } from './ui/DiscoverView';
import { IndexingService, AnySerializedIndex } from './services/IndexingService';
import { RetrievalService } from './services/RetrievalService';
import { EditModal } from './ui/EditModal';
import { TagSuggestionModal } from './ui/TagSuggestionModal';
import { suggestTags, extractInlineTags, extractFrontmatterTags, mergeTagsIntoContent } from './services/TaggingService';
import { SuggestionCallout } from './ui/SuggestionCallout';
import { createAdapter } from './llm/adapterFactory';
import { ContextAssembler } from './services/ContextAssembler';
import { SessionManager } from './services/SessionManager';
import { ChatSessionsData } from './types/chat';

interface QuickActionsConfig {
	rewrite: string;
	tighten: string;
	expand: string;
	grammar: string;
	translate: string;
}

interface SerendipityPluginSettings {
	provider: 'ollama' | 'lmstudio';
	ollamaUrl: string;
	lmStudioUrl: string;
	maxPromptTokens: number;
	reservedResponseTokens: number;
	recentMessagesToKeep: number;
	minRecentMessagesToKeep: number;
	quickActions: QuickActionsConfig;
	systemPrompt: string;
	defaultChatModel: string;
	defaultEditModel: string;
	// Tag suggestion settings (Ticket 39)
	tagSuggestions?: {
		useLLM: boolean;
		min: number;
		max: number;
		confirmBeforeInsert: boolean;
		modelOverride: string; // empty = use defaultChatModel
	};
}

const DEFAULT_SETTINGS: SerendipityPluginSettings = {
	provider: 'ollama',
	ollamaUrl: 'http://localhost:11434',
	lmStudioUrl: 'http://localhost:1234',
	maxPromptTokens: 8192,
	reservedResponseTokens: 512,
	recentMessagesToKeep: 6,
	minRecentMessagesToKeep: 2,
	quickActions: {
		rewrite: 'Rewrite this text to be clearer and more engaging.',
		tighten: 'Make this text more concise while preserving key information.',
		expand: 'Expand this text with more detail and examples.',
		grammar: 'Fix grammar, spelling, and punctuation errors.',
		translate: 'Translate this text to Spanish.',
	},
	systemPrompt: 'You are an AI writing assistant for Obsidian. Your task is to help the user edit their note.',
	defaultChatModel: 'gemma3n:e2b',
	defaultEditModel: 'gemma3n:e2b',
	tagSuggestions: {
		useLLM: true,
		min: 3,
		max: 5,
		confirmBeforeInsert: true,
		modelOverride: '',
	},
}

export default class SerendipityPlugin extends Plugin {
	settings: SerendipityPluginSettings;
	private dataBlob: any | undefined;
	indexingService: IndexingService;
	retrievalService: RetrievalService;
	sessionManager: SessionManager;

	async onload() {
		await this.loadSettings();

		// Init services
		this.indexingService = new IndexingService(this.app);
		this.retrievalService = new RetrievalService(this.app, this.indexingService);

		// Load persisted index (if present)
		const persistedIndex = this.dataBlob?.index as AnySerializedIndex | undefined;
		if (persistedIndex) {
			this.indexingService.load(persistedIndex);
		}

		// Init session manager with persisted sessions
		const persistedSessions = this.dataBlob?.chatSessions as ChatSessionsData | undefined;
		this.sessionManager = new SessionManager(persistedSessions);

		// Register the Discover View
		this.registerView(
			VIEW_TYPE_DISCOVER,
			(leaf) => new DiscoverView(
				leaf,
				this.retrievalService,
				this.settings.ollamaUrl,
				this.sessionManager,
				() => this.saveSessions(),
				{
					maxPromptTokens: this.settings.maxPromptTokens,
					reservedResponseTokens: this.settings.reservedResponseTokens,
					recentMessagesToKeep: this.settings.recentMessagesToKeep,
					minRecentMessagesToKeep: this.settings.minRecentMessagesToKeep,
				},
				this.settings.defaultChatModel,
				this.settings.provider,
				this.settings.lmStudioUrl
			)
		);

		// Add a ribbon icon for quick access (chat-style icon)
		this.addRibbonIcon('message-circle', 'VaultPilot: Toggle Discover Panel', () => {
			this.toggleDiscoverView();
		});

		// Add command to toggle the Discover view
		this.addCommand({
			id: 'toggle-discover-panel',
			name: 'Toggle Discover Panel',
			callback: () => {
				this.toggleDiscoverView();
			},
		});

		// Add command to rebuild the local index
		this.addCommand({
			id: 'reindex-vault',
			name: 'Reindex Vault',
			callback: async () => {
				console.log('VaultPilot: Reindex started');
				await this.indexingService.buildIndex();
				await this.saveIndex();
				console.log('VaultPilot: Reindex complete');
			},
		});

		// Add command for inline AI editing
		this.addCommand({
			id: 'ai-edit-selection',
			name: 'Edit selection with AI',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'e' }],
			callback: () => {
				console.log('VaultPilot: ai-edit-selection command triggered');
				this.handleAIEdit();
			},
		});
		console.log('VaultPilot: ai-edit-selection command registered');


		// Add command: Suggest Hashtags for Current Note
		this.addCommand({
			id: 'suggest-hashtags-current-note',
			name: 'Suggest Hashtags for Current Note',
			hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'h' }],
			callback: async () => {
				console.log('VaultPilot: suggest-hashtags command triggered');
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					new Notice('No active note found');
					console.warn('VaultPilot: No active MarkdownView when suggesting hashtags');
					return;
				}
				const editor = view.editor;
				const content = editor.getValue();
				console.log('VaultPilot: Note content length =', content?.length ?? 0);
				const existing = new Set<string>([
					...extractInlineTags(content),
					...extractFrontmatterTags(content),
				]);
				console.log('VaultPilot: Existing tags found =', Array.from(existing));

				const ts = this.settings.tagSuggestions || { useLLM: true, min: 3, max: 5, confirmBeforeInsert: true, modelOverride: '' };
				const min = Math.max(1, ts.min || 3);
				const max = Math.max(min, ts.max || 5);
				const model = (ts.modelOverride && ts.modelOverride.trim()) ? ts.modelOverride.trim() : this.settings.defaultChatModel;
				const useLLM = ts.useLLM !== false;

				let suggestions: string[] = [];
				try {
					const adapter = createAdapter({
						provider: this.settings.provider || 'ollama',
						ollamaUrl: this.settings.ollamaUrl,
						lmStudioUrl: this.settings.lmStudioUrl,
						defaultModel: model,
					});
					suggestions = await suggestTags(this.app, content, {
						useLLM,
						ollamaUrl: this.settings.ollamaUrl,
						model,
						minSuggestions: min,
						maxSuggestions: max,
						indexStats: this.indexingService,
						llmAdapter: adapter,
					}, existing);
					console.log('VaultPilot: Suggestions returned =', suggestions);
				} catch (err) {
					console.error('VaultPilot: suggestTags error', err);
					if (useLLM) {
						const provider = this.settings.provider || 'ollama';
						const base = provider === 'lmstudio'
							? 'Could not connect to LM Studio. Using local fallback.'
							: 'Could not connect to Ollama. Using local fallback.';
						new Notice(`⚠️ ${base}`);
					}
				}

				if (!suggestions || suggestions.length === 0) {
					new Notice('No tag suggestions found');
					console.warn('VaultPilot: No suggestions generated');
					return;
				}

				if (ts.confirmBeforeInsert !== false) {
					console.log('VaultPilot: Opening TagSuggestionModal with', suggestions.length, 'items');
					new TagSuggestionModal(this.app, {
						suggestions,
						onConfirm: (selected) => {
							console.log('VaultPilot: Modal confirmed with selected tags =', selected);
							if (!selected || selected.length === 0) return;
							const latest = editor.getValue();
							const res = mergeTagsIntoContent(latest, selected);
							console.log('VaultPilot: mergeTagsIntoContent changed =', res.changed);
							if (!res.changed) {
								new Notice('No new tags to insert');
								console.log('VaultPilot: Nothing new to insert (all tags already present)');
								return;
							}
							editor.setValue(res.content);
							new Notice(`Inserted tags: ${selected.join(' ')}`);
							console.log('VaultPilot: Inserted tags successfully');
						},
					}).open();
				} else {
					console.log('VaultPilot: Quick insert path (no confirm) with', suggestions.length, 'tags');
					const latest = editor.getValue();
					const res = mergeTagsIntoContent(latest, suggestions);
					if (!res.changed) {
						new Notice('No new tags to insert');
						return;
					}
					editor.setValue(res.content);
					new Notice(`Inserted tags: ${suggestions.join(' ')}`);
				}
			},
		});


		// Wire vault + metadata events for incremental updates
		this.registerEvent(this.app.vault.on('create', async (file: any) => {
			if (file?.extension !== 'md') return;
			await this.indexingService.updateIndex(file);
			await this.saveIndex();
		}));
		this.registerEvent(this.app.vault.on('modify', async (file: any) => {
			if (file?.extension !== 'md') return;
			await this.indexingService.updateIndex(file);
			await this.saveIndex();
		}));
		this.registerEvent(this.app.vault.on('delete', async (file: any) => {
			if (!file) return;
			this.indexingService.removeFromIndex(file);
			await this.saveIndex();

			// Remove deleted file from all session context files
			this.sessionManager.deleteContextFile(file.path);
			await this.saveSessions();

			// Refresh chips in all open DiscoverViews
			this.refreshAllDiscoverViewChips();
		}));
		this.registerEvent(this.app.vault.on('rename', async (file: any, oldPath: string) => {
			if (oldPath) {
				this.indexingService.removeFromIndex(oldPath);

				// Update context file paths in all sessions
				this.sessionManager.renameContextFile(oldPath, file.path);
				await this.saveSessions();

				// Refresh chips in all open DiscoverViews
				this.refreshAllDiscoverViewChips();
			}
			if (file?.extension === 'md') {
				await this.indexingService.updateIndex(file);
				await this.saveIndex();
			}
		}));
		this.registerEvent((this.app.metadataCache as any).on?.('changed', async (file: any) => {
			if (file?.extension !== 'md') return;
			await this.indexingService.updateIndex(file);
			await this.saveIndex();
		}));

		// Register file-menu event for "Add to Assistant Context"
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			// Only show for markdown files
			if (!file || (file as TFile).extension !== 'md') {
				return;
			}

			menu.addItem((item) => {
				item
					.setTitle('Add to Assistant Context')
					.setIcon('plus-circle')
					.onClick(async () => {
						await this.handleAddToContext(file as TFile);
					});
			});
		}));

		// Add the settings tab
		this.addSettingTab(new SerendipitySettingTab(this.app, this));

		console.log('VaultPilot plugin loaded.');
	}

	onunload() {
		console.log('VaultPilot plugin unloaded.');
	}

	async loadSettings() {
		const blob = await this.loadData();
		this.dataBlob = blob || {};
		const loadedSettings = (blob && (blob as any).settings) ? (blob as any).settings : blob;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings || {});
	}



	async saveSettings() {
		this.dataBlob = this.dataBlob || {};
		(this.dataBlob as any).settings = this.settings;
		await this.saveData(this.dataBlob);
	}

	private async saveIndex() {
		this.dataBlob = this.dataBlob || {};
		(this.dataBlob as any).index = this.indexingService.export();
		await this.saveData(this.dataBlob);
	}

	async saveSessions() {
		this.dataBlob = this.dataBlob || {};
		(this.dataBlob as any).chatSessions = this.sessionManager.export();
		await this.saveData(this.dataBlob);
	}

	async toggleDiscoverView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
		if (existing.length > 0) {
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_DISCOVER);
			return;
		}

		let rightLeaf = this.app.workspace.getRightLeaf(false);
		if (!rightLeaf) {
			// Ensure a right sidebar leaf exists in fresh sessions
			rightLeaf = this.app.workspace.getRightLeaf(true);
		}

			await rightLeaf.setViewState({
				type: VIEW_TYPE_DISCOVER,
				active: true,
			});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER)[0]
		);
	}

	async handleAddToContext(file: TFile) {
		// Get active DiscoverView
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
		if (leaves.length === 0) {
			new Notice('Please open the Discover panel first (VaultPilot icon in sidebar)');
			return;
		}

		const discoverView = leaves[0].view as DiscoverView;
		if (!discoverView) {
			new Notice('Could not access Discover view');
			return;
		}

		// Get active session
		const activeSession = this.sessionManager.getActiveSession();
		if (!activeSession) {
			new Notice('No active chat session');
			return;
		}

		// Add file to context
		this.sessionManager.addContextFiles(activeSession.id, [file.path]);
		await this.saveSessions();

		// Refresh UI to show the chip immediately
		discoverView.refreshContextChips();

		new Notice(`Added "${file.basename}" to chat context`);
		console.log(`VaultPilot: Added ${file.path} to session ${activeSession.id}`);
	}

	/**
	 * Refresh context chips in all open DiscoverView instances.
	 */
	private refreshAllDiscoverViewChips() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
		for (const leaf of leaves) {
			const view = leaf.view as DiscoverView;
			if (view && view.refreshContextChips) {
				view.refreshContextChips();
			}
		}
	}

	/**
	 * Update provider settings in all open DiscoverView instances.
	 * Called when LLM provider or base URLs change in settings.
	 */
	private refreshAllDiscoverViewProviderSettings() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER);
		for (const leaf of leaves) {
			const view = leaf.view as DiscoverView;
			if (view && view.updateProviderSettings) {
				view.updateProviderSettings(
					this.settings.provider,
					this.settings.ollamaUrl,
					this.settings.lmStudioUrl
				);
			}
		}
	}

	handleAIEdit() {
		console.log('VaultPilot: handleAIEdit called');
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!view) {
			new Notice('No active note found');
			return;
		}

		const editor = view.editor;
		const selection = editor.getSelection();

		if (!selection || selection.trim().length === 0) {
			new Notice('Please select some text first');
			return;
		}

		const file = view.file;
		if (!file) {
			new Notice('No file found');
			return;
		}

		// Save selection positions BEFORE opening modal
		const selectionStart = editor.getCursor('from');
		const selectionEnd = editor.getCursor('to');

		// Open the edit modal
		new EditModal(this.app, {
			selection,
			file,
			ollamaUrl: this.settings.ollamaUrl,
			provider: this.settings.provider,
			lmStudioUrl: this.settings.lmStudioUrl,
			presets: this.settings.quickActions,
			defaultModel: this.settings.defaultEditModel,
			onSubmit: async (instruction, model) => {
				await this.generateSuggestion(editor, file, selection, instruction, selectionStart, selectionEnd, model);
			},
		}).open();
	}

	async generateSuggestion(
		editor: Editor,
		file: TFile,
		selection: string,
		instruction: string,
		selectionStart: EditorPosition,
		selectionEnd: EditorPosition,
		model?: string
	) {
		console.log('VaultPilot: generateSuggestion called');
		console.log('VaultPilot: Instruction:', instruction);

		try {
			// Assemble context with retrieval
			const assembler = new ContextAssembler(this.app, this.retrievalService, {
				systemPrompt: this.settings.systemPrompt,
			});
			const prompt = assembler.assembleContext(selection, file, instruction);

			console.log('VaultPilot: Prompt assembled, calling provider...', this.settings.provider);

			// Stream response via selected provider
			const adapter = createAdapter({
				provider: this.settings.provider || 'ollama',
				ollamaUrl: this.settings.ollamaUrl,
				lmStudioUrl: this.settings.lmStudioUrl,
				defaultModel: this.settings.defaultEditModel,
			});
			const chunks: string[] = [];

			await adapter.stream(prompt, (chunk) => {
				chunks.push(chunk);
			}, { model });

			const suggestion = chunks.join('').trim();

			console.log('VaultPilot: Received suggestion:', suggestion.slice(0, 100) + '...');

			if (!suggestion || suggestion.length === 0) {
				new Notice('⚠️ No suggestion generated');
				return;
			}

			// Insert suggestion callout
			const callout = new SuggestionCallout(this.app);
			callout.insert(editor, {
				original: selection,
				suggestion,
				selectionStart,
				selectionEnd,
			});

			new Notice('✓ AI suggestion generated');
		} catch (err) {
			console.error('VaultPilot: AI Edit error:', err);

			// Check if it's a connection error
			if (err instanceof Error && (err.message.includes('fetch') || err.message.includes('ECONNREFUSED'))) {
				const provider = this.settings.provider || 'ollama';
				if (provider === 'lmstudio') {
					new Notice('⚠️ Could not connect to LM Studio. Is Local Server enabled?');
				} else {
					new Notice('⚠️ Could not connect to Ollama. Is it running?');
				}
			} else {
				new Notice('⚠️ Error generating suggestion: ' + (err instanceof Error ? err.message : 'Unknown error'));
			}
		}
	}

	testSuggestionCallout() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('No active note found');
			return;
		}

		const editor = view.editor;
		const selection = editor.getSelection();

		if (!selection || selection.trim().length === 0) {
			new Notice('Please select some text first');
			return;
		}

		// Create a test suggestion (simple example: make text uppercase)
		const original = selection;
		const suggestion = selection.toUpperCase();

		// Get selection positions
		const selectionStart = editor.getCursor('from');
		const selectionEnd = editor.getCursor('to');

		// Insert suggestion callout
		const callout = new SuggestionCallout(this.app);
		callout.insert(editor, {
			original,
			suggestion,
			sources: ['Test Note A', 'Test Note B'],
			selectionStart,
			selectionEnd,
		});

		new Notice('Test callout inserted! Check below your selection.');
	}
}

class SerendipitySettingTab extends PluginSettingTab {
	plugin: SerendipityPlugin;

	constructor(app: App, plugin: SerendipityPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

		display(): void {
			const {containerEl} = this;

		containerEl.empty();

		// Debounce handle for model reloads when base URL changes
		let modelsReloadTimer: number | null = null;

			containerEl.createEl('h2', {text: 'VaultPilot Settings'});

		// Provider selector
		new Setting(containerEl)
			.setName('LLM Provider')
			.setDesc('Choose which local LLM server to use.')
			.addDropdown((drop: any) => {
				drop.addOption('ollama', 'Ollama');
				drop.addOption('lmstudio', 'LM Studio');
				drop.setValue(this.plugin.settings.provider || 'ollama');
				drop.onChange(async (value: string) => {
					this.plugin.settings.provider = (value === 'lmstudio') ? 'lmstudio' : 'ollama';
					await this.plugin.saveSettings();
					// Update DiscoverView instances with new provider
					this.plugin.refreshAllDiscoverViewProviderSettings();
					// Update visible base URL field
					try { updateProviderVisibility(); } catch {}
					// Debounce reload of available models (provider-aware fetch in Ticket 042)
					if (modelsReloadTimer) window.clearTimeout(modelsReloadTimer);
					modelsReloadTimer = window.setTimeout(async () => {
						try {
							// @ts-ignore - defined within display scope
							await loadModelsAndPopulate(true);
						} catch {}
					}, 600);
				});
			});

		const ollamaUrlSetting = new Setting(containerEl)
			.setName('Ollama Base URL')
			.setDesc('The base URL for the Ollama API.')
			.addText(text => text
				.setPlaceholder('http://localhost:11434')
				.setValue(this.plugin.settings.ollamaUrl)
				.onChange(async (value) => {
					this.plugin.settings.ollamaUrl = value;
					await this.plugin.saveSettings();
					// Update DiscoverView instances with new URL
					this.plugin.refreshAllDiscoverViewProviderSettings();
					// Debounce reload of available models for dropdowns
					if (modelsReloadTimer) {
						window.clearTimeout(modelsReloadTimer);
					}
					modelsReloadTimer = window.setTimeout(async () => {
						try {
							// @ts-ignore - defined within display scope
							await loadModelsAndPopulate(true);
						} catch {}
					}, 600);
				}));

		// LM Studio Base URL (shown when provider = LM Studio)
		const lmStudioUrlSetting = new Setting(containerEl)
			.setName('LM Studio Base URL')
			.setDesc('Base URL for LM Studio Local Server (OpenAI-compatible).')
			.addText(text => text
				.setPlaceholder('http://localhost:1234')
				.setValue(this.plugin.settings.lmStudioUrl || 'http://localhost:1234')
				.onChange(async (value) => {
					this.plugin.settings.lmStudioUrl = value;
					await this.plugin.saveSettings();
					// Update DiscoverView instances with new URL
					this.plugin.refreshAllDiscoverViewProviderSettings();
					// Debounce reload of available models for dropdowns
					if (modelsReloadTimer) {
						window.clearTimeout(modelsReloadTimer);
					}
					modelsReloadTimer = window.setTimeout(async () => {
						try {
							// @ts-ignore - defined within display scope
							await loadModelsAndPopulate(true);
						} catch {}
					}, 600);
				}));

		const updateProviderVisibility = () => {
			const isLM = this.plugin.settings.provider === 'lmstudio';
			(ollamaUrlSetting as any)?.settingEl && ((ollamaUrlSetting as any).settingEl.style.display = isLM ? 'none' : '');
			(lmStudioUrlSetting as any)?.settingEl && ((lmStudioUrlSetting as any).settingEl.style.display = isLM ? '' : 'none');
		};

		updateProviderVisibility();

		containerEl.createEl('h3', {text: 'Chat Token Window Settings'});

		new Setting(containerEl)
			.setName('Max Prompt Tokens')
			.setDesc('Maximum number of tokens allowed in the chat prompt (hard cap for input tokens).')
			.addText(text => text
				.setPlaceholder('8192')
				.setValue(String(this.plugin.settings.maxPromptTokens))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.maxPromptTokens = num;
						// Validate that reserved < max
						if (this.plugin.settings.reservedResponseTokens >= num) {
							this.plugin.settings.reservedResponseTokens = Math.max(1, num - 1);
						}
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Reserved Response Tokens')
			.setDesc('Number of tokens reserved for the model\'s response (must be less than max prompt tokens).')
			.addText(text => text
				.setPlaceholder('512')
				.setValue(String(this.plugin.settings.reservedResponseTokens))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1 && num < this.plugin.settings.maxPromptTokens) {
						this.plugin.settings.reservedResponseTokens = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Recent Messages to Keep')
			.setDesc('Target number of recent messages to keep verbatim in chat history.')
			.addText(text => text
				.setPlaceholder('6')
				.setValue(String(this.plugin.settings.recentMessagesToKeep))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.recentMessagesToKeep = num;
						// Validate that min <= recent
						if (this.plugin.settings.minRecentMessagesToKeep > num) {
							this.plugin.settings.minRecentMessagesToKeep = num;
						}
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Min Recent Messages to Keep')
			.setDesc('Minimum number of recent messages to preserve before compressing (must be ≤ recent messages to keep).')
			.addText(text => text
				.setPlaceholder('2')
				.setValue(String(this.plugin.settings.minRecentMessagesToKeep))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1 && num <= this.plugin.settings.recentMessagesToKeep) {
						this.plugin.settings.minRecentMessagesToKeep = num;
						await this.plugin.saveSettings();
					}
				}));


		// Placeholders to hold dropdown references and help messages
		let chatModelDropdown: any = null;
		let editModelDropdown: any = null;
		let chatHelpEl: HTMLElement | null = null;
		let editHelpEl: HTMLElement | null = null;
		let chatReloadBtn: any = null;
		let editReloadBtn: any = null;

		const showModelsWarning = (el: HTMLElement) => {
			el.empty();
			const isLM = (this.plugin.settings.provider === 'lmstudio');
			if (isLM) {
				const note = el.createEl('div', { text: 'Could not load models from LM Studio. ' });
				note.appendText('Enable the Local Server (OpenAI-compatible) in LM Studio: ');
				note.createEl('a', { text: 'LM Studio', attr: { href: 'https://lmstudio.ai' } });
				note.addClass('setting-item-description');
			} else {
				const note = el.createEl('div', { text: 'Could not load models from Ollama. ' });
				note.appendText('Install or start Ollama: ');
				note.createEl('a', { text: 'Download Ollama', attr: { href: 'https://ollama.com/download' } });
				note.addClass('setting-item-description');
			}
		};

		const clearWarning = (el: HTMLElement) => { el.empty(); };

		new Setting(containerEl)
			.setName('Default Chat Model')
			.setDesc('Model preselected in Discover chat (overrideable from the chat dropdown).')
			.addDropdown((drop: any) => {
				chatModelDropdown = drop;
				drop.addOption('', 'Loading models…');
				drop.setValue('');
				drop.onChange(async (value: string) => {
					this.plugin.settings.defaultChatModel = value;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((btn: any) => {
				chatReloadBtn = btn;
				btn.setIcon?.('refresh-ccw');
				btn.setTooltip?.('Reload models');
				btn.onClick?.(async () => {
					try { await loadModelsAndPopulate(true); } catch {}
				});
			});
		chatHelpEl = containerEl.createEl('div');

		containerEl.createEl('h3', { text: 'Edit with AI' });

		new Setting(containerEl)
			.setName('Shared System Prompt')
			.setDesc('Prepended to every Edit with AI request. Keep concise; you can override style in the instruction.')
			.addText(text => text
				.setPlaceholder('You are an AI writing assistant for Obsidian...')
				.setValue(this.plugin.settings.systemPrompt || '')
				.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName('Default Edit Model')
			.setDesc('Model preselected in the Edit with AI modal (overrideable from the dropdown).')
			.addDropdown((drop: any) => {
				editModelDropdown = drop;
				drop.addOption('', 'Loading models…');
				drop.setValue('');
				drop.onChange(async (value: string) => {
					this.plugin.settings.defaultEditModel = value;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((btn: any) => {
				editReloadBtn = btn;
				btn.setIcon?.('refresh-ccw');
				btn.setTooltip?.('Reload models');
				btn.onClick?.(async () => {
					try { await loadModelsAndPopulate(); } catch {}
				});
			});
		editHelpEl = containerEl.createEl('div');

		// Fetch models from Ollama and populate dropdowns
		const setReloadButtonsLoading = (loading: boolean) => {
			if (chatReloadBtn && chatReloadBtn.setDisabled) chatReloadBtn.setDisabled(loading);
			if (editReloadBtn && editReloadBtn.setDisabled) editReloadBtn.setDisabled(loading);
			chatReloadBtn?.setTooltip?.(loading ? 'Loading models…' : 'Reload models');
			editReloadBtn?.setTooltip?.(loading ? 'Loading models…' : 'Reload models');
		};

		const populateFromModels = (models: string[], ok: boolean) => {
			// Chat dropdown
			if (chatModelDropdown && chatModelDropdown.selectEl) {
				chatModelDropdown.selectEl.empty();
				if (ok) {
					for (const m of models) chatModelDropdown.addOption(m, m);
					chatModelDropdown.selectEl.disabled = false;
					if (chatHelpEl) clearWarning(chatHelpEl);
					const preferred = this.plugin.settings.defaultChatModel;
					if (preferred && models.includes(preferred)) chatModelDropdown.setValue(preferred);
					else chatModelDropdown.setValue(models[0]);
				} else {
					chatModelDropdown.addOption('', 'No models found');
					chatModelDropdown.setValue('');
					chatModelDropdown.selectEl.disabled = true;
					if (chatHelpEl) showModelsWarning(chatHelpEl);
				}
			}
			// Edit dropdown
			if (editModelDropdown && editModelDropdown.selectEl) {
				editModelDropdown.selectEl.empty();
				if (ok) {
					for (const m of models) editModelDropdown.addOption(m, m);
					editModelDropdown.selectEl.disabled = false;
					if (editHelpEl) clearWarning(editHelpEl);
					const preferred = this.plugin.settings.defaultEditModel;
					if (preferred && models.includes(preferred)) editModelDropdown.setValue(preferred);
					else editModelDropdown.setValue(models[0]);
				} else {
					editModelDropdown.addOption('', 'No models found');
					editModelDropdown.setValue('');
					editModelDropdown.selectEl.disabled = true;
					if (editHelpEl) showModelsWarning(editHelpEl);
				}
			}
		};

		const loadModelsAndPopulate = async (forceReload?: boolean) => {
			const provider = this.plugin.settings.provider || 'ollama';
			const baseUrlRaw = provider === 'lmstudio'
				? (this.plugin.settings.lmStudioUrl || 'http://localhost:1234')
				: (this.plugin.settings.ollamaUrl || 'http://localhost:11434');
			const baseUrl = baseUrlRaw.replace(/\/$/, '');
			const cache = (this.plugin as any)._modelsCache;
			if (!forceReload && cache && cache.provider === provider && cache.baseUrl === baseUrl && Array.isArray(cache.models) && cache.models.length > 0) {
				populateFromModels(cache.models, true);
				return;
			}

			// Set loading state and fetch fresh
			setReloadButtonsLoading(true);
			if (chatModelDropdown && chatModelDropdown.selectEl) {
				chatModelDropdown.selectEl.empty();
				chatModelDropdown.addOption('', 'Loading models…');
				chatModelDropdown.setValue('');
				chatModelDropdown.selectEl.disabled = true;
			}
			if (editModelDropdown && editModelDropdown.selectEl) {
				editModelDropdown.selectEl.empty();
				editModelDropdown.addOption('', 'Loading models…');
				editModelDropdown.setValue('');
				editModelDropdown.selectEl.disabled = true;
			}

			let models: string[] = [];
			let ok = false;
			try {
				if (provider === 'lmstudio') {
					// Prefer Obsidian requestUrl to avoid CORS issues
					let text: string | null = null;
					try {
						const r = await requestUrl({ url: `${baseUrl}/v1/models`, method: 'GET' });
						text = (r as any)?.text ?? r?.json ? JSON.stringify((r as any).json) : (r as any)?.data ?? null;
					} catch (_err) {
						// Fallback to fetch
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
						ok = models.length > 0;
					}
				} else {
					const resp = await fetch(`${baseUrl}/api/tags`);
					if (resp.ok) {
						const data = await resp.json();
						if (Array.isArray(data?.models)) {
							models = data.models.map((m: any) => m.model || m.name).filter(Boolean);
							ok = models.length > 0;
						}
					}
				}
			} catch (_e) {}

			populateFromModels(models, ok);
			if (ok) {
				(this.plugin as any)._modelsCache = { provider, baseUrl, models };
			}
			setReloadButtonsLoading(false);
		};

		// Load once on open
		loadModelsAndPopulate(false);

		// Reload models when base URL changes
		// Patch existing Ollama URL setting to also refresh dropdowns

		new Setting(containerEl)
			.setName('Rewrite Prompt')
			.setDesc('Default instruction used when clicking Rewrite.')
			.addText(text => text
				.setPlaceholder('Rewrite this text to be clearer and more engaging.')
				.setValue(this.plugin.settings.quickActions.rewrite)
				.onChange(async (value) => {
					this.plugin.settings.quickActions.rewrite = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Tighten Prompt')
			.setDesc('Default instruction used when clicking Tighten.')
			.addText(text => text
				.setPlaceholder('Make this text more concise while preserving key information.')
				.setValue(this.plugin.settings.quickActions.tighten)
				.onChange(async (value) => {
					this.plugin.settings.quickActions.tighten = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Expand Prompt')
			.setDesc('Default instruction used when clicking Expand.')
			.addText(text => text
				.setPlaceholder('Expand this text with more detail and examples.')
				.setValue(this.plugin.settings.quickActions.expand)
				.onChange(async (value) => {
					this.plugin.settings.quickActions.expand = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Grammar Prompt')
			.setDesc('Default instruction used when clicking Grammar.')
			.addText(text => text
				.setPlaceholder('Fix grammar, spelling, and punctuation errors.')
				.setValue(this.plugin.settings.quickActions.grammar)
				.onChange(async (value) => {
					this.plugin.settings.quickActions.grammar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Translate Prompt')
			.setDesc('Default instruction used when clicking Translate.')
			.addText(text => text
				.setPlaceholder('Translate this text to Spanish.')
				.setValue(this.plugin.settings.quickActions.translate)
				.onChange(async (value) => {
					this.plugin.settings.quickActions.translate = value;
					await this.plugin.saveSettings();
				}));

		// Tag Suggestions settings
		containerEl.createEl('h3', { text: 'Tag Suggestions' });

		new Setting(containerEl)
			.setName('Use LLM for tag suggestions')
			.setDesc('Enable LLM-backed tag suggestions; falls back to local keywords when unavailable.')
			.addToggle((toggle: any) => {
				toggle.setValue(this.plugin.settings.tagSuggestions?.useLLM !== false);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.tagSuggestions = this.plugin.settings.tagSuggestions || { useLLM: true, min: 3, max: 5, confirmBeforeInsert: true, modelOverride: '' };
					this.plugin.settings.tagSuggestions.useLLM = !!value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Min suggestions')
			.setDesc('Minimum number of tags to propose (default 3).')
			.addText((text) => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.tagSuggestions?.min ?? 3))
				.onChange(async (value) => {
					const n = Math.max(1, parseInt(value || '3', 10) || 3);
					this.plugin.settings.tagSuggestions = this.plugin.settings.tagSuggestions || { useLLM: true, min: 3, max: 5, confirmBeforeInsert: true, modelOverride: '' };
					this.plugin.settings.tagSuggestions.min = n;
					// Ensure max >= min
					if ((this.plugin.settings.tagSuggestions.max ?? 5) < n) {
						this.plugin.settings.tagSuggestions.max = n;
					}
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max suggestions')
			.setDesc('Maximum number of tags to propose (default 5).')
			.addText((text) => text
				.setPlaceholder('5')
				.setValue(String(this.plugin.settings.tagSuggestions?.max ?? 5))
				.onChange(async (value) => {
					const curMin = this.plugin.settings.tagSuggestions?.min ?? 3;
					let n = parseInt(value || '5', 10);
					if (isNaN(n) || n < curMin) n = curMin;
					this.plugin.settings.tagSuggestions = this.plugin.settings.tagSuggestions || { useLLM: true, min: 3, max: 5, confirmBeforeInsert: true, modelOverride: '' };
					this.plugin.settings.tagSuggestions.max = n;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Confirm before inserting')
			.setDesc('Show a modal to confirm tags before writing to the note.')
			.addToggle((toggle: any) => {
				toggle.setValue(this.plugin.settings.tagSuggestions?.confirmBeforeInsert !== false);
				toggle.onChange(async (value: boolean) => {
					this.plugin.settings.tagSuggestions = this.plugin.settings.tagSuggestions || { useLLM: true, min: 3, max: 5, confirmBeforeInsert: true, modelOverride: '' };
					this.plugin.settings.tagSuggestions.confirmBeforeInsert = !!value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Model override (optional)')
			.setDesc('Model to use for tag suggestions. Leave empty to use the Default Chat Model.')
			.addText((text) => text
				.setPlaceholder('Leave empty for default')
				.setValue(this.plugin.settings.tagSuggestions?.modelOverride ?? '')
				.onChange(async (value) => {
					this.plugin.settings.tagSuggestions = this.plugin.settings.tagSuggestions || { useLLM: true, min: 3, max: 5, confirmBeforeInsert: true, modelOverride: '' };
					this.plugin.settings.tagSuggestions.modelOverride = value || '';
					await this.plugin.saveSettings();
				}));
	}
}
