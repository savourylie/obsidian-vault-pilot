# Serendipity Engine — Obsidian AI Plugin PRD (v0.1)

## 1) Summary
**Thesis:** Obsidian doesn’t need another chatbot; it needs an **AI with precise context control** that can (1) surface forgotten connections at the right time (*serendipity engine*) and (2) apply changes **safely and surgically** (*inline Copilot-style edit with diffs*).

**Job to be Done:** Help experienced Obsidian users synthesize new ideas from their vault and edit confidently without losing trust in their source text.

## 2) Goals & Non‑Goals
**Goals (MVP)**
- Discover related notes for the active file with a ranked list + a short synthesis.
- Let users **scope** context (Selection, Current file, Folder(s), Tag(s), Backlinks, Pinned set).
- Inline **⌘-⌥-K** “Edit with AI” on selection → output to a **Suggestions** sandbox with **diff preview** and **Apply**.
- Scoped **Chat Drawer** to discuss current note + scope.
- **Create Synthesized Note** from chat/synthesis with citations to sources.

**Non-Goals (MVP)**
- Full-automatic rewriting of the entire document.
- Complex graph visualizations; we consume graph signals, but do not render a new graph.
- Full-blown backlink auto-insertion; we **suggest**, never auto-write.

## 3) Personas
- **Veteran Obsidian Researcher/Writer**: 1k+ notes; constantly copies to LLMs; craves synthesis and safe, controllable edits.
- **Knowledge Worker/PM/Student**: Writes outlines → prose; wants bullet-to-paragraph, grammar, and scoped retrieval.

## 4) Key User Stories
1. *As a writer,* after saving a note, I want a **ranked list of related notes** with a **2–3 sentence synthesis** so I rediscover connections I forgot.
2. *As a researcher,* I want to **limit scope** to certain folders/tags/backlinks so suggestions stay relevant.
3. *As an editor,* I want to **select text** and trigger **AI rewrite** to a sandbox with a **diff** so I can **Apply** or **Undo** safely.
4. *As a creator,* I want to **spawn a new note** from the synthesis with citations so I can explore tangents without polluting the current file.
5. *As a privacy-conscious user,* I need a **local-only mode** (no external API calls) and clear indicators when remote LLMs are used.

## 5) UX Principles
- **Trust by design:** never overwrite; write to a **collapsible callout** sandbox.
- **Context control:** scoping chips visible everywhere context matters.
- **Low-friction actions:** open, quote, insert link, apply-diff — all one click.
- **Latency awareness:** debounce triggers; show tiny status and cancel handles.

### Suggestions Sandbox Format (example)
```
> [!ai-suggestion] Suggestions (v0.1) — Sources: [[Note A]], [[Note B]]
> Summary: …
> ---
> Proposed replacement for lines 120–155 (diff)
> ```diff
> - old line
> + new line
> ```
```

## 6) Functional Requirements (MVP)
1. **Discover Panel**
   - Trigger: on file save or idle (debounced 800–1200ms) and on explicit “Refresh”.
   - Output: (a) 2–3 sentence synthesis; (b) ranked candidates with snippet; actions: Open, Quote, Insert wiki-link.
   - Scope chips: `Selection • Current file • Folder(s) • Tag(s) • Backlinks • Pinned set` (+ manage saved scopes).

2. **Inline Edit (⌘-⌥-K)**
   - Modal with preset actions: *Rewrite*, *Expand bullets → prose*, *Tighten*, *Translate*, *Fix grammar* + custom prompt.
   - Output to **Suggestions** callout; show **diff**; buttons: **Apply to selection**, **Discard**.

3. **Scoped Chat Drawer**
   - Chat about current file + chosen scope; quick actions: *Summarize scope*, *Outline new note*, *Propose backlinks/tags*.
   - Button: **Create Synthesized Note** (frontmatter sources + citations block).

4. **Backlink/Tag Suggestions**
   - Show candidates with short “because” rationale; **Insert** adds `[[link]]` or tags to frontmatter.

5. **Settings**
   - Hotkeys (conflicts detected/warned).
   - LLM Provider (OpenAI/Claude/Ollama) + model + max tokens + streaming.
   - Indexing: include/exclude folders/tags; frontmatter `ai.index: false` respected.
   - Privacy mode: **Local‑only** or **Allow remote** (red badge when remote).

## 7) Retrieval, Ranking & Indexing
**Signals**
- *Lexical:* BM25/Okapi over notes (fast, transparent).
- *Semantic (optional):* local embeddings (e.g., Nomic/Ollama) or remote API.
- *Graph:* backlink count, shared tags, same folder, recency, edit frequency.

**Blend**
```
score = w_bm25*bm25 + w_sem*semantic
      + w_graph*(α*backlinks + β*shared_tags + γ*same_folder)
      + w_recency*f(days_since_edit)
```
Default: BM25-heavy; semantic off by default; all weights tweakable in advanced JSON.

**Indexing**
- Incremental index on vault file change events.
- Embedding cache keyed by content hash; re-embed on hash drift.
- Respect `ai.index: false` in frontmatter.

## 8) Architecture (High Level)
- **UI:** DiscoverPanel, ChatDrawer, EditModal, SuggestionsSandbox.
- **Core:** ScopeResolver → Retriever → Ranker → ContextAssembler.
- **LLM Adapter:** pluggable (OpenAI/Claude/Ollama), streaming.
- **Storage:** Plugin data (settings, saved scopes), cache (bm25, embeddings), per-note frontmatter flags.
- **Diff Engine:** unified diff; apply via editor transaction to preserve undo stack.

## 9) Non‑Functional Requirements
- Fast perceived response: <150ms for Discover list (BM25 only); semantic augmentation may stream.
- Robustness: never corrupt files; all writes are additive/sandboxed; guardrails around large files.
- Privacy: no external calls in Local-only; explicit model/provider display when remote.
- Accessibility: keyboard-first; ARIA roles in custom elements where applicable.

## 10) Telemetry (local, opt‑in only)
- Time to first suggestion; % suggestions applied; # saved scopes; DAU/WAU; failures/errors (counts only).
- Stored locally in plugin data; user can export/reset.

## 11) Success Metrics
- ≥50% of active users use ⌘-⌥-K weekly.
- ≥30% of Discover sessions lead to at least one action (Open/Quote/Link/Apply).
- 7-day retention ≥35% across beta cohort.

## 12) Release Criteria (v0.1)
- Zero data loss in stress tests (10k-line files, rapid saves).
- Undo works for all apply operations.
- Offline/Local-only fully usable (BM25 only).
- Clear error states; cancelable long ops.

## 13) Milestones (4 weeks)
- **W1:** Skeleton + Settings + Right panel + BM25 index + Scope chips + LLM adapter.
- **W2:** ⌘-⌥-K modal, Sandbox callout, Diff preview & Apply/Undo, Discover population.
- **W3:** Chat Drawer, Create Synthesized Note, Backlink/Tag suggestions, Saved scopes.
- **W4:** Debounce/cancel/polish, docs & GIFs, private beta via BRAT.

## 14) Risks & Mitigations
- Plugin review lag → BRAT channel + clear install guide.
- Hotkey collisions → configurable + conflict warning.
- Latency/cost → default semantic off; batch/stream; provider-agnostic.
- Index drift → content hash; incremental rebuild.

## 15) QA Outline
- Unit: scope resolution, ranking blend, diff application, frontmatter respect.
- Integration: large vaults (1k+ notes), churn tests, offline tests.
- UX: keyboard-only flows, screen size responsiveness, error/cancel paths.

## 16) Open Questions
- Should we allow per-paragraph “Apply All” in sandbox? (lean no for MVP)
- Named weights profiles for “Research vs Writing” modes?
- How to surface “why these sources” succinctly (inline tooltips vs block)?
