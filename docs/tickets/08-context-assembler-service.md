# Ticket 8: Context Assembler Service

**Phase:** 4 - Inline Edit (⌘-⌥-K) with Ollama
**Status:** Done
**Dependencies:** Ticket #2 (RetrievalService)

## Description

Create a service that assembles context for LLM prompts by combining user selections with relevant vault snippets retrieved via `RetrievalService`. This ensures AI suggestions are grounded in the user's existing notes.

## Acceptance Criteria

1. `ContextAssembler` class created in `src/services/ContextAssembler.ts`.
2. Constructor accepts `App`, `RetrievalService`, and optional config (max snippets, max tokens).
3. Method `assembleContext(selection: string, file: TFile, instruction: string): string` returns formatted prompt.
4. Retrieves top-k relevant snippets (default: 3-5) from vault using `RetrievalService.search()`.
5. Prompt format includes:
   - System instruction (role definition)
   - User's current file context (title + path)
   - Retrieved snippets with source citations
   - User's selection
   - User's instruction
6. Excludes current file from retrieval results (avoid redundancy).
7. Configurable snippet count and max total prompt length.
8. Handles edge cases:
   - No retrieval results found (graceful degradation)
   - Selection is empty (warning or skip)
   - Very long selections (truncate with ellipsis)

## Implementation Details

### Prompt Template
```
You are an AI writing assistant for Obsidian. Your task is to help the user edit their note.

Current note: [[{file.basename}]]
Path: {file.path}

Relevant context from vault:
---
Source: [[{result1.title}]]
{result1.snippet}
---
Source: [[{result2.title}]]
{result2.snippet}
---

User's selection:
"""
{selection}
"""

Instruction: {instruction}

Provide your response as a direct replacement for the user's selection. Do not include explanations or preamble.
```

### Interface
```typescript
export interface ContextConfig {
	maxSnippets?: number;
	maxPromptLength?: number;
}

export class ContextAssembler {
	constructor(
		private app: App,
		private retrieval: RetrievalService,
		private config?: ContextConfig
	) {}

	assembleContext(
		selection: string,
		file: TFile,
		instruction: string
	): string
}
```

## Tasks

- [ ] Create `src/services/ContextAssembler.ts` with class skeleton.
- [ ] Implement `assembleContext()` method.
- [ ] Use `RetrievalService.search(selection, { limit: maxSnippets })`.
- [ ] Filter out current file from results.
- [ ] Format prompt with template (use template literals).
- [ ] Add truncation logic for very long selections (max ~2000 chars).
- [ ] Handle empty retrieval results gracefully.
- [ ] Add unit test in `scripts/context-assembler-test.js`:
  - Mock retrieval results
  - Verify prompt format
  - Test edge cases (empty results, long selection)

## Testing

### Headless Test
```javascript
// scripts/context-assembler-test.js
const assembler = new ContextAssembler(mockApp, mockRetrieval);
const prompt = assembler.assembleContext(
	"This is my selected text.",
	mockFile,
	"Rewrite this to be more concise."
);
assert(prompt.includes("This is my selected text"));
assert(prompt.includes("Rewrite this to be more concise"));
console.log("PASS: ContextAssembler");
```

### Manual Test
1. Run headless test: `npm run headless:test:context`
2. Verify prompt includes:
   - Current file title
   - Retrieved snippets with sources
   - User selection
   - Instruction

## Success Metrics

- Prompt is well-formatted and readable
- Retrieval snippets are properly cited
- Edge cases handled (no crashes)
- Headless test passes

## Notes

- Keep prompt concise to minimize token usage
- Future: support custom prompt templates in settings
- Consider adding a "context preview" in the modal UI (Ticket #9)
