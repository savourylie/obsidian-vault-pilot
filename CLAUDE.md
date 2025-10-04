# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VaultPilot** is an Obsidian plugin that acts as a "serendipity engine" — surfacing forgotten connections with precise context control, plus a safe surgical inline AI editor. Think "Cursor for note-taking" with privacy-first local indexing.

Key features planned:
- **Discover Panel**: Ranked related notes + synthesis triggered on save/idle
- **Inline Edit (⌘-⌥-K)**: AI rewrite → Suggestions sandbox with diff + Apply
- **Scoped Chat Drawer**: Chat about current doc + scope
- **Privacy Modes**: Local-only (BM25) or Remote LLMs (clearly indicated)

## Build & Development Commands

```bash
# Development (watch + rebuild with sourcemaps)
npm run dev

# Production build (minified)
npm run build

# Headless testing
npm run headless:test
npm run headless:test:indexing
```

**Note**: This plugin uses `esbuild` to bundle `src/main.ts` → `main.js`. To test in Obsidian, copy the repo into `<vault>/.obsidian/plugins/vault-pilot/` and enable Community Plugins.

## Project Structure

```
src/
  main.ts                  # Entry point: SerendipityPlugin class
  ui/
    DiscoverView.ts       # Right-sidebar Discover panel view
  services/
    IndexingService.ts    # BM25 index (tokenize, tf-idf, frontmatter ai.index flag)
    RetrievalService.ts   # Search/ranking via IndexingService
  indexing/               # (Future: advanced ranking/embeddings)
  llm/                    # (Future: LLM adapters - OpenAI/Claude/Ollama)
  types/                  # (Future: shared interfaces)

docs/
  *.md                    # Design docs (PRD, Architecture, README)
  tickets/                # Development tickets (granular work items)

scripts/
  headless-test.js        # Node-based smoke tests (mocked Obsidian API)
  indexing-test.js        # Indexing-specific tests
  mocks/obsidian.js       # Minimal Obsidian API mock for testing

Root files:
  manifest.json           # Obsidian plugin metadata
  package.json            # npm scripts, dependencies
  tsconfig.json           # TypeScript config (ES2018, ESNext modules)
  AGENTS.md               # Development guidelines for AI agents (detailed)
```

## Architecture & Data Flow

### Core Components

1. **IndexingService** (`src/services/IndexingService.ts`)
   - Manages BM25 inverted index over vault `.md` files
   - Tokenizes content (stopwords, punctuation removal)
   - Respects frontmatter `ai.index: false` flag
   - Serializes/deserializes index to plugin data (persisted across sessions)
   - Incremental updates on vault events (create/modify/delete/rename)

2. **RetrievalService** (`src/services/RetrievalService.ts`)
   - TF-IDF scoring over IndexingService
   - Returns ranked `SearchResult[]` for a query string
   - Used by DiscoverView to populate related notes

3. **DiscoverView** (`src/ui/DiscoverView.ts`)
   - Custom ItemView in right sidebar
   - Triggers search on file-open, save, or manual refresh (debounced 600ms)
   - Displays ranked results with Open/Insert Link/Quote actions
   - Status indicators for loading/empty states

4. **SerendipityPlugin** (`src/main.ts`)
   - Plugin entry point
   - Registers commands: `toggle-discover-panel`, `reindex-vault`, `ai-edit-selection` (stub)
   - Wires vault events → IndexingService updates → saves index to plugin data
   - Manages plugin settings (e.g., Ollama base URL)

### Ranking Blend (Planned)

Current MVP uses simple TF-IDF. Future versions will blend:
```
score = 0.6*bm25 + 0.2*semantic + 0.15*graph + 0.05*recency
```
where `graph` includes backlinks, shared tags, same folder.

### Privacy & Safety

- **Local-only mode** (default): no external API calls; BM25-only indexing
- **Remote mode**: when enabled, active LLM provider/model shown in UI
- **Suggestions sandbox**: inline edits output to collapsible callout with diff; user must explicitly Apply
- **Per-note opt-out**: `ai.index: false` in frontmatter excludes file from indexing

## Code Style & Conventions

- **Language**: TypeScript (ES2018 target)
- **Indentation**: Tabs (not spaces) in `src/*.ts`
- **Strings**: Single quotes
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes
- **Minimal diffs**: Avoid reformatting unrelated code; keep changes focused
- **No one-letter variables**: Use descriptive names

## Testing

- **Headless tests**: `scripts/headless-test.js`, `scripts/indexing-test.js`
  - Use mocked Obsidian API (`scripts/mocks/obsidian.js`)
  - Run with `npm run headless:test` or `npm run headless:test:indexing`
  - Print PASS/FAIL; no heavy test framework
- **Add focused checks** for new features (e.g., null guards, toggle idempotence)

## Critical Implementation Details

### Obsidian API Null Guards

- `app.workspace.getRightLeaf(false)` may return `null` in fresh sessions
- Always check and create leaf if needed: `getRightLeaf(true)`
- Example from `main.ts:145-149`:
  ```ts
  let rightLeaf = this.app.workspace.getRightLeaf(false);
  if (!rightLeaf) {
    rightLeaf = this.app.workspace.getRightLeaf(true);
  }
  ```

### Index Persistence

- Index is serialized to plugin data via `IndexingService.export()` → `SerializedIndexV1`
- On plugin load, deserialized via `IndexingService.load(persistedIndex)`
- Plugin data structure: `{ settings: {...}, index: {...} }`

### Vault Event Wiring

- Plugin subscribes to `vault.on('create'|'modify'|'delete'|'rename')` and `metadataCache.on('changed')`
- Each event triggers `indexingService.updateIndex(file)` or `removeFromIndex(path)`
- Changes are immediately persisted via `saveIndex()` (writes to plugin data)

### Discover Panel Toggle Behavior

- Toggle command (`toggle-discover-panel`) is idempotent:
  - If panel exists → detach all leaves of type `VIEW_TYPE_DISCOVER`
  - If panel doesn't exist → create in right sidebar + reveal
- Debounced search (600ms) prevents excessive queries on rapid file changes

## Common Development Tasks

### Adding a new command
1. Use `this.addCommand({ id, name, callback })` in `main.ts:onload()`
2. Optional: add hotkeys array for keyboard shortcuts
3. Implement callback logic (may delegate to service/UI classes)

### Extending the index
1. Modify `IndexingService` to track additional metadata (e.g., tags, backlinks)
2. Update `SerializedIndexV1` schema (or create `SerializedIndexV2`)
3. Implement migration in `load()` if schema changes
4. Update `RetrievalService.search()` to incorporate new signals

### Adding a new LLM provider
1. Create adapter in `src/llm/` (e.g., `OllamaAdapter.ts`, `OpenAIAdapter.ts`)
2. Implement common interface (streaming, cancellation, error handling)
3. Wire into settings tab for provider selection
4. Update UI to show active provider/model when remote mode is enabled

### Modifying the Discover Panel UI
1. Edit `src/ui/DiscoverView.ts`
2. Maintain debounced search pattern (`queueSearch()`)
3. Keep toggle behavior idempotent
4. Update styles in `styles.css` (classes prefixed with `vp-`)

## Commit & PR Guidelines

- **Commit messages**: Imperative, concise (e.g., `fix: guard right leaf null in toggle`)
- **Reference tickets**: Mention ticket IDs from `docs/tickets/` (e.g., "Ticket 6")
- **PRs**: Include summary, before/after behavior, screenshots/logs, test steps, linked tickets

## Known Issues & Gotchas

- **Hotkey collision**: Default `⌘-⌥-K` chosen to avoid Obsidian's built-in `⌘-K` (link shortcut)
- **Index drift**: Future versions will use content hashing to detect changes; current MVP re-indexes on any modify event
- **Large vaults**: BM25 index performs well up to ~10k notes; future optimization may include chunking or lazy loading

## Reference Documentation

- **PRD**: `docs/PRD_Serendipity_Obsidian.md` — Product requirements, user stories, success metrics
- **Architecture**: `docs/ARCHITECTURE_AND_DATA_FLOW.md` — Component diagrams, sequence flows
- **README**: `docs/README_Serendipity_Obsidian.md` — User-facing feature overview, install instructions
- **Development Plan**: `docs/DEVELOPMENT_PLAN.md` — Phase breakdown (setup → indexing → UI → inline edit)
- **Tickets**: `docs/tickets/*.md` — Granular work items with acceptance criteria
- **AGENTS.md**: Detailed guidelines for AI agents (code style, testing, commit conventions)

## Future Roadmap (v0.2+)

- Saved scopes (named folder/tag/backlink filters)
- Better "why these sources" explanations (tooltips, rationale blocks)
- Multi-chunk partial Apply in Suggestions sandbox
- Async operation cancellation
- On-device embeddings (Nomic/Ollama) for semantic search
- Multi-note refactor suggestions
- Plugin API for third-party integrations
