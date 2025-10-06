# Plan: Token‑Windowed Chat History with LLM Compaction

## Summary
Introduce an 8,192‑token input cap with reserved response tokens and LLM‑driven history compaction. Replace the current “last 5 messages” rule with a rolling window that keeps the most recent messages verbatim, compacts older history into a single system summary, and trims context token‑aware to fit the remaining budget. Persist the summary as a `system` message so sessions remain consistent across reloads. Fix prompt duplication of the latest user message.

## Goals & Constraints
- Cap prompt at `maxPromptTokens` with `reservedResponseTokens` headroom.
- Prefer preserving recent conversational state; compact earlier content via LLM.
- Persist compacted history as a `system` message in the session; UI should remain unchanged (system is hidden by chat renderer).
- Avoid duplicating the current user message in the prompt.
- Keep implementation minimal, dependency‑free (heuristic token estimator), and consistent with existing code style.

## User Settings (defaults)
- `maxPromptTokens` (default: `8192`) — hard cap for input tokens.
- `reservedResponseTokens` (default: `512`) — reserved headroom for model output.
- `recentMessagesToKeep` (default: `6`) — target count of recent messages to keep verbatim.
- `minRecentMessagesToKeep` (default: `2`) — minimum recent messages to preserve before compressing them.

These will be added to plugin settings in `src/main.ts` and passed to `ChatService` via `DiscoverView`.

## Data Model & Persistence
- Continue storing conversation as `ChatMessage[]` per session (`src/types/chat.ts`).
- Inject a compacted summary as a single `{ role: 'system', content: '…' }` message at the front of history.
- No schema changes. `SessionManager.updateSession()` persists as‑is. `DiscoverView` already excludes `system` messages from visual rendering.

## Token Estimation (heuristic)
- Add a lightweight estimator inside `ChatService`:
  - `estimateTokens(text: string): number` → `Math.ceil(text.length / 4)` + small overhead for labels/newlines.
  - `estimateMessagesTokens(messages: ChatMessage[]): number` → sum over message content + label overhead.
  - `estimatePromptTokens(messages, context, currentUser?)` → combined budget estimate for prompt sections.
- No external deps; consistent with ES2018.

## Prompt Construction (token‑aware)
- Effective budget `B = maxPromptTokens - reservedResponseTokens`.
- Components in order:
  1) Optional context: “You have access to the following document …” delimited by BEGIN/END. Trim context token‑aware to fit remaining budget after messages; if needed, reduce to zero.
  2) Optional conversation summary (from `system` message): “Conversation summary: …”.
  3) Previous conversation: render history excluding the just‑added user message to avoid duplication.
  4) Current input: append the current user message once, then `Assistant:`.

## Compaction Algorithm
1. Compute `B = maxPromptTokens - reservedResponseTokens`.
2. Estimate tokens for messages (without context). If within `B`, skip compaction.
3. Otherwise, partition history:
   - Identify an existing `system` summary (if any).
   - Define `keepN = recentMessagesToKeep`.
   - Older block = everything before the last `keepN` messages (including any existing `system`).
4. Summarize older block with `adapter.generate()` using a concise prompt (see Prompt Template below). On error, fallback to a naive truncated summary.
5. Replace older block with a single `system` message + last `keepN` messages.
6. Re‑estimate. If messages still exceed `B` (even with context removed):
   - Gradually reduce `keepN` down to `minRecentMessagesToKeep`, summarizing overflow again as needed.
7. If still over with `keepN = minRecentMessagesToKeep` (e.g., huge recent messages):
   - Compress part of the recent window (e.g., summarize the earliest of the recent messages) and keep the last 1–2 most recent verbatim.
   - As a last resort, keep only a very concise `system` summary of the entire chat plus the current user message.

### Edge Cases
- Latest 6 already exceed budget: context trimmed to zero, then shrink `keepN` → summarize overflow; if necessary, compress recent messages until within budget, preserving at least the immediate turn where possible.
- Huge single message: summarize that message’s content to fit; do not drop content.
- Offline/adapter error: fallback to naive truncation into a `system` summary; proceed.
- Empty history: no summary needed.

## Prompt Template (summarization)
- Instruction: “Summarize the conversation so far for an assistant. Keep key facts, constraints, decisions, action items, and unresolved questions. Be concise. Do not invent details.”
- Include older messages serialized as `User:`/`Assistant:` lines. If a previous summary exists, prepend it as “Previous summary: …”.

## API / Code Changes
- `src/services/ChatService.ts`
  - Add options interface: `{ maxPromptTokens, reservedResponseTokens, recentMessagesToKeep, minRecentMessagesToKeep }` with defaults.
  - Add heuristic token estimator helpers.
  - Add `private async compactHistoryIfNeeded(context: string): Promise<void>` implementing the algorithm above.
  - Update `buildPrompt()` to be token‑aware, include `system` summary, and remove duplicate inclusion of the latest user message.
  - In `sendMessage()`: push user message → `compactHistoryIfNeeded(context)` → build prompt → stream response → push assistant → persist via `saveToSession()`.
- `src/ui/DiscoverView.ts`
  - Pass ChatService options from constructor if needed (via main settings).
  - No changes to history rendering; it already omits `system` messages.
- `src/main.ts`
  - Extend settings with the four new fields and UI controls (number inputs with validation and sensible min values).
  - Wire settings into `DiscoverView` → `ChatService`.

## Testing (headless)
- New script: `scripts/chat-window-test.js` using a stub LLM adapter.
- Scenarios:
  - Under budget → no system summary injected; last N retained.
  - Over budget → older messages summarized; last N retained; no duplicate user message in prompt.
  - Latest N exceed cap → shrink window then compress recent; respect `minRecentMessagesToKeep`.
  - Large context → context trimmed to fit after messages.
  - Summarization failure → fallback truncation still respects cap.

## Rollout Steps
1. Add settings (types, defaults, UI) in `src/main.ts`.
2. Propagate settings to `ChatService` via `DiscoverView`.
3. Implement estimator, compaction, and prompt build fixes in `ChatService`.
4. Add headless test script and basic assertions/logs.
5. Manual smoke: send long chats and verify persistence and UI behavior.

## Future Enhancements
- Model‑specific tokenization (e.g., tiktoken compatibility) when provider is OpenAI/Claude.
- Summarization quality tuning (temperature, style prompts, length hints).
- Expose these settings in a “Chat” section with brief help tooltips.
- Optional multiple summaries (topic‑segmented) if window grows very long.

