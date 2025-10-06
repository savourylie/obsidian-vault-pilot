/*
  Headless test harness for Serendipity plugin without Obsidian.
  - Mocks the 'obsidian' module via NODE_PATH to scripts/mocks
  - Loads the built plugin main.js
  - Exercises toggleDiscoverView to verify open/close semantics
*/
const path = require('path');

// Add mock path so `require('obsidian')` resolves to our stub
process.env.NODE_PATH = path.resolve(__dirname, 'mocks');
require('module').Module._initPaths();

// Load compiled plugin bundle
const PluginModule = require(path.resolve(__dirname, '..', 'main.js'));
const SerendipityPlugin = PluginModule && PluginModule.default ? PluginModule.default : PluginModule;

// Minimal workspace simulation
class MockWorkspace {
  constructor() {
    this.rightLeaf = null;
    this.viewsByType = new Map();
  }
  detachLeavesOfType(type) {
    this.viewsByType.delete(type);
  }
  getLeavesOfType(type) {
    const v = this.viewsByType.get(type);
    return v ? [v] : [];
  }
  getRightLeaf(createIfMissing) {
    if (!this.rightLeaf && createIfMissing) {
      this.rightLeaf = new (require('./mocks/obsidian').WorkspaceLeaf)(this);
    }
    return this.rightLeaf;
  }
  revealLeaf(_leaf) {
    // no-op for headless
  }
  _openLeafState(state) {
    if (state && state.type) {
      this.viewsByType.set(state.type, { type: state.type, active: !!state.active });
    }
  }
}

async function run() {
  const app = { workspace: new MockWorkspace() };
  const plugin = new SerendipityPlugin();
  // Inject mock app
  plugin.app = app;

  const VIEW_TYPE = 'serendipity-discover-view';

  // 1) Toggle open (no right leaf initially)
  await plugin.toggleDiscoverView();
  let open1 = app.workspace.getLeavesOfType(VIEW_TYPE).length === 1;
  console.log('After first toggle -> open:', open1);

  // 2) Toggle close
  await plugin.toggleDiscoverView();
  let closed = app.workspace.getLeavesOfType(VIEW_TYPE).length === 0;
  console.log('After second toggle -> closed:', closed);

  // 3) Toggle open again
  await plugin.toggleDiscoverView();
  let open2 = app.workspace.getLeavesOfType(VIEW_TYPE).length === 1;
  console.log('After third toggle -> open again:', open2);

  const pass = open1 && closed && open2;
  console.log(`Headless toggle test: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exit(1);
}

run().catch((e) => {
  console.error('Headless test error:', e);
  process.exit(1);
});

