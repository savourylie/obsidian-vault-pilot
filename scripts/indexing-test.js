/*
  Headless indexing/retrieval test harness.
*/
const path = require('path');

process.env.NODE_PATH = path.resolve(__dirname, 'mocks');
require('module').Module._initPaths();

const { Vault, MetadataCache } = require('obsidian');
const PluginModule = require(path.resolve(__dirname, '..', 'main.js'));
const VaultPilot = PluginModule && PluginModule.default ? PluginModule.default : PluginModule;

function setupApp() {
  const workspace = {
    _openLeafState: () => {},
    getLeavesOfType: () => [],
    detachLeavesOfType: () => {},
    getRightLeaf: () => ({ setViewState: async () => {} }),
    revealLeaf: () => {},
  };
  const vault = new Vault();
  const metadataCache = new MetadataCache();
  return { workspace, vault, metadataCache };
}

async function run() {
  const app = setupApp();
  const plugin = new VaultPilot();
  plugin.app = app;
  // Simulate onload to init services and commands
  await plugin.onload?.();

  // Seed files
  app.vault.addFile('A.md', '# Cats and Dogs\n\nCats are great. Dogs are great too.');
  app.vault.addFile('B.md', '# TypeScript Notes\n\nTypeScript is a typed superset of JavaScript.');
  app.vault.addFile('C.md', '# Gardening\n\nTomatoes and basil grow well together.');

  // Build index
  await plugin.indexingService.buildIndex();

  const results = plugin.retrievalService.search('cats');
  console.log('Search results for "cats":', results.map(r => r.path));
  const pass = results.length > 0 && results[0].path === 'A.md';
  console.log(`Headless indexing test: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
