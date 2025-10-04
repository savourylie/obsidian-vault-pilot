// Minimal Obsidian API stubs for headless testing

class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
  }
  addCommand() {}
  registerView() {}
  addSettingTab() {}
  addRibbonIcon() {}
  registerEvent(_ref) { return _ref; }
  async loadData() { return undefined; }
  async saveData() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty() {},
      createEl() { return {}; },
    };
  }
  display() {}
}

class Setting {
  constructor(container) { this.container = container; }
  setName() { return this; }
  setDesc() { return this; }
  addText(fn) {
    const api = {
      setPlaceholder() { return this; },
      setValue() { return this; },
      onChange() { return this; },
    };
    fn(api);
    return this;
  }
}

class WorkspaceLeaf {
  constructor(workspace) {
    this.workspace = workspace;
  }
  async setViewState(state) {
    if (!state || !state.type) return;
    this.workspace._openLeafState(state);
  }
}

class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.containerEl = { children: [null, { empty() {}, createEl() { return {}; } }] };
  }
}

class TFile {
  constructor(path, content) {
    this.path = path;
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    this.name = name;
    const dot = name.lastIndexOf('.');
    this.basename = dot !== -1 ? name.slice(0, dot) : name;
    this.extension = dot !== -1 ? name.slice(dot + 1) : '';
    this._content = content || '';
  }
}

class EventBus {
  constructor() { this.events = {}; }
  on(evt, cb) {
    if (!this.events[evt]) this.events[evt] = [];
    this.events[evt].push(cb);
    return () => {
      this.events[evt] = (this.events[evt] || []).filter((f) => f !== cb);
    };
  }
  trigger(evt, ...args) {
    (this.events[evt] || []).forEach((cb) => cb(...args));
  }
}

class Vault extends EventBus {
  constructor() {
    super();
    this._files = new Map(); // path -> TFile
  }
  getMarkdownFiles() {
    return Array.from(this._files.values()).filter((f) => f.extension === 'md');
  }
  getAbstractFileByPath(path) {
    return this._files.get(path) || null;
  }
  async read(file) {
    const f = typeof file === 'string' ? this._files.get(file) : file;
    return f?._content || '';
  }
  addFile(path, content) {
    const f = new TFile(path, content);
    this._files.set(path, f);
    this.trigger('create', f);
    return f;
  }
  modify(path, newContent) {
    const f = this._files.get(path);
    if (!f) return;
    f._content = newContent;
    this.trigger('modify', f);
  }
  delete(path) {
    const f = this._files.get(path);
    if (!f) return;
    this._files.delete(path);
    this.trigger('delete', f);
  }
  rename(oldPath, newPath) {
    const f = this._files.get(oldPath);
    if (!f) return;
    this._files.delete(oldPath);
    f.path = newPath;
    const parts = newPath.split('/');
    const name = parts[parts.length - 1];
    f.name = name;
    const dot = name.lastIndexOf('.');
    f.basename = dot !== -1 ? name.slice(0, dot) : name;
    f.extension = dot !== -1 ? name.slice(dot + 1) : '';
    this._files.set(newPath, f);
    this.trigger('rename', f, oldPath);
  }
}

class MetadataCache extends EventBus {}

module.exports = {
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
  ItemView,
  TFile,
  Vault,
  MetadataCache,
};
