# Ticket 2: Local-First Indexing & Retrieval

**Phase:** 2 - Local-First Indexing & Retrieval
**Status:** Done

## Description

This ticket focuses on building the core offline search capability of the plugin. It involves selecting a BM25 library and creating services to index the user's vault and retrieve documents based on a query. This is a prerequisite for the Discover Panel.

## Acceptance Criteria

1.  Local relevance scoring engine implemented (initial TF‑IDF baseline; BM25 may replace later) and runs fully offline.
2.  `IndexingService` scans all `.md` files via `app.vault.getMarkdownFiles()`, reads title and content, and respects `ai.index: false` frontmatter.
3.  Index persistence: saved/loaded via plugin data with `schemaVersion` and `timestamp`; rebuilds on version mismatch or missing data.
4.  Incremental updates: listens to `create`, `modify`, `delete`, `rename` and `metadataCache` `changed` events to keep the index fresh.
5.  `RetrievalService.search(query: string, opts?: { limit?: number })` returns `Array<{ file: TFile, score: number, snippet: string }>`.
6.  Snippet generator returns a short snippet around the first hit (or first sentence) for each result.
7.  A `Reindex Vault` command exists to trigger a full rebuild and logs basic progress.
8.  Headless tests verify indexing and retrieval using the repository’s mock Obsidian harness.

## Tasks

- [x] Implement a no-dependency TF‑IDF baseline (document option to swap in BM25 like `wink-bm25-text-search` later).
- [x] Build `IndexingService` (`buildIndex()`, `updateIndex(file)`, `removeFromIndex(file)`, `save()`, `load()` with `schemaVersion`).
- [x] Tokenize/normalize with simple stopword removal; weight titles slightly higher than body.
- [x] Hook `app.vault.on('create'|'modify'|'delete'|'rename')` and `app.metadataCache.on('changed')` for incremental updates.
- [x] Implement `RetrievalService.search(query, {limit})` returning `{ file, score, snippet }`; add a simple snippet generator.
- [x] Add a `Reindex Vault` command in `src/main.ts` and basic progress/error logging.
- [x] Extend headless tests to cover index build and retrieval correctness.
