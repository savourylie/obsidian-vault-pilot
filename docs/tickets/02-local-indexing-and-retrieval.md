# Ticket 2: Local-First Indexing & Retrieval

**Phase:** 2 - Local-First Indexing & Retrieval
**Status:** To Do

## Description

This ticket focuses on building the core offline search capability of the plugin. It involves selecting a BM25 library and creating services to index the user's vault and retrieve documents based on a query. This is a prerequisite for the Discover Panel.

## Acceptance Criteria

1.  A lightweight, TypeScript-compatible BM25 library is chosen, justified, and added as a dependency.
2.  An `IndexingService` is created that can scan all `.md` files in the vault.
3.  The service builds a BM25 index from the documents and can save/load it from the plugin's data directory.
4.  The service listens to Obsidian's file system events (`create`, `modify`, `delete`) to keep the index up-to-date.
5.  The indexing process correctly ignores files with `ai.index: false` in their frontmatter.
6.  A `RetrievalService` is created with a method `search(query: string)` that returns a ranked list of file paths.
7.  Unit tests are written for the core indexing and retrieval logic.

## Tasks

- [ ] Research and select a BM25 library (e.g., `wink-bm25-text-search`, `lunr`, or a custom implementation).
- [ ] Implement `IndexingService` with `buildIndex()` and `updateIndex(file)` methods.
- [ ] Hook into `app.vault.on(...)` and `app.metadataCache.on(...)` events.
- [ ] Implement frontmatter parsing to check for the `ai.index` flag.
- [ ] Implement `RetrievalService` that uses the index to perform searches.
- [ ] Add basic logging to report indexing progress and errors.