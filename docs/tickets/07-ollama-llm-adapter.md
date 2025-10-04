# Ticket 7: Ollama LLM Adapter

**Phase:** 4 - Inline Edit (⌘-⌥-K) with Ollama
**Status:** Done
**Dependencies:** None (foundational)

## Description

Implement a streaming LLM adapter for Ollama that can connect to a local Ollama instance and generate text completions. This is the foundational component for all AI features in the plugin.

## Acceptance Criteria

1. `OllamaAdapter` class created in `src/llm/OllamaAdapter.ts`.
2. Constructor accepts base URL from plugin settings (default: `http://localhost:11434`).
3. Implements `generate(prompt: string, model?: string): Promise<string>` for simple completions.
4. Implements `stream(prompt: string, onChunk: (text: string) => void, options?: StreamOptions): Promise<void>` for streaming responses.
5. Uses Ollama's `/api/generate` endpoint with proper request format.
6. Handles errors gracefully:
   - Connection failures (Ollama not running)
   - Invalid responses
   - Timeout scenarios
7. Default model: `gemma3n:e2b` (configurable via options).
8. Streaming responses are properly decoded from newline-delimited JSON.
9. Supports cancellation via AbortController.

## Implementation Details

### Ollama API Format
```typescript
// Request to /api/generate
{
  "model": "gemma3n:e2b",
  "prompt": "your prompt here",
  "stream": true
}

// Streaming response (newline-delimited JSON)
{"model":"gemma3n:e2b","created_at":"...","response":"chunk1","done":false}
{"model":"gemma3n:e2b","created_at":"...","response":"chunk2","done":false}
{"model":"gemma3n:e2b","created_at":"...","response":"","done":true}
```

### Interface
```typescript
export interface StreamOptions {
	model?: string;
	temperature?: number;
	signal?: AbortSignal;
}

export class OllamaAdapter {
	constructor(private baseUrl: string) {}

	async generate(prompt: string, model?: string): Promise<string>
	async stream(
		prompt: string,
		onChunk: (text: string) => void,
		options?: StreamOptions
	): Promise<void>
}
```

## Tasks

- [ ] Create `src/llm/OllamaAdapter.ts` with class skeleton.
- [ ] Implement `generate()` method with fetch to `/api/generate`.
- [ ] Implement `stream()` method with streaming fetch and response parsing.
- [ ] Add error handling for connection failures, timeouts, and malformed responses.
- [ ] Support AbortController for cancellation.
- [ ] Create `src/types/llm.ts` for shared interfaces.
- [ ] Add headless test in `scripts/ollama-test.js` to verify:
  - Connection to local Ollama
  - Simple generation
  - Streaming (if Ollama available; skip if not)

## Testing

### Manual Test
1. Ensure Ollama is running: `ollama serve`
2. Ensure `gemma3n:e2b` model is available: `ollama pull gemma3n:e2b`
3. Run headless test: `npm run headless:test:ollama`
4. Verify console output shows successful generation

### Expected Output
```
[OllamaAdapter] Connecting to http://localhost:11434...
[OllamaAdapter] Generate: "Hello, world!" → "Hello! How can I help you today?"
[OllamaAdapter] Stream: "Tell me a joke" → [chunks received] → PASS
```

## Success Metrics

- Adapter successfully connects to Ollama
- Streaming responses are properly decoded
- Error states are handled gracefully (no uncaught exceptions)
- Cancellation works (AbortController)
- Headless test passes

## Notes

- If Ollama is not installed, gracefully skip tests with warning message
- Use `fetch` API (available in Node 18+)
- Keep adapter provider-agnostic (future: OpenAI, Claude adapters will follow same interface)
