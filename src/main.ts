import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { DiscoverView, VIEW_TYPE_DISCOVER } from './ui/DiscoverView';

interface SerendipityPluginSettings {
	ollamaUrl: string;
}

const DEFAULT_SETTINGS: SerendipityPluginSettings = {
	ollamaUrl: 'http://localhost:11434',
}

export default class SerendipityPlugin extends Plugin {
	settings: SerendipityPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register the Discover View
		this.registerView(
			VIEW_TYPE_DISCOVER,
			(leaf) => new DiscoverView(leaf)
		);

		// Add command to toggle the Discover view
		this.addCommand({
			id: 'toggle-discover-panel',
			name: 'Toggle Discover Panel',
			callback: () => {
				this.activateView();
			},
		});

		// Add command for inline AI editing
		this.addCommand({
			id: 'ai-edit-selection',
			name: 'Edit selection with AI',
			hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'k' }],
			callback: () => {
				console.log('Command: Edit selection with AI triggered.');
				// Logic for this will be in Ticket #4
			},
		});

		// Add the settings tab
		this.addSettingTab(new SerendipitySettingTab(this.app, this));

		console.log('Serendipity Engine plugin loaded.');
	}

	onunload() {
		console.log('Serendipity Engine plugin unloaded.');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}



	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_DISCOVER);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: VIEW_TYPE_DISCOVER,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_DISCOVER)[0]
		);
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

		containerEl.createEl('h2', {text: 'Serendipity Engine Settings'});

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