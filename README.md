# VaultPilot

> **A serendipity engine for Obsidian** — rediscover forgotten connections with precise context control, plus a safe surgical AI editor.

Think "Cursor for note-taking" with privacy-first local indexing.

---

## Why VaultPilot?

Your vault grows. Notes get buried. Connections fade.

**The problem:** You've written hundreds (or thousands) of notes, but you can't remember what you wrote or how ideas connect. When you need AI help, you copy-paste notes into ChatGPT, losing context and control.

**The solution:** VaultPilot surfaces related notes at exactly the right moment, lets you chat with precise context control, and edits inline with diff previews—never overwriting your work.

---

## ✨ Key Features

- **Smart Discovery** — Automatically surfaces related notes when you open or save a file, ranked by relevance
- **Context-Aware Chat** — Attach specific files to your conversation; chat sessions persist across Obsidian restarts
- **Inline AI Edit (⌘-⌥-E)** — Select text, choose a preset (fix grammar, expand, tighten), review diff, apply changes surgically
- **AI Tag Suggestions** — Get contextually relevant tags with explanations, powered by LLM + TF-IDF fallback
- **Privacy First** — Local-only mode (BM25 search, no external calls) or opt-in to remote LLMs (Ollama, LM Studio)
- **Safe by Design** — All AI edits output to a collapsible "Suggestions" sandbox; you explicitly approve changes
- **Token-Aware Chat** — Automatic message compaction keeps conversations within context windows without losing important details

---

## 📦 Installation

### Option 1: Manual Installation (Current)

1. Download the latest release (or clone this repo)
2. Copy the plugin folder to `<your-vault>/.obsidian/plugins/vault-pilot/`
3. In Obsidian: **Settings → Community plugins → Reload plugins → Enable VaultPilot**

### Option 2: BRAT (Beta Testing)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Obsidian's Community Plugins
2. In BRAT settings, add beta plugin: `calvinku/obsidian-vault-pilot` (or your fork)
3. Enable VaultPilot in Community Plugins

---

## 📋 Prerequisites

VaultPilot requires a local LLM provider to function. You must install one of the following before using the plugin:

### Option 1: Ollama (Recommended)

1. Download from [ollama.com](https://ollama.com/download)
2. Install and launch the application
3. Verify it's running: Open a terminal and run `ollama --version`
4. The API should be accessible at `http://localhost:11434`

### Option 2: LM Studio

1. Download from [lmstudio.ai](https://lmstudio.ai/)
2. Install and launch the application
3. Start the local server (usually at `http://localhost:1234`)
4. Verify the server is running from LM Studio's interface

**Note:** You can switch between providers anytime in VaultPilot settings.

---

## 🚀 Quick Start

### 1. Configure Your LLM

Go to **Settings → VaultPilot**:

- Choose **LLM Provider**: Ollama (local) or LM Studio
- Set the base URL (default: `http://localhost:11434` for Ollama)
- Pick your default models for chat and inline edits

### 2. Open the Discover Panel

- Toggle it via **Command Palette → "Toggle Discover Panel"**
- It appears in the right sidebar
- Open any note—related notes appear automatically (debounced 600ms after save)

### 3. Try Inline Edit

1. Select text in your active note
2. Press **⌘-⌥-K** (Cmd+Option+K)
3. Choose a preset: "Fix grammar", "Expand", "Tighten", or write a custom instruction
4. Review the diff in the Suggestions callout
5. Click **Apply** to replace, or **Discard** to cancel

### 4. Chat with Context

- In the Discover Panel, click the **"+"** button or type **@** in the chat input to attach files
- Ask questions about your attached files
- Your conversation persists across sessions

---

## 🧠 Core Capabilities

### Discover Panel: Related Notes

- **Automatic triggers**: Activates when you open or save a note
- **BM25 ranking**: Fast, transparent lexical search over your entire vault
- **Respect privacy**: Honors `ai.index: false` in frontmatter (per-note opt-out)
- **Quick actions**: Open, insert wikilink, or quote directly from search results

### Inline Edit: Surgical AI Rewrites

- **Preset actions**: Fix grammar, rewrite, expand bullets → prose, tighten, translate (customizable)
- **Diff preview**: See exactly what will change before applying
- **Suggestions sandbox**: All AI output lands in a collapsible callout block—never overwrites your work
- **Undo-friendly**: Applied changes integrate with Obsidian's native undo stack

### Chat: Persistent Sessions with Context Attachments

- **Attach files**: Add specific notes to the conversation for precise context control
- **Multiple entry points**:
  - **"+" button**: Opens intelligent search modal
  - **@ mentions**: Type `@` in chat to trigger file suggestions
  - **File explorer**: Right-click any note → "Add to Assistant Context"
- **Context chips**: Visual indicators show which files are attached; remove with one click
- **Session persistence**: Chat history and context attachments survive Obsidian restarts
- **Token management**: Automatic compaction when conversations exceed limits—recent messages stay verbatim, older messages summarized
- **Vault sync**: Attached files automatically update when renamed/deleted in the vault

### Tag Suggestions: AI-Powered Metadata

- **Smart suggestions**: LLM analyzes note content and suggests relevant tags
- **TF-IDF fallback**: If LLM is unavailable, falls back to statistical analysis
- **Vault awareness**: Prefers tags already used in your vault
- **Excludes existing**: Won't suggest tags already present in the note
- **Configurable**: Set min/max tag count, enable confirmation modal

### Indexing Service: Fast & Respectful

- **Incremental updates**: Automatically reindexes when notes change
- **BM25 algorithm**: Proven TF-IDF scoring with stopword filtering
- **Frontmatter control**: Add `ai.index: false` to exclude sensitive notes
- **Persistent cache**: Index serializes to plugin data—rebuilds are instant

---

## ⚙️ Configuration

### Settings Overview

| Setting                      | Default                  | Description                                           |
| ---------------------------- | ------------------------ | ----------------------------------------------------- |
| **LLM Provider**             | `ollama`                 | Choose between Ollama or LM Studio                    |
| **Ollama URL**               | `http://localhost:11434` | Base URL for Ollama API                               |
| **LM Studio URL**            | `http://localhost:1234`  | Base URL for LM Studio API                            |
| **Max Prompt Tokens**        | `8192`                   | Hard cap for input tokens (must be > reserved tokens) |
| **Reserved Response Tokens** | `512`                    | Tokens set aside for model's response                 |
| **Recent Messages to Keep**  | `6`                      | Target verbatim messages during compaction            |
| **Min Recent Messages**      | `2`                      | Minimum messages preserved in edge cases              |
| **Default Chat Model**       | _(empty)_                | Preselect model in chat dropdown                      |
| **Default Edit Model**       | _(empty)_                | Preselect model in inline edit modal                  |

### Quick Actions (Customizable Presets)

Edit in **Settings → VaultPilot → Edit with AI Presets**:

```json
{
  "rewrite": "Rewrite this text to be clearer and more engaging.",
  "tighten": "Make this text more concise while preserving key information.",
  "expand": "Expand this text with more detail and examples.",
  "grammar": "Fix grammar, spelling, and punctuation errors.",
  "translate": "Translate this text to Spanish."
}
```

Each preset can be modified or new ones added. Presets auto-execute generation when selected.

---

## 🔒 Privacy & Security

### Local-First by Default

- **No external calls**: BM25 indexing runs entirely locally
- **Explicit opt-in**: Remote LLMs require you to configure provider + URL
- **Per-note opt-out**: Add `ai.index: false` to frontmatter to exclude from indexing

### When Using Remote LLMs

- **Clear indicators**: Active provider and model shown in UI
- **Your control**: You manage the LLM endpoint (Ollama, LM Studio)
- **No telemetry**: VaultPilot sends zero analytics or tracking data

### Safe Edit Workflow

- **Never overwrites**: All AI suggestions land in collapsible callouts
- **Diff preview**: See exact changes before applying
- **Undo support**: Applied edits integrate with Obsidian's undo stack

---

## 🛠️ Development

### Build & Test

```bash
# Clone the repo
git clone https://github.com/calvinku/obsidian-vault-pilot.git
cd obsidian-vault-pilot

# Install dependencies
npm install

# Development build (watch mode with sourcemaps)
npm run dev

# Production build (minified)
npm run build

# Run tests
npm run headless:test                # Main tests
npm run headless:test:indexing       # Indexing service
npm run headless:test:chat           # Chat token management
npm run headless:test:session        # Session persistence
npm run headless:test:tagging        # Tag suggestions
npm run ui:snap                      # Playwright UI tests
```

### Project Structure

```
src/
  main.ts                  # Plugin entry point
  ui/
    DiscoverView.ts       # Right-sidebar panel with chat
    EditModal.ts          # Inline edit instruction modal
    SuggestionCallout.ts  # AI suggestion diff renderer
    NoteSearchModal.ts    # Context file picker
    TagSuggestionModal.ts # Tag suggestion UI
  services/
    IndexingService.ts    # BM25 index management
    RetrievalService.ts   # Search/ranking logic
    ChatService.ts        # Token-aware history management
    SessionManager.ts     # Persistent session storage
    ContextAssembler.ts   # Prompt construction
    TaggingService.ts     # AI + TF-IDF tag suggestions
  llm/
    OllamaAdapter.ts      # Ollama integration
    LMStudioAdapter.ts    # LM Studio integration
    adapterFactory.ts     # Provider factory
  types/
    chat.ts               # Chat/session types
    llm.ts                # LLM adapter interfaces
```

### Code Style

- **Language**: TypeScript (ES2018 target)
- **Indentation**: Tabs (not spaces)
- **Strings**: Single quotes
- **Naming**: camelCase for functions/variables, PascalCase for classes

### Testing Philosophy

- **Headless tests**: Node-based with mocked Obsidian API (`scripts/mocks/obsidian.js`)
- **Focused checks**: Null guards, toggle idempotence, token budget edge cases
- **UI snapshots**: Playwright visual regression tests for critical flows

---

## 🗺️ Roadmap

### v0.2 — Enhanced Context Control

- [ ] Saved scopes (named folder/tag/backlink filters)
- [ ] "Why these sources?" explanations (tooltips with rationale)
- [ ] Multi-chunk partial Apply in Suggestions sandbox
- [ ] Async operation cancellation

### v0.3 — Semantic Search

- [ ] On-device embeddings (Nomic/Ollama)
- [ ] Hybrid ranking: BM25 + semantic + graph signals
- [ ] Embedding cache management

### v0.4 — Advanced Features

- [ ] Multi-note refactor suggestions
- [ ] Plugin API for third-party integrations
- [ ] Usage metrics dashboard (local, opt-in)

---

## 🤝 Contributing

Contributions welcome! Here's how to help:

### Reporting Issues

- Include vault size (approx. note count)
- Steps to reproduce
- Obsidian version + OS
- Relevant logs from Developer Console (Ctrl+Shift+I)

### Pull Requests

- **Keep changes focused**: One feature or fix per PR
- **Follow code style**: Tabs, single quotes, camelCase
- **Add tests**: Extend headless tests for new features
- **Write clear commits**: Imperative mood (e.g., "fix: guard null leaf in toggle")

### Development Tips

- Test on a **copy of your vault** (never your primary vault)
- Use `npm run dev` for hot-reload during development
- Check `CLAUDE.md` and `AGENTS.md` for detailed guidelines

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Obsidian community** for inspiration and feedback
- **BM25 algorithm** pioneers (Robertson & Walker)
- **Ollama** and **LM Studio** teams for making local LLMs accessible

---

## 📚 Further Reading

- [PRD](docs/PRD_Serendipity_Obsidian.md) — Full product requirements
- [Architecture](docs/ARCHITECTURE_AND_DATA_FLOW.md) — Component diagrams and data flow
- [Development Plan](docs/DEVELOPMENT_PLAN.md) — Phase breakdown and implementation strategy
- [Feature Plans](docs/) — Detailed design documents for major features

---

**Made with ❤️ for note-takers who want AI that respects their craft.**
