# Serendipity Engine - v0.1 Development Plan

This document outlines the development phases for building the v0.1 MVP of the Serendipity Engine Obsidian plugin. The work is structured to deliver value incrementally, starting with a solid foundation and building features on top of it.

## Phase 1: Project Setup & Core Scaffolding

**Goal:** Initialize the plugin project, set up the development environment, and create the main structural components.

*   **Tasks:**
    *   Initialize a new Obsidian plugin project using TypeScript.
    *   Set up `pnpm` for dependency management.
    *   Create the main `SerendipityPlugin` class.
    *   Implement a basic settings tab.
    *   Add placeholders for the Discover Panel (right sidebar leaf) and the Chat Drawer.
    *   Establish basic command registrations (`Edit selection with AI`, `Toggle Discover Panel`, etc.).

## Phase 2: Local-First Indexing & Retrieval

**Goal:** Implement the core local search functionality that powers the plugin's "Local-only" mode.

*   **Tasks:**
    *   Research and select a lightweight TypeScript-compatible BM25 library.
    *   Create an `Index` service responsible for indexing vault documents (`.md` files).
    *   Implement logic to watch for file changes (creation, modification, deletion) and update the index incrementally.
    *   Create a `Retriever` service that can query the index and return a ranked list of documents.
    *   Respect `ai.index: false` frontmatter during indexing.

## Phase 3: Discover Panel UI & Logic

**Goal:** Build the user-facing Discover Panel that surfaces related notes.

*   **Tasks:**
    *   Design and build the UI for the Discover Panel using the Obsidian API.
    *   Integrate the panel with the `Retriever` service.
    *   Trigger retrieval on file save or idle, and display the ranked list of related notes.
    *   Implement actions on discovered notes (Open, Quote, Insert wiki-link).
    *   Add a placeholder for the 2-3 sentence synthesis.

## Phase 4: Inline Edit (⌘-⌥-K) with Ollama

**Goal:** Implement the core inline editing feature with a safe, sandboxed workflow, using Ollama as the initial LLM provider.

*   **Tasks:**
    *   Create the "Edit Modal" that appears on `⌘-⌥-K`.
    *   Build the `LLMAdapter` for connecting to a local Ollama instance.
    *   Implement the `ContextAssembler` to prepare the prompt for the LLM (selection + context snippets).
    *   Create the "Suggestions Sandbox" callout block to display the LLM's output.
    *   Integrate a diffing library to show a clear `diff` of the proposed changes.
    *   Implement the "Apply" button to replace the user's selection safely, preserving the undo history.

## Phase 5: Context Scoping

**Goal:** Empower the user with precise control over the context for AI features.

*   **Tasks:**
    *   Build the UI for the "scope chips" (`Selection`, `Current file`, `Folder(s)`, etc.).
    *   Implement the `ScopeResolver` logic that translates the selected scope into a set of files for the `Retriever`.
    *   Connect the scope chips to both the Discover Panel and the Inline Edit feature.
    *   Add functionality to create, save, and manage named scopes in the plugin settings.

## Phase 6: Chat Drawer & Note Synthesis

**Goal:** Add a conversational interface for interacting with notes and a way to create new, synthesized documents.

*   **Tasks:**
    *   Build the UI for the Chat Drawer.
    *   Integrate the chat input with the `LLMAdapter` and `ScopeResolver`.
    *   Display the conversation history.
    *   Implement the "Create Synthesized Note" command, which generates a new note with citations based on the chat or a discovery synthesis.

## Phase 7: Polish & Beta Preparation

**Goal:** Refine the user experience, add documentation, and prepare for a beta release.

*   **Tasks:**
    *   Improve UI/UX, debounce inputs, and add loading/cancellation states.
    *   Conduct thorough testing, especially for edge cases and data integrity.
    *   Write user-facing documentation and create demo GIFs.
    *   Package the plugin for distribution via BRAT.