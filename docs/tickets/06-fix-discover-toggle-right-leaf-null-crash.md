# Ticket 6: Fix Toggle Discover Panel crash when right sidebar is unopened

**Phase:** 6 - Bugfix
**Status:** Done

## Description

Running the command `Toggle Discover Panel` throws a runtime error in fresh sessions where the right sidebar has never been opened. In these cases, `this.app.workspace.getRightLeaf(false)` can return `null`, and the plugin immediately calls `.setViewState` on it, causing a crash and preventing the Discover view from opening.

## Impact

- Severity: P1 (blocks users from opening the Discover panel in a fresh session)
- Scope: All users in sessions with no existing right sidebar leaf

## Where

- Code path: `src/main.ts` (`toggleDiscoverView`)

## Steps to Reproduce

1. Start Obsidian with a vault where the right sidebar has not been opened yet (fresh session).
2. Load the plugin.
3. Run the command: `Toggle Discover Panel`.
4. Observe error: `TypeError: Cannot read properties of null (reading 'setViewState')` and the view does not open.

## Expected Behavior

- The command opens the Discover view in the right sidebar, creating a right leaf if needed.
- No runtime errors occur, even if the right sidebar was never opened.

## Actual Behavior

- The command crashes with a `TypeError` because `getRightLeaf(false)` returns `null` and `.setViewState` is called on it.

## Root Cause

- `getRightLeaf(false)` can return `null` in sessions where the right sidebar pane has not been created yet.
- The code does not guard against `null` before calling `.setViewState`.

## Proposed Fix

- Guard the result of `getRightLeaf(false)` and create a right leaf if missing, e.g.:
  - Prefer `getRightLeaf(true)` so Obsidian creates one if needed; or
  - If keeping `false`, check for `null` and fall back to creating a right leaf before calling `.setViewState`.
- Ensure `revealLeaf` still works with the created leaf.

## Acceptance Criteria

1. Running `Toggle Discover Panel` successfully opens the Discover view in the right sidebar, even in a fresh session with no right leaf.
2. No `TypeError` or other console errors are produced.
3. Subsequent toggles do not duplicate views and correctly reveal the existing Discover view.
4. Behavior is consistent across restarts.

## Tasks

- [x] Update `src/main.ts` to either use `getRightLeaf(true)` or to guard a `null` leaf and create one before `.setViewState`.
- [x] Implement true toggle semantics: close if open; open otherwise.
- [x] Manual test/build to verify no compile errors.

## Resolution

- Implemented `toggleDiscoverView` in `src/main.ts` with:
  - Guarded right-leaf creation: fallback to `getRightLeaf(true)` when `getRightLeaf(false)` returns `null`.
  - Toggle behavior: if a Discover view exists, detach it and return; otherwise open and reveal it.
- Updated the command callback to call `toggleDiscoverView`.
- Built successfully with esbuild (`npm run build`).
