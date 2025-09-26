# Ticket 3: Discover Panel UI & Logic

**Phase:** 3 - Discover Panel UI & Logic
**Status:** To Do

## Description

This ticket covers the implementation of the user-facing "Discover Panel". It will use the `RetrievalService` from Ticket #2 to display a list of related notes in the sidebar.

## Acceptance Criteria

1.  A new view is registered in the right sidebar with the icon of a lightbulb (or similar) and the title "Discover".
2.  When the panel is open, it automatically triggers a search using the content of the currently active note.
3.  The search is debounced and runs on file save or after a period of inactivity.
4.  The panel displays a ranked list of the top N related notes returned by the `RetrievalService`.
5.  Each item in the list shows the note title and a small snippet of the content.
6.  Each item has three clickable actions:
    *   **Open:** Opens the note in a new pane.
    *   **Quote:** (Placeholder) Logs a message to the console.
    *   **Insert Link:** Inserts a `[[wikilink]]` to the note at the current cursor position in the active editor.
7.  A placeholder text "Synthesis will appear here..." is shown at the top of the panel.

## Tasks

- [ ] Create a `DiscoverView.ts` that extends `ItemView`.
- [ ] Implement the `onOpen` and `onClose` methods to set up and tear down the view's DOM.
- [ ] Use the Obsidian API (`createEl`) to build the list of results.
- [ ] Hook into workspace events to detect the active file and trigger searches.
- [ ] Implement the `on-save` and `on-idle` triggers with appropriate debouncing.
- [ ] Implement the "Open", "Quote", and "Insert Link" action handlers.
- [ ] Style the view to be clean and readable.