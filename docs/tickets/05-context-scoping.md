# Ticket 5: Context Scoping

**Phase:** 5 - Context Scoping
**Status:** To Do

## Description

This ticket covers the implementation of context-scoping features. Users should be able to control the "context" for discovery and AI actions by selecting folders, tags, etc. This enhances the relevance of the plugin's suggestions.

## Acceptance Criteria

1.  A "scope chip" UI is added to the Discover Panel and the Edit Modal.
2.  Available scopes include: `Selection`, `Current file`, `Folder(s)`, `Tag(s)`, `Backlinks`, and `Pinned set`.
3.  A `ScopeResolver` service is created that takes a scope definition and returns a list of `TFile` objects.
4.  The `RetrievalService` is updated to accept a list of files from the `ScopeResolver` to constrain its search.
5.  The UI allows users to select one or more folders/tags when those scopes are active.
6.  A new section in the settings tab allows users to create and manage "named scopes" (e.g., "Work Research," "Personal Journal").
7.  Named scopes appear as chips alongside the default ones.

## Tasks

- [ ] Design and implement the scope chip component using the Obsidian API.
- [ ] Implement the `ScopeResolver` service.
- [ ] Integrate the `ScopeResolver` with the `RetrievalService`.
- [ ] Build the UI for selecting folders and tags.
- [ ] Implement the settings UI for managing named scopes.
- [ ] Persist named scopes in the plugin's settings data.