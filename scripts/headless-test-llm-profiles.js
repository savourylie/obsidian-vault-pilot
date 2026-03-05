/*
  Headless tests for LLM profile migration and persistence helpers.
  - Mocks the 'obsidian' module via NODE_PATH to scripts/mocks
  - Loads the built plugin main.js
  - Exercises migration and profile helper methods without rendering the settings UI
*/
const path = require('path');

process.env.NODE_PATH = path.resolve(__dirname, 'mocks');
require('module').Module._initPaths();

const PluginModule = require(path.resolve(__dirname, '..', 'main.js'));
const SerendipityPlugin =
  PluginModule && PluginModule.default ? PluginModule.default : PluginModule;

class TestPlugin extends SerendipityPlugin {
  constructor(initialData) {
    super();
    this._store = initialData;
    this._saved = [];
  }

  async loadData() {
    return this._store;
  }

  async saveData(data) {
    this._store = data;
    this._saved.push(JSON.parse(JSON.stringify(data)));
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const legacySettings = {
    provider: 'openai',
    ollamaUrl: 'http://localhost:11434',
    lmStudioUrl: 'http://localhost:1234',
    openAIUrl: 'https://api.example.com/v1',
    openAIApiKey: 'legacy-key',
    openAITemperature: 0.4,
    defaultChatModel: 'gpt-5-mini',
    defaultEditModel: 'gpt-5-nano',
  };

  const plugin = new TestPlugin({ settings: legacySettings });
  plugin.app = {
    workspace: {
      getLeavesOfType() {
        return [];
      },
    },
  };

  await plugin.loadSettings();

  assert(plugin.settings.llmProfiles.length === 1, 'Expected one migrated profile');
  assert(
    plugin.settings.activeLLMProfileId === plugin.settings.llmProfiles[0].id,
    'Expected migrated profile to become active'
  );
  assert(
    plugin.settings.provider === 'openai' &&
      plugin.settings.openAIUrl === legacySettings.openAIUrl &&
      plugin.settings.openAIApiKey === legacySettings.openAIApiKey,
    'Expected legacy settings to mirror the active migrated profile'
  );

  const migrated = plugin.getActiveLLMProfile();
  const created = await plugin.saveLLMProfileAsNew({
    ...migrated,
    name: 'Work Proxy',
    provider: 'openai',
    openAIUrl: 'https://proxy.example.com/v1',
    openAIApiKey: 'new-key',
    defaultChatModel: 'gpt-5-chat-latest',
    defaultEditModel: 'gpt-5-mini',
  });

  assert(plugin.settings.llmProfiles.length === 2, 'Expected Save As New to create a second profile');
  assert(
    plugin.settings.activeLLMProfileId === created.id,
    'Expected new profile to become active after Save As New'
  );
  assert(
    plugin.settings.openAIUrl === 'https://proxy.example.com/v1',
    'Expected active legacy mirror to update after Save As New'
  );

  const updated = {
    ...created,
    name: 'Work Proxy',
    openAIApiKey: 'updated-key',
    defaultChatModel: 'gpt-5-mini',
  };
  await plugin.saveLLMProfile(updated);

  const savedProfile = plugin.settings.llmProfiles.find((profile) => profile.id === created.id);
  assert(savedProfile, 'Expected updated profile to remain in settings');
  assert(
    savedProfile.openAIApiKey === 'updated-key' &&
      savedProfile.defaultChatModel === 'gpt-5-mini',
    'Expected saveLLMProfile to persist updates'
  );

  const originalId = plugin.settings.llmProfiles.find((profile) => profile.id !== created.id).id;
  await plugin.setActiveLLMProfile(originalId);
  assert(
    plugin.settings.activeLLMProfileId === originalId,
    'Expected setActiveLLMProfile to switch the active id'
  );
  assert(
    plugin.settings.openAIUrl === legacySettings.openAIUrl,
    'Expected legacy mirror to reflect the newly active profile'
  );

  await plugin.deleteLLMProfile(created.id);
  assert(plugin.settings.llmProfiles.length === 1, 'Expected deleteLLMProfile to remove the target profile');
  assert(
    plugin.settings.llmProfiles[0].id === originalId,
    'Expected the original profile to remain after deleting the second profile'
  );

  const beforeNoOpDelete = plugin.settings.llmProfiles.length;
  await plugin.deleteLLMProfile(originalId);
  assert(
    plugin.settings.llmProfiles.length === beforeNoOpDelete,
    'Expected deleting the last remaining profile to be ignored'
  );

  assert(plugin._saved.length >= 4, 'Expected profile helpers to persist settings updates');

  console.log('LLM profiles headless test: PASS');
}

run().catch((err) => {
  console.error('LLM profiles headless test: FAIL');
  console.error(err);
  process.exit(1);
});
