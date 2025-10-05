# Ticket 12: Simplify BM25 Result Items in Discover Panel

**Phase:** 5 - UI Improvements
**Status:** Done
**Dependencies:** None

## Description

Simplify the BM25 search result items in the Discover Panel by removing the action buttons (Open, Insert Link, Quote) and making the entire result item clickable to open the document. This reduces visual clutter and makes the UI cleaner.

## Acceptance Criteria

1. Result items display only title and snippet (no buttons)
2. Clicking anywhere on a result item opens that document
3. Result items show hover state to indicate they are clickable
4. Visual feedback (cursor pointer) when hovering over items
5. Opening documents works the same as before (opens in new leaf)

## Implementation Details

### File: `src/ui/DiscoverView.ts`

**Current code (lines 168-187):**
```typescript
private renderResults(results: Array<{ path: string; title: string; snippet: string; file: any }>) {
  if (!this.resultsEl) return;
  this.resultsEl.empty();
  if (results.length === 0) {
    this.renderEmpty('No related notes.');
    return;
  }
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

**New code:**
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

### File: `styles.css`

**Add new styles:**
```css
.vp-result--clickable {
  cursor: pointer;
  transition: background 0.1s ease;
}

.vp-result--clickable:hover {
  background: var(--background-modifier-hover);
}
```

## Tasks

- [ ] Update `renderResults()` method in `src/ui/DiscoverView.ts`:
  - Remove button creation code (lines 179-185)
  - Add `vp-result--clickable` class to row element
  - Add click handler to row for opening file
- [ ] Add hover styles to `styles.css`:
  - Add `.vp-result--clickable` cursor and transition
  - Add `.vp-result--clickable:hover` background
- [ ] Remove unused methods (optional cleanup):
  - Consider removing `insertLink()` method (lines 196-201) if no longer used elsewhere
- [ ] Test functionality:
  - Click on result item opens document
  - Hover shows visual feedback
  - No console errors

## Testing

### Manual Test
1. Open Obsidian with the plugin enabled
2. Open any note to trigger BM25 search
3. Verify Discover Panel shows related results
4. Hover over a result item → verify hover state appears
5. Click on result item → verify document opens in new leaf
6. Try with multiple results → all should be clickable
7. Test with no results → verify empty state still works

### Edge Cases
- Click on title vs snippet → both should work
- Rapid clicking → should not cause issues
- Very long titles/snippets → should not break layout

## Success Metrics

- Result items are more compact (no button rows)
- Click-to-open works reliably
- Hover feedback is clear and responsive
- No visual glitches or layout issues
- Performance is the same or better (fewer DOM elements)

## Notes

- The "Insert Link" and "Quote" features are removed
  - Can be re-added via context menu in future if needed
  - Most users will want to open the document anyway
- Opening documents uses the same `openFile()` method as before
- This change makes the UI more similar to typical file explorers
