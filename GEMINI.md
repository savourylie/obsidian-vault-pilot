# GEMINI.md: VaultPilot Obsidian Plugin

This document provides a comprehensive overview of the VaultPilot Obsidian plugin, its architecture, and development guidelines.

## Project Overview

VaultPilot is an Obsidian plugin that acts as a "serendipity engine" to help users discover connections between their notes. It also provides AI-powered editing and a chat interface to interact with notes and the knowledge base.

**Core Features:**

*   **Discover Panel:** A sidebar view that displays a list of related notes based on the currently active note.
*   **AI-Powered Editing:** Inline AI commands to rewrite, expand, tighten, or translate selected text.
*   **Chat Interface:** A chat view to ask questions and interact with the content of the active note and other contextually relevant notes.
*   **Context Control:** Users can explicitly add notes to the chat context, providing the AI with a focused knowledge base.

**Architecture:**

The plugin is built with TypeScript and consists of several key components:

*   **`src/main.ts`:** The main entry point of the plugin. It initializes all services, registers views and commands, and manages settings and data persistence.
*   **Services:**
    *   `IndexingService`: Builds and maintains a local index of the user's vault for fast note retrieval.
    *   `RetrievalService`: Uses the index to find and rank related notes.
    *   `ChatService`: Manages the chat functionality, including conversation history, interaction with the LLM, and token windowing.
    *   `SessionManager`: Manages chat sessions and their context.
*   **UI Components:**
    *   `DiscoverView`: The main UI component, an Obsidian `ItemView` that hosts the related notes list and the chat interface.
    *   `EditModal`: A modal window that provides AI-powered editing options for the selected text.
    *   `SuggestionCallout`: A custom callout block that displays the AI's suggestions with a diff view.
*   **LLM Integration:**
    *   `OllamaAdapter`: An adapter to connect to a local Ollama instance for LLM inference.

## Building and Running

The project uses `pnpm` for package management and `esbuild` for bundling the TypeScript code.

**Key Commands:**

*   **Install dependencies:**
    ```bash
    pnpm install
    ```
*   **Run in development mode:**
    ```bash
    pnpm run dev
    ```
    This will watch for file changes and automatically rebuild the plugin.
*   **Build for production:**
    ```bash
    pnpm run build
    ```
*   **Run headless tests:**
    ```bash
    pnpm run headless:test
    ```
*   **Run UI snapshot tests:**
    ```bash
    pnpm run ui:snap
    ```

## Development Conventions

*   **Language:** TypeScript
*   **Code Style:** The project uses ESLint for linting.
*   **Testing:** The project has a suite of headless tests for services and UI snapshot tests using Playwright.
*   **Contributions:** The `docs/README_Serendipity_Obsidian.md` file mentions that pull requests should be small, focused, and include a demo GIF or screenshot.
