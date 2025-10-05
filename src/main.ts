import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Editor, TFile, EditorPosition } from 'obsidian';
import { DiscoverView, VIEW_TYPE_DISCOVER } from './ui/DiscoverView';
import { IndexingService, AnySerializedIndex } from './services/IndexingService';
import { RetrievalService } from './services/RetrievalService';
import { EditModal } from './ui/EditModal';
import { SuggestionCallout } from './ui/SuggestionCallout';
import { OllamaAdapter } from './llm/OllamaAdapter';
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
	ollamaUrl: string;
	maxPromptTokens: number;
	reservedResponseTokens: number;
	recentMessagesToKeep: number;
	minRecentMessagesToKeep: number;
	quickActions: QuickActionsConfig;
	systemPrompt: string;
	defaultChatModel: string;
	defaultEditModel: string;
}

const DEFAULT_SETTINGS: SerendipityPluginSettings = {
	ollamaUrl: 'http://localhost:11434',
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
				this.settings.defaultChatModel
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

		// Add test command for SuggestionCallout (dev only)
		this.addCommand({
			id: 'test-suggestion-callout',
			name: '[DEV] Test Suggestion Callout',
			callback: () => {
				this.testSuggestionCallout();
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
		}));
		this.registerEvent(this.app.vault.on('rename', async (file: any, oldPath: string) => {
			if (oldPath) {
				this.indexingService.removeFromIndex(oldPath);
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

			console.log('VaultPilot: Prompt assembled, calling Ollama...');

			// Stream response from Ollama
			const adapter = new OllamaAdapter(this.settings.ollamaUrl);
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
				new Notice('⚠️ Could not connect to Ollama. Is it running?');
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

		new Setting(containerEl)
			.setName('Ollama Base URL')
			.setDesc('The base URL for the Ollama API.')
			.addText(text => text
				.setPlaceholder('http://localhost:11434')
				.setValue(this.plugin.settings.ollamaUrl)
				.onChange(async (value) => {
					this.plugin.settings.ollamaUrl = value;
					await this.plugin.saveSettings();
					// Debounce reload of available models for dropdowns
					if (modelsReloadTimer) {
						window.clearTimeout(modelsReloadTimer);
					}
					modelsReloadTimer = window.setTimeout(async () => {
						try {
							// @ts-ignore - defined within display scope
							await loadModelsAndPopulate();
						} catch {}
					}, 600);
				}));

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

		const showModelsWarning = (el: HTMLElement) => {
			el.empty();
			const note = el.createEl('div', { text: 'Could not load models from Ollama. ' });
			note.appendText('Install or start Ollama: ');
			note.createEl('a', { text: 'Download Ollama', attr: { href: 'https://ollama.com/download' } });
			note.addClass('setting-item-description');
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
				btn.setIcon?.('refresh-ccw');
				btn.setTooltip?.('Reload models');
				btn.onClick?.(async () => {
					try { await loadModelsAndPopulate(); } catch {}
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
				btn.setIcon?.('refresh-ccw');
				btn.setTooltip?.('Reload models');
				btn.onClick?.(async () => {
					try { await loadModelsAndPopulate(); } catch {}
				});
			});
		editHelpEl = containerEl.createEl('div');

		// Fetch models from Ollama and populate dropdowns
		const loadModelsAndPopulate = async () => {
			// Set loading state on dropdowns
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
			const baseUrl = (this.plugin.settings.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
			let models: string[] = [];
			let ok = false;
			try {
				const resp = await fetch(`${baseUrl}/api/tags`);
				if (resp.ok) {
					const data = await resp.json();
					if (Array.isArray(data?.models)) {
						models = data.models.map((m: any) => m.model || m.name).filter(Boolean);
						ok = models.length > 0;
					}
				}
			} catch (_e) {}

			// Populate chat dropdown
			if (chatModelDropdown && chatModelDropdown.selectEl) {
				chatModelDropdown.selectEl.empty();
				if (ok) {
					for (const m of models) chatModelDropdown.addOption(m, m);
					chatModelDropdown.selectEl.disabled = false;
					if (chatHelpEl) clearWarning(chatHelpEl);
					// Select from settings if present
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

			// Populate edit dropdown
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

		// Load once on open
		loadModelsAndPopulate();

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
	}
}
