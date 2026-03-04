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

## Implementation Notes
**Status**: ✅ COMPLETED

**Changes Made**:

1. **Settings Interface** (`src/main.ts`):
   - Added `openAIApiKey: string` field to `SerendipityPluginSettings`
   - Added to `DEFAULT_SETTINGS` with empty string default
   - Added password-type input field in settings UI (only shown when provider = OpenAI-compatible)
   - Field is masked and includes clear description about security and usage

2. **OpenAIAdapter** (`src/llm/OpenAIAdapter.ts`):
   - Added optional `apiKey?: string` parameter to constructor
   - Added `Authorization: Bearer <key>` header to both `requestUrl` and `fetch` calls when key is present
   - No header added when key is empty/undefined

3. **Adapter Factory** (`src/llm/adapterFactory.ts`):
   - Added `openAIApiKey?: string` to `AdapterFactoryOptions` interface
   - Updated `createAdapter()` to pass API key to `OpenAIAdapter` constructor

4. **DiscoverView** (`src/ui/DiscoverView.ts`):
   - Added `openAIApiKey` property
   - Updated constructor to accept `openAIApiKey` parameter
   - Updated `updateProviderSettings()` to accept and use API key
   - Passes API key to `createAdapter()` in both constructor and settings updates

5. **Integration Points** (`src/main.ts`):
   - Updated all `createAdapter()` calls to pass `openAIApiKey`
   - Updated `DiscoverView` instantiation to pass API key
   - Updated `refreshAllDiscoverViewProviderSettings()` to pass API key

**Security Considerations**:
- API key is stored in Obsidian plugin settings (standard practice for Obsidian plugins)
- Password-type input field masks the key in UI
- No logging or exposure of key in console or error messages
- Key is only sent to the configured `openAIUrl` endpoint

**Test Results**:
- ✅ Build succeeds without errors
- ✅ All tagging unit tests pass
- ✅ TF-IDF fallback tests pass
- ✅ No regressions detected

**Behavior**:
- When `openAIApiKey` is set (non-empty), `OpenAIAdapter` includes `Authorization: Bearer <key>` header in all requests
- When key is empty, no `Authorization` header is added
- Works seamlessly with existing Ollama and LM Studio flows (key is ignored for those providers)
- Enables authentication with OpenAI, OpenRouter, Together AI, and other key-requiring endpoints

