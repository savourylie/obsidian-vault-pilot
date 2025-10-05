# Ticket 18: Plumb Chat Settings to ChatService

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** Ticket 17

## Description
Pass the new chat windowing settings from the plugin to the ChatService, so the service can use them for token budgeting and compaction in subsequent tickets.

## Acceptance Criteria
1. `DiscoverView` constructs `ChatService` with an options object containing: `maxPromptTokens`, `reservedResponseTokens`, `recentMessagesToKeep`, `minRecentMessagesToKeep`.
2. Values come from plugin settings (`SerendipityPlugin.settings`).
3. No change to chat behavior yet; app loads without runtime errors.

## Implementation Details
- File: `src/services/ChatService.ts`
  - Add a `ChatServiceOptions` interface with the four settings (all optional; defaults applied inside).
  - Extend constructor to accept `(adapter: LLMAdapter, options?: ChatServiceOptions)` and store normalized options.
- File: `src/ui/DiscoverView.ts`
  - Extend constructor to accept a `chatOptions: ChatServiceOptions` param.
  - Instantiate `new ChatService(adapter, chatOptions)`.
- File: `src/main.ts`
  - When registering the view, pass a `chatOptions` object constructed from `this.settings`.

## Tasks
- [x] Add `ChatServiceOptions` type and update `ChatService` constructor signature (no behavior changes yet).
- [x] Update `DiscoverView` constructor and instantiation site in `main.ts` to pass options through.
- [x] Ensure build succeeds and Discover panel opens normally.

## Testing
- Build plugin and open Discover panel; verify no errors.
- Temporarily log options inside `ChatService` constructor (optional during dev), then remove.

