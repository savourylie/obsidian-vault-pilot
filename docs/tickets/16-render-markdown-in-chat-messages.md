# Ticket 16: Render Markdown in Chat Messages

**Phase:** 5 - UI Improvements
**Status:** To Do
**Dependencies:** None

## Description

Render markdown content in chat messages using Obsidian's built-in `MarkdownRenderer`, enabling rich formatting like links, code blocks, lists, bold/italic text, and more. This makes the chat experience match Obsidian's native document rendering.

## Acceptance Criteria

1. Markdown content renders correctly in chat messages
2. Links are clickable (internal `[[wikilinks]]` and external URLs)
3. Code blocks have syntax highlighting
4. Lists (ordered/unordered) display properly
5. Bold, italic, strikethrough render correctly
6. Headings render with appropriate styling
7. Blockquotes and callouts render correctly
8. Streaming messages update with rendered markdown in real-time
9. No performance issues or lag during rendering
10. Historical messages (loaded from session) render markdown correctly

## Implementation Details

### File: `src/ui/DiscoverView.ts`

**Import MarkdownRenderer (line 1):**
```typescript
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, App, setIcon, MarkdownRenderer } from 'obsidian';
```

**Current `addMessageToUI()` method (lines 277-291):**
```typescript
private addMessageToUI(role: 'user' | 'assistant', content: string): HTMLElement {
  if (!this.chatMessagesEl) return document.createElement('div');

  const msgEl = this.chatMessagesEl.createEl('div', { cls: `vp-chat-message vp-chat-message--${role}` });
  const roleLabel = msgEl.createEl('div', { cls: 'vp-chat-message-role' });
  roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';

  const contentEl = msgEl.createEl('div', { cls: 'vp-chat-message-content' });
  contentEl.textContent = content;  // Plain text only

  // Auto-scroll to bottom
  this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;

  return msgEl;
}
```

**New `addMessageToUI()` method:**
```typescript
private addMessageToUI(role: 'user' | 'assistant', content: string): HTMLElement {
  if (!this.chatMessagesEl) return document.createElement('div');

  const msgEl = this.chatMessagesEl.createEl('div', { cls: `vp-chat-message vp-chat-message--${role}` });
  const roleLabel = msgEl.createEl('div', { cls: 'vp-chat-message-role' });
  roleLabel.textContent = role === 'user' ? 'You' : 'Assistant';

  const contentEl = msgEl.createEl('div', { cls: 'vp-chat-message-content' });

  // Render markdown using Obsidian's built-in renderer
  MarkdownRenderer.renderMarkdown(
    content,
    contentEl,
    '', // source path (empty for chat messages)
    this  // component for lifecycle management
  );

  // Auto-scroll to bottom
  this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;

  return msgEl;
}
```

**Current `sendMessage()` streaming (lines 240-275):**
```typescript
try {
  // Stream response
  await this.chatService.sendMessage(message, context, (chunk: string) => {
    if (assistantContent) {
      assistantContent.textContent += chunk;  // Plain text concatenation
      // Auto-scroll to bottom
      if (this.chatMessagesEl) {
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
      }
    }
  });
  // ...
}
```

**New `sendMessage()` streaming:**
```typescript
try {
  let accumulatedContent = '';

  // Stream response
  await this.chatService.sendMessage(message, context, (chunk: string) => {
    if (assistantContent) {
      accumulatedContent += chunk;

      // Clear and re-render markdown on each chunk
      assistantContent.empty();
      MarkdownRenderer.renderMarkdown(
        accumulatedContent,
        assistantContent,
        '',
        this
      );

      // Auto-scroll to bottom
      if (this.chatMessagesEl) {
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
      }
    }
  });

  // Save session after message is complete
  if (this.onSessionSave) {
    await this.onSessionSave();
  }
} catch (err) {
  // ... error handling
}
```

### Key Changes

1. **Import `MarkdownRenderer`** from Obsidian API
2. **Replace `textContent` with `MarkdownRenderer.renderMarkdown()`** in `addMessageToUI()`
3. **Accumulate chunks** in `sendMessage()` and re-render markdown on each chunk
4. **Use `contentEl.empty()`** before re-rendering to clear previous render
5. **Pass `this` as component** for proper lifecycle management

### Performance Considerations

- Re-rendering on every chunk may cause slight performance overhead
- For optimization, consider:
  - Debouncing re-renders (e.g., max 10 renders/sec)
  - Only render markdown on complete words/sentences
  - Render plain text while streaming, then render markdown on completion

**Simple optimization:**
```typescript
let renderTimeout: number | null = null;

await this.chatService.sendMessage(message, context, (chunk: string) => {
  if (assistantContent) {
    accumulatedContent += chunk;

    // Debounce rendering to every 100ms
    if (renderTimeout) window.clearTimeout(renderTimeout);
    renderTimeout = window.setTimeout(() => {
      assistantContent.empty();
      MarkdownRenderer.renderMarkdown(accumulatedContent, assistantContent, '', this);
      if (this.chatMessagesEl) {
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
      }
    }, 100);
  }
});

// Final render (ensure last chunk is rendered)
if (renderTimeout) window.clearTimeout(renderTimeout);
assistantContent.empty();
MarkdownRenderer.renderMarkdown(accumulatedContent, assistantContent, '', this);
```

## Tasks

- [ ] Import `MarkdownRenderer` from Obsidian API
- [ ] Update `addMessageToUI()` method:
  - Replace `contentEl.textContent = content;` with `MarkdownRenderer.renderMarkdown()`
  - Pass correct parameters (content, container, sourcePath, component)
- [ ] Update `sendMessage()` method:
  - Add `accumulatedContent` variable
  - Accumulate chunks
  - Clear and re-render markdown on each chunk
  - Add debouncing if performance is an issue
- [ ] Test markdown rendering:
  - Links (`[[wikilinks]]`, `[text](url)`)
  - Code blocks (` ```js `)
  - Inline code (`` `code` ``)
  - Lists (ordered, unordered)
  - Bold (`**bold**`), italic (`*italic*`)
  - Headings (`# H1`, `## H2`)
  - Blockquotes (`> quote`)
- [ ] Test streaming:
  - Markdown renders during streaming
  - No visual glitches or flashing
  - Smooth scrolling
- [ ] Test session loading:
  - Historical messages render markdown
  - Switching sessions preserves markdown rendering

## Testing

### Manual Test - Markdown Features

1. **Links**
   - User: "Check out [[My Note]]"
   - Verify wikilink is clickable and styled
   - User: "See https://example.com"
   - Verify external link is clickable

2. **Code Blocks**
   - User: "Show me this code: ```js\nconst x = 1;\n```"
   - Verify syntax highlighting appears

3. **Inline Code**
   - User: "Use the `console.log()` function"
   - Verify inline code styling

4. **Formatting**
   - User: "This is **bold** and *italic* and ~~strikethrough~~"
   - Verify all formatting renders

5. **Lists**
   - User: "Here's a list:\n- Item 1\n- Item 2"
   - Verify list renders properly

6. **Headings**
   - User: "# Main Topic\n## Subtopic"
   - Verify heading styling

### Manual Test - Streaming

1. Ask LLM to generate markdown:
   - "Write a code example in JavaScript"
   - "Create a list of 5 items"
   - "Explain with a link to documentation"
2. Verify markdown renders as response streams
3. Check for visual glitches (flashing, jumping)
4. Verify scrolling works smoothly

### Manual Test - Session Persistence

1. Create chat with markdown messages
2. Switch to new session
3. Switch back to original session
4. Verify markdown still renders correctly

### Edge Cases

- Empty messages
- Very long code blocks
- Nested markdown (lists in blockquotes)
- Invalid markdown (malformed syntax)
- Messages with only whitespace
- Messages with special characters

### Performance Test

1. Send 20+ messages with markdown
2. Check for lag or freezing
3. Monitor console for errors
4. Test on slower machines if possible

## Success Metrics

- All markdown features render correctly
- Links are clickable and functional
- Code has syntax highlighting
- Streaming feels smooth (no lag)
- No visual glitches or flashing
- Session switching preserves rendering
- Performance is acceptable

## Notes

- `MarkdownRenderer` is Obsidian's built-in renderer
- It handles all markdown features automatically
- Links to internal notes will work (open in Obsidian)
- External links open in browser
- Syntax highlighting uses Obsidian's theme
- Component lifecycle (`this`) ensures proper cleanup
- Debouncing may be needed for very fast streaming

## Future Considerations

- Add copy button to code blocks
- Support for custom callouts in chat
- Syntax highlighting for more languages
- Render LaTeX math equations
- Support for embedded images (if LLM can generate image URLs)
- Add message actions (copy, edit, regenerate)
