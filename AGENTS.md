# Repository Guidelines

## Project Structure & Module Organization
- `src/` TypeScript plugin code. Entry is `src/main.ts`; Discover panel UI in `src/ui/DiscoverView.ts`; helpers live alongside feature code. New UI components (e.g., `src/ui/NoteSearchModal.ts`).
- `scripts/` Dev utilities and headless tests; mocks at `scripts/mocks/obsidian.js`.
- `docs/` Product context and tickets under `docs/tickets/*` — review the relevant ticket before changes.
- Root: build output `main.js`, configuration (`manifest.json`, `tsconfig.json`), and `package.json`.

## Build, Test, and Development Commands
- `npm run dev` — esbuild watch; writes `main.js` with inline sourcemaps.
- `npm run build` — production bundle via esbuild (CJS, target ES2018, external `obsidian`).
- Headless tests:
  - `npm run headless:test` — Discover toggle smoke test.
  - `npm run headless:test:session` — session model.
  - `npm run headless:test:attachments` — prompt attachments flow.
- Optional UI snapshot: `npm run ui:install` then `npm run ui:snap`.

## Coding Style & Naming Conventions
- Language: TypeScript targeting ES2018. Indent with tabs in `src/*.ts`.
- Quotes: single quotes. Names: `camelCase` for vars/functions, `PascalCase` for classes.
- Keep functions small and pure; add concise comments only for non-obvious logic.
- Avoid unrelated refactors or reformatting.

## Testing Guidelines
- Extend headless tests in `scripts/*.js`; prefer focused PASS/FAIL assertions.
- Guard Obsidian workspace calls: use `getRightLeaf(true)` to create leaves instead of assuming presence; ensure Discover toggle is idempotent (no duplicate leaves).
- Run locally before commits and capture output when sharing results.

## Commit & Pull Request Guidelines
- Commits: imperative mood with scope, e.g., `fix: guard right leaf null in toggle`; reference ticket IDs from `docs/tickets`.
- PRs: summarize intent, show before/after behavior (logs or screenshots), list verification steps, and link tickets.

## Security & Configuration Tips
- Do not hardcode secrets. Ollama base URL is user-configurable and defaults to `http://localhost:11434`.
- Validate inputs and workspace state; prefer safe fallbacks over throwing.

## Agent-Specific Instructions
- Respect existing structure and style; do not delete user changes.
- Keep Discover panel toggles idempotent.
- Confirm changes with `npm run headless:test` or targeted scripts before handoff.

