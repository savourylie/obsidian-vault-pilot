# VaultPilot — Obsidian Plugin

> **Cursor for note‑taking**: a serendipity engine that surfaces forgotten connections **with precise context control**, plus a **safe, surgical** inline AI editor.

## ✨ Features
- **Discover Panel:** ranked related notes + 2–3 sentence synthesis, triggered on save/idle.
- **Scope Control:** `Selection • Current file • Folder(s) • Tag(s) • Backlinks • Pinned set` (save named scopes).
- **Inline Edit (⌘‑⌥‑K):** rewrite/expand/tighten/translate/grammar → to **Suggestions** sandbox with **diff** + **Apply**.
- **Scoped Chat Drawer:** chat about current doc + scope; one‑click **Create Synthesized Note** with citations.
- **Backlink & Tag Suggestions:** rationale + one‑click insert; never auto‑write.
- **Privacy Modes:** Local‑only (BM25); Remote LLMs clearly indicated when enabled.

> Default hotkey avoids Obsidian’s built‑in `⌘-K` link shortcut. You can change it in settings.

---

## 🛠️ Install (Beta via BRAT)
1. In Obsidian, enable **Community plugins**.
2. Install **BRAT (Beta Reviewers Auto‑update Tester)** from Community plugins.
3. In BRAT → *Add Beta plugin* → enter repo: `yourname/serendipity-engine-obsidian` *(placeholder)*.
4. Toggle the plugin on. Open **Settings → VaultPilot** to configure.

> Don’t have the repo yet? You can build from source (below) and drop into your vault.

### Build from Source
```bash
# Requirements: Node 18+, pnpm (or npm), Obsidian 1.5+
git clone https://github.com/yourname/serendipity-engine-obsidian.git
cd serendipity-engine-obsidian
pnpm i        # or: npm i
pnpm run dev  # or: npm run dev
# Then copy the build folder to your vault:
#  <your-vault>/.obsidian/plugins/serendipity-engine-obsidian
```

---

## 🚀 Quickstart
- Open any note and start typing.
- **Discover Panel** (right sidebar) shows a synthesis + related notes when you save or pause typing.
- Use **scope chips** at the top to narrow context (you can save named scopes).
- Select text, press **⌘‑⌥‑K** → choose *Rewrite/Expand/Tighten/Translate/Grammar* → see output under **Suggestions**.
- Click **Apply** on the diff preview to surgically replace your selection.
- Open **Chat Drawer** to discuss the scope; **Create Synthesized Note** to spin off a new note with citations.

### Suggestions Callout (example)
```
> [!ai-suggestion] Suggestions (v0.1) — Sources: [[Note A]], [[Note B]]
> Summary: …
> ---
> Proposed replacement for lines 120–155
> ```diff
> - old line
> + new line
> ```
```

---

## ⚙️ Settings
- **LLM Provider:** OpenAI / Claude / Ollama (local). Pick model, temperature, max tokens, streaming.
- **Privacy:** *Local‑only* (no external calls) or *Allow remote*. A red badge shows when remote is active.
- **Indexing:** include/exclude folders/tags; respect frontmatter `ai.index: false`.
- **Scopes:** create & manage named scopes (folder/tag filters + pinned notes).
- **Hotkeys:** rebind inline edit, chat drawer toggle, and refresh discover.

### Advanced (optional)
`settings.advanced.json`
```json
{
  "ranking": {
    "w_bm25": 0.6, "w_sem": 0.2, "w_graph": 0.15, "w_recency": 0.05,
    "graph": {"alpha_backlinks": 1.0, "beta_shared_tags": 0.6, "gamma_same_folder": 0.4}
  }
}
```

---

## 🧠 How it Works (short)
- BM25 index of your vault powers instant related-note ranking.
- (Optional) Embeddings add semantic recall; cached by content hash.
- Graph signals (backlinks, tags, folder, recency) nudge ranking.
- LLM receives: your selection/file excerpt + top‑k snippets + explicit task preset.
- Output never overwrites: everything lands in the **Suggestions** sandbox; you decide what to apply.

---

## ⌨️ Commands
- **Edit selection with AI** (`⌘‑⌥‑K`) — configurable
- **Toggle Discover Panel**
- **Toggle Chat Drawer**
- **Refresh Discover** (re‑query ranking with current scope)

---

## 🧪 Roadmap
**v0.1 (MVP)** — Discover panel, scope chips, ⌘‑⌥‑K inline edit → sandbox + diff/apply, chat drawer, synth note.
**v0.2** — Saved scopes UX polish, better “why these sources”, partial apply multi‑chunks, async cancel.
**v0.3** — Profiles (“Research vs Writing”), on‑device embeddings helper, evaluation harness.
**v0.4** — Multi‑note refactor suggestions, citation manager, plugin API for third‑party tools.

*(Feature GIFs TBD: Discover panel, Inline edit & diff apply, Create synthesized note — add to `/docs/gifs`.)*

---

## 🤝 Contributing
- Issues: bug reports with vault size, steps, logs from `community-plugins-devtools` if possible.
- PRs: TypeScript, linted; small focused changes; add a short demo GIF or screenshot.
- Dev tips: Hot-reload using `pnpm run dev`; test on a copy of your vault.

## 🔐 Privacy & Security
- **Local‑only mode** does not send note content anywhere.
- When using remote LLMs, the active provider/model is shown in the UI.
- Per‑note opt‑out: add `ai.index: false` to frontmatter.

## 📜 License
MIT (proposed). See `LICENSE` when the repo is published.

---

## 🧩 Minimal Code Skeleton (TypeScript)
```ts
import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice } from 'obsidian';

export default class SerendipityPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'ai-edit-selection',
      name: 'Edit selection with AI',
      hotkeys: [{ modifiers: ['Mod', 'Alt'], key: 'k' }], // avoids Mod+K collision
      callback: () => this.editSelection(),
    });

    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      // debounce → reindex and refresh discover
    }));

    // TODO: init right-leaf Discover panel, settings tab, and chat drawer
  }

  async editSelection() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const sel = view.editor.getSelection();
    if (!sel) { new Notice('Select some text first'); return; }
    // Open modal → gather prompt/preset → call LLM → write to Suggestions callout.
  }
}
```
