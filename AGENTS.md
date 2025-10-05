# Repository Guidelines

## Project Structure & Module Organization
- `src/` houses TypeScript plugin logic. `src/main.ts` registers the plugin, `src/ui/DiscoverView.ts` drives the Discover panel UI, and shared helpers live alongside feature code.
- `scripts/` contains dev utilities and headless tests; key mocks sit in `scripts/mocks/obsidian.js`.
- `docs/` tracks product context and tickets (`docs/tickets/*`). Review relevant ticket before starting work.
- Root directory stores build artifacts (`main.js`), configuration (`manifest.json`, `tsconfig.json`), and package manifests.

## Build, Test, and Development Commands
- `npm run dev` — watch-mode bundle with sourcemaps, writing to `main.js`.
- `npm run build` — production bundle via esbuild; run before publishing.
- `npm run headless:test` — Node-based smoke test that exercises Discover panel toggling through the mocked Obsidian API.

## Coding Style & Naming Conventions
- Write TypeScript targeting ES2018 with tabs for indentation in `src/*.ts`.
- Prefer single quotes, `camelCase` identifiers, and `PascalCase` classes; keep functions small and pure.
- Avoid unrelated refactors or reformatting; add concise comments only when logic is non-obvious.

## Testing Guidelines
- Extend the headless tests in `scripts/headless-test.js`; favour focused PASS/FAIL assertions.
- Guard interactions with Obsidian workspace APIs (`getRightLeaf`) to prevent null errors before asserting outcomes.
- Run tests locally before commits; capture output when sharing results.

## Commit & Pull Request Guidelines
- Commit in imperative mood (`fix: guard right leaf null in toggle`) and reference ticket IDs from `docs/tickets` when applicable.
- Pull requests should summarize intent, show before/after behaviour (logs or screenshots when relevant), list verification steps, and link tickets.

## Security & Configuration Tips
- Never hardcode secrets; the Ollama base URL is user-configurable and defaults to `http://localhost:11434`.
- Validate workspace leaves by creating them on demand (`getRightLeaf(true)`) instead of assuming presence.

## Agent-Specific Instructions
- Respect existing style and file structure; do not delete user changes.
- Keep Discover panel toggles idempotent; ensure repeated commands do not duplicate leaves.
- Confirm changes with `npm run headless:test` or targeted scripts before handing off.
