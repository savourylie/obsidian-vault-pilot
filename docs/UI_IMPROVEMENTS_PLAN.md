# UI Improvements Plan for Discover Panel

## Overview

This document outlines the planned improvements to the Discover Panel UI for better user experience and cleaner interface design.

## Improvements Summary

1. **Simplify BM25 result items** - Remove action buttons, make entire item clickable
2. **Open document on click** - Click anywhere on result item to open that document
3. **Increase chat height** - Make chatbox taller to show more message history
4. **Align messages left/right** - User messages left, assistant messages right
5. **Render markdown in messages** - Display rich formatted content like Obsidian docs
6. **Remove status text** - Clean up header by removing "Synthesis will appear here..."
7. **Remove Refresh button** - Auto-refresh via file events is sufficient

---

## 1. Simplify BM25 Result Items

### Location: `src/ui/DiscoverView.ts`

**Current Implementation (lines 168-187):**
```typescript
private renderResults(results: Array<{ path: string; title: string; snippet: string; file: any }>) {
  // ...
  for (const r of results) {
    const row = this.resultsEl.createEl('div', { cls: 'vp-result' });
    row.createEl('div', { cls: 'vp-title', text: r.title });
    row.createEl('div', { cls: 'vp-snippet', text: r.snippet });
    const btns = row.createEl('div', { cls: 'vp-actions' });
    const openBtn = btns.createEl('button', { cls: 'vp-btn vp-btn--primary', text: 'Open' });
    openBtn.addEventListener('click', () => this.openFile(r.path));
    const linkBtn = btns.createEl('button', { cls: 'vp-btn', text: 'Insert Link' });
    linkBtn.addEventListener('click', () => this.insertLink(r.path));
    const quoteBtn = btns.createEl('button', { cls: 'vp-btn', text: 'Quote' });
    quoteBtn.addEventListener('click', () => console.log('Quote placeholder for', r.path));
  }
}
```

**Proposed Changes:**
- Remove all button creation code (lines 179-185)
- Add click handler directly to row element
- Add CSS class for clickable styling

**New Implementation:**
```typescript
private renderResults(results: Array<{ path: string; title: string; snippet: string; file: any }>) {
  if (!this.resultsEl) return;
  this.resultsEl.empty();
  if (results.length === 0) {
    this.renderEmpty('No related notes.');
    return;
  }
  for (const r of results) {
    const row = this.resultsEl.createEl('div', { cls: 'vp-result vp-result--clickable' });
    row.addEventListener('click', () => this.openFile(r.path));
    row.createEl('div', { cls: 'vp-title', text: r.title });
    row.createEl('div', { cls: 'vp-snippet', text: r.snippet });
  }
}
```

---

## 2. Remove Status Text & Refresh Button

### Location: `src/ui/DiscoverView.ts`

**Current Implementation (lines 56-104):**
```typescript
async onOpen() {
  // ...
  this.statusEl = header.createEl('div', { cls: 'vp-status', text: 'Synthesis will appear here...' });

  const actions = container.createEl('div', { cls: 'vp-actions' });
  const refreshBtn = actions.createEl('button', { cls: 'vp-btn', text: 'Refresh' });
  refreshBtn.addEventListener('click', () => this.queueSearch());
  // ...
}
```

**Proposed Changes:**
- Remove line 83: Status text creation
- Remove lines 85-87: Actions div and refresh button
- Remove `private statusEl: HTMLElement | null = null;` field declaration

**Rationale:**
- Status text provides no useful information
- Auto-refresh via vault events makes manual refresh button redundant

---

## 3. Increase Chat Height

### Location: `styles.css`

**Current Implementation:**
```css
.vp-chat-container {
  /* ... */
  max-height: 400px;
  min-height: 200px;
}

.vp-chat-messages {
  /* ... */
  min-height: 100px;
  max-height: 250px;
}
```

**Proposed Changes:**
```css
.vp-chat-container {
  /* ... */
  max-height: 600px;  /* +200px */
  min-height: 250px;  /* +50px */
}

.vp-chat-messages {
  /* ... */
  min-height: 150px;  /* +50px */
  max-height: 450px;  /* +200px */
}
```

**Rationale:** More vertical space for chat history improves conversation review.

---

## 4. Align Messages Left/Right

### Location: `styles.css`

**Current Implementation (lines 297-299):**
```css
.vp-chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

**Proposed Changes:**
```css
.vp-chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;  /* Prevent messages from spanning full width */
}

.vp-chat-message--user {
  align-self: flex-start;  /* Align user messages to the left */
}

.vp-chat-message--assistant {
  align-self: flex-end;  /* Align assistant messages to the right */
}
```

**Visual Result:**
```
┌─────────────────────────────────┐
│ You: What is this?              │  ← Left aligned
│                                 │
│        Assistant: This is...    │  ← Right aligned
└─────────────────────────────────┘
```

---

## 5. Render Markdown in Messages

### Location: `src/ui/DiscoverView.ts`

**Import Addition (line 1):**
```typescript
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, App, setIcon, MarkdownRenderer } from 'obsidian';
```

**Current Implementation - `addMessageToUI()` (lines 277-291):**
```typescript
private addMessageToUI(role: 'user' | 'assistant', content: string): HTMLElement {
  // ...
  const contentEl = msgEl.createEl('div', { cls: 'vp-chat-message-content' });
  contentEl.textContent = content;  // Plain text only
  // ...
}
```

**Proposed Implementation:**
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

**Current Implementation - `sendMessage()` streaming (lines 255-263):**
```typescript
await this.chatService.sendMessage(message, context, (chunk: string) => {
  if (assistantContent) {
    assistantContent.textContent += chunk;  // Plain text concatenation
    // ...
  }
});
```

**Proposed Implementation:**
```typescript
let accumulatedContent = '';

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
```

**Benefits:**
- Links become clickable
- Code blocks get syntax highlighting
- Lists, headings, bold/italic render properly
- Matches Obsidian's native markdown experience

---

## 6. Add Result Item Hover Styles

### Location: `styles.css`

**New CSS to add:**
```css
.vp-result--clickable {
  cursor: pointer;
  transition: background 0.1s ease;
}

.vp-result--clickable:hover {
  background: var(--background-modifier-hover);
}
```

**Purpose:** Provides visual feedback that result items are interactive.

---

## Files Summary

### Files to Modify

1. **`src/ui/DiscoverView.ts`**
   - Line 1: Import `MarkdownRenderer`
   - Lines 9-22: Remove `statusEl` field declaration
   - Lines 56-104: Remove status text and refresh button from `onOpen()`
   - Lines 168-187: Simplify `renderResults()` - remove buttons, add click handler
   - Lines 277-291: Update `addMessageToUI()` to use `MarkdownRenderer`
   - Lines 240-275: Update `sendMessage()` to render markdown during streaming

2. **`styles.css`**
   - Lines 267-275: Increase `.vp-chat-container` heights
   - Lines 284-295: Increase `.vp-chat-messages` heights
   - Lines 297-299: Add left/right alignment to `.vp-chat-message`
   - Add new styles for `.vp-result--clickable` hover effects

### Optional Removals

- `insertLink()` method (lines 196-201) - no longer used after removing buttons
- `quoteBtn` placeholder logic - was never implemented

---

## Expected User Experience

**Before:**
- Result items have 3 buttons taking up vertical space
- Status text shows unhelpful placeholder
- Manual refresh button needed
- Chat messages span full width
- Plain text only in chat (no formatting)

**After:**
- Clean, compact result items (title + snippet only)
- Click anywhere on result to open document
- No unnecessary UI chrome (status, buttons)
- Taller chat shows more conversation history
- Messages aligned like modern chat apps (user left, assistant right)
- Rich markdown rendering (links, code, formatting)

---

## Migration Notes

- **No breaking changes** - all existing functionality preserved
- **Removed features:** Insert Link and Quote buttons from results
  - Can be added back via context menu if needed
- **Auto-refresh remains active** via vault file events
- **Session persistence unaffected**

---

## Testing Checklist

- [ ] Result items are clickable and open documents
- [ ] Result items show hover state
- [ ] Chat displays more messages (taller container)
- [ ] User messages align left
- [ ] Assistant messages align right
- [ ] Markdown renders correctly (links, code, formatting)
- [ ] Streaming messages update with formatted markdown
- [ ] Session switching preserves markdown rendering
- [ ] No TypeScript errors
- [ ] Build succeeds
