# Ticket 1: Project Setup & Core Scaffolding

**Phase:** 1 - Project Setup & Core Scaffolding
**Status:** Done

## Description

This ticket covers the initial setup of the Obsidian plugin project. It lays the foundational groundwork required before any features can be implemented.

## Acceptance Criteria

1.  A new Obsidian plugin project is initialized using the standard TypeScript template.
2.  `pnpm` is configured as the package manager, and all initial dependencies are installed.
3.  The main plugin class `SerendipityPlugin` is created and loads correctly in Obsidian.
4.  A basic, empty settings tab for "VaultPilot" is visible in Obsidian's settings.
5.  A command `Toggle Discover Panel` is registered and, when run, logs a message to the console and opens a new view in the right sidebar.
6.  A command `Edit selection with AI` with the hotkey `⌘-⌥-K` is registered and logs a message to the console when triggered.
7.  The project structure includes placeholder directories for future services (e.g., `src/services`, `src/ui`, `src/types`).

## Tasks

- [x] Initialize project using `obsidian-plugin-cli` or a similar tool.
- [x] Remove `npm` or `yarn` lockfiles and run `pnpm install`.
- [x] Create the main `src/main.ts` file containing the `SerendipityPlugin` class.
- [x] Implement a `SerendipitySettingTab` class.
- [x] Add a `registerView` call for a placeholder "Discover" view.
- [x] Use `addCommand` to register the initial set of commands.
- [x] Create empty directories for `services`, `ui`, `types`, `llm`, and `indexing`.
