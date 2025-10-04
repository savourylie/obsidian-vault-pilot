# Repository Guidelines

## Project Structure & Module Organization
- `src/` — TypeScript plugin code. Entry: `src/main.ts`; UI: `src/ui/DiscoverView.ts`.
- `docs/` — Design docs and tickets (`docs/tickets/*`). Use these to track work.
- `scripts/` — Dev utilities and headless testing (`scripts/mocks/obsidian.js`, `scripts/headless-test.js`).
- Root — `manifest.json`, `package.json`, `tsconfig.json`, generated `main.js` bundle.

## Build, Test, and Development Commands
- `npm run dev` — Bundle with sourcemaps for local iteration (writes `main.js`).
- `npm run build` — Production bundle via esbuild (minified `main.js`).
- `npm run headless:test` — Runs a Node-based test that exercises Discover panel toggle logic without Obsidian.

## Coding Style & Naming Conventions
- Language: TypeScript targeting ES2018; bundle with esbuild.
- Indentation: use tabs in `src/*.ts` to match existing files.
- Strings: single quotes; identifiers in `camelCase`; classes in `PascalCase`.
- Keep changes minimal and focused; avoid unrelated refactors or reformatting.
- Prefer small, pure functions; avoid one-letter variable names.

## Testing Guidelines
- Headless smoke tests live in `scripts/` and use the mocked `obsidian` API.
- Add focused checks (e.g., open/close semantics, null guards) and print PASS/FAIL.
- Run: `npm run headless:test`. Add additional scripts as needed (no heavy test framework required).

## Commit & Pull Request Guidelines
- Commits: imperative, concise messages (e.g., `fix: guard right leaf null in toggle`).
- Reference ticket IDs from `docs/tickets` when applicable (e.g., "Ticket 6").
- PRs should include: summary, before/after behavior, screenshots or logs when useful, test steps, and linked tickets.

## Security & Configuration Tips
- Do not hardcode secrets. The Ollama base URL lives in plugin settings (default `http://localhost:11434`).
- Guard Obsidian workspace APIs that may return `null` (e.g., `getRightLeaf(false)`). Create leaves when necessary (`getRightLeaf(true)`).

## Agent-Specific Instructions
- When modifying files, respect this guide and keep the code style consistent (tabs, quotes, naming).
- Do not add license headers or reformat unrelated code.
- If adding features to the Discover panel, ensure toggle behavior remains consistent and idempotent.

