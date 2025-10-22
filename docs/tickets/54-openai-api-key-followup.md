# 54 — Follow‑Up: Optional API Key Support for OpenAI‑Compatible Endpoints

Goal: Allow users to provide an API key header for OpenAI‑compatible endpoints that require authentication, without hardcoding secrets.

## Why
- Many OpenAI‑compatible providers require `Authorization: Bearer <API_KEY>`.
- Current adapter (Ticket 50) intentionally avoids key handling to keep scope small.

## Scope
- Add an optional `openAIApiKey` string to settings.
- If present (non‑empty), include `Authorization: Bearer ${openAIApiKey}` in `OpenAIAdapter` requests.
- Provide clear UI copy about storage and that the key is used only for requests to `openAIUrl`.

## Proposed Changes
- `src/main.ts`
  - Extend `SerendipityPluginSettings` with `openAApiKey?: string` (exact naming can be `openAIKey` / `openAIApiKey`).
  - Add a password‑type text field under the OpenAI‑compatible provider section.
  - Save to settings; do not log or expose in notices.
- `src/llm/OpenAIAdapter.ts`
  - Accept an optional `apiKey?: string` in the constructor.
  - When present, add `Authorization` header to both `requestUrl` and `fetch` fallbacks.

## Acceptance Criteria
- If `openAIApiKey` is set, requests from `OpenAIAdapter` include the `Authorization` header.
- If the key is empty, no header is added.
- No secrets are printed to logs or errors.

## Non‑Goals
- Secure storage beyond Obsidian plugin settings.
- Key rotation or multiple profiles.

## Verification Steps
1. Configure provider = OpenAI‑compatible, set base URL and API key for a known service.
2. Verify Discover chat and Edit flows succeed.
3. Clear the key; requests should be made without `Authorization`.

