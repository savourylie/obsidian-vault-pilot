# Ticket 3: Discover Panel UI & Logic

**Phase:** 3 - Discover Panel UI & Logic
**Status:** In Progress

## Description

This ticket covers the implementation of the user-facing "Discover Panel". It will use the `RetrievalService` from Ticket #2 to display a list of related notes in the sidebar.

## Acceptance Criteria

1. A view is registered in the right sidebar with icon `message-circle` and title "Discover".
2. When open, it runs a debounced search for the active Markdown file using its title (weighted) + first 300–500 chars.
3. Triggers: on `file-open` and vault `modify` (save) events; debounce 500–800ms; ignore when no active Markdown file.
4. Displays a ranked list (default top 10) from `RetrievalService`, excluding the active file.
5. Each result shows the note title and a snippet.
6. Actions:
   - **Open:** Opens the note in a new split.
   - **Insert Link:** Inserts a `[[basename]]` at the current cursor in the active editor (fallback to `[[path]]`).
   - **Quote:** Placeholder (console log) for now.
7. Shows "Synthesis will appear here..." at the top, a loading state during search, and an empty state when no results.

## Tasks

- [x] Create a `DiscoverView.ts` that extends `ItemView`.
- [x] Implement the `onOpen` and `onClose` methods to set up and tear down the view's DOM.
- [x] Use the Obsidian API (`createEl`) to build the list of results.
- [x] Hook into workspace events to detect the active file and trigger searches.
- [x] Implement a debounced search on file-open and save.
- [x] Implement the "Open" and "Insert Link" actions; "Quote" as a placeholder.
- [x] Style the view to be clean and readable.
