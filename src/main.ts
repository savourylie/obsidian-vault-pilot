import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice } from 'obsidian';
import { DiscoverView, VIEW_TYPE_DISCOVER } from './ui/DiscoverView';
import { IndexingService, AnySerializedIndex } from './services/IndexingService';
import { RetrievalService } from './services/RetrievalService';
import { EditModal } from './ui/EditModal';
import { SuggestionCallout } from './ui/SuggestionCallout';

interface SerendipityPluginSettings {
	ollamaUrl: string;
}

const DEFAULT_SETTINGS: SerendipityPluginSettings = {
	ollamaUrl: 'http://localhost:11434',
}

export default class SerendipityPlugin extends Plugin {
	settings: SerendipityPluginSettings;
	private dataBlob: any | undefined;
	indexingService: IndexingService;
	retrievalService: RetrievalService;

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

		// Register the Discover View
		this.registerView(
			VIEW_TYPE_DISCOVER,
			(leaf) => new DiscoverView(leaf, this.retrievalService)
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
		console.log('VaultPilot: Active view:', view);

		if (!view) {
			new Notice('No active note found');
			return;
		}

		const editor = view.editor;
		const selection = editor.getSelection();
		console.log('VaultPilot: Selection length:', selection.length);

		if (!selection || selection.trim().length === 0) {
			new Notice('Please select some text first');
			return;
		}

		const file = view.file;
		if (!file) {
			new Notice('No file found');
			return;
		}

		console.log('VaultPilot: Opening EditModal');
		// Open the edit modal
		new EditModal(this.app, {
			selection,
			file,
			onSubmit: (instruction) => {
				// Placeholder: will be wired in Ticket #11
				console.log('Instruction received:', instruction);
				console.log('Selection:', selection.slice(0, 50) + '...');
				console.log('File:', file.path);
				new Notice('AI editing will be implemented in Ticket #11');
			},
		}).open();
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
				}));
	}
}
