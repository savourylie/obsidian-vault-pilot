# Ticket 4: Inline Edit (⌘-⌥-K) with Ollama

**Phase:** 4 - Inline Edit (⌘-⌥-K) with Ollama
**Status:** To Do

## Description

This ticket focuses on implementing the core "Edit with AI" feature. It includes creating a modal, connecting to Ollama, and displaying the AI's suggestions in a sandboxed callout with a diff view for safe application.

## Acceptance Criteria

1.  Pressing `⌘-⌥-K` on a text selection opens a modal.
2.  The modal contains a text area for a custom prompt and buttons for preset actions (*Rewrite*, *Tighten*, *Expand*).
3.  An `LLMAdapter` for Ollama is created. It can stream responses from a local Ollama server.
4.  A `ContextAssembler` service is created that takes the user's selection and retrieves relevant context snippets using the `RetrievalService`.
5.  On modal submission, the adapter sends the assembled context and prompt to Ollama.
6.  The AI's response is streamed into a `> [!ai-suggestion]` callout block inserted below the current paragraph.
7.  A `diff` is generated between the original selection and the AI suggestion and displayed within the callout.
8.  An "Apply" button in the callout replaces the original text selection with the suggestion. This action must be undoable (`Ctrl/Cmd+Z`).

## Tasks

- [ ] Create an `EditModal.ts` that extends `Modal`.
- [ ] Implement the UI for the modal with prompt presets.
- [ ] Create `OllamaLLMAdapter.ts` with a `stream` method.
- [ ] Implement `ContextAssembler.ts`.
- [ ] Wire the modal to the adapter and assembler.
- [ ] Choose and integrate a lightweight diffing library (e.g., `diff`).
- [ ] Implement the logic to insert the suggestion callout.
- [ ] Implement the `apply` logic using `editor.replaceSelection()` to ensure it's on the undo stack.
- [x] Add settings in the plugin's setting tab to configure the Ollama endpoint URL.
