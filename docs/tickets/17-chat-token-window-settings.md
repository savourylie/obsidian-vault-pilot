# Ticket 17: Add Chat Token Window Settings

**Phase:** 6 - Chat Windowing
**Status:** Done
**Dependencies:** None

## Description
Expose user-configurable settings to control chat token windowing and compaction behavior:
- `maxPromptTokens` (default 8192)
- `reservedResponseTokens` (default 512)
- `recentMessagesToKeep` (default 6)
- `minRecentMessagesToKeep` (default 2)

Persist them in plugin data and surface them in the settings tab.

## Acceptance Criteria
1. New settings appear in the plugin settings UI with sensible defaults and help text.
2. Values persist across Obsidian restarts (saved in plugin data).
3. Input validation prevents invalid combinations (e.g., reserved >= max, minRecent > recent, values < 1).
4. No behavior change yet to chat history beyond settings storage.

## Implementation Details
- File: `src/main.ts`
  - Extend `SerendipityPluginSettings` with the four numeric fields and defaults.
  - Update `DEFAULT_SETTINGS` accordingly.
  - In `SerendipitySettingTab.display()`, add number inputs with:
    - `min=1` for all; `reservedResponseTokens < maxPromptTokens` check.
    - `minRecentMessagesToKeep <= recentMessagesToKeep` check.
  - Save via existing `saveSettings()`.

## Tasks
- [x] Add fields to `SerendipityPluginSettings` and `DEFAULT_SETTINGS`.
- [x] Render number inputs in settings tab with validation and descriptions.
- [x] Persist and reload the settings.
- [x] Manual smoke: change values, reload plugin, confirm persistence.

## Testing
- Change each field to a non-default value and verify it persists.
- Try invalid values (negative, zero, reserved >= max) and confirm UI clamps or shows sane behavior (revert/notice).
- Ensure no runtime errors in console.

