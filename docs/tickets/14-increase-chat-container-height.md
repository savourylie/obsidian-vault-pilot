# Ticket 14: Increase Chat Container Height in Discover Panel

**Phase:** 5 - UI Improvements
**Status:** Done
**Dependencies:** None

## Description

Increase the height of the chat container and messages area in the Discover Panel to show more conversation history. The current height is too restrictive, requiring frequent scrolling. This change improves the chat UX by displaying more messages at once.

## Acceptance Criteria

1. Chat container `max-height` increases from 400px to 600px
2. Chat container `min-height` increases from 200px to 250px
3. Chat messages area `max-height` increases from 250px to 450px
4. Chat messages area `min-height` increases from 100px to 150px
5. More messages visible without scrolling
6. Layout remains responsive and balanced
7. No overflow or visual glitches

## Implementation Details

### File: `styles.css`

**Current code (lines 267-275):**
```css
.vp-chat-container {
  border-top: 1px solid var(--background-modifier-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  min-height: 200px;
}
```

**New code:**
```css
.vp-chat-container {
  border-top: 1px solid var(--background-modifier-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 600px;  /* Increased from 400px */
  min-height: 250px;  /* Increased from 200px */
}
```

**Current code (lines 284-295):**
```css
.vp-chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
  background: var(--background-secondary);
  border-radius: 6px;
  min-height: 100px;
  max-height: 250px;
}
```

**New code:**
```css
.vp-chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
  background: var(--background-secondary);
  border-radius: 6px;
  min-height: 150px;  /* Increased from 100px */
  max-height: 450px;  /* Increased from 250px */
}
```

### Summary of Changes

| Element | Property | Old Value | New Value | Change |
|---------|----------|-----------|-----------|--------|
| `.vp-chat-container` | `max-height` | 400px | 600px | +200px |
| `.vp-chat-container` | `min-height` | 200px | 250px | +50px |
| `.vp-chat-messages` | `max-height` | 250px | 450px | +200px |
| `.vp-chat-messages` | `min-height` | 100px | 150px | +50px |

## Tasks

- [ ] Update `.vp-chat-container` in `styles.css`:
  - Change `max-height: 400px;` to `max-height: 600px;`
  - Change `min-height: 200px;` to `min-height: 250px;`
- [ ] Update `.vp-chat-messages` in `styles.css`:
  - Change `max-height: 250px;` to `max-height: 450px;`
  - Change `min-height: 100px;` to `min-height: 150px;`
- [ ] Test in Obsidian:
  - Verify more messages visible
  - Check scrolling behavior
  - Test on different screen sizes
  - Verify input area still accessible
- [ ] Visual QA:
  - Check balance with Discover results section
  - Ensure no overflow issues
  - Verify responsive behavior

## Testing

### Manual Test
1. Open Discover Panel with existing chat history
2. Verify more messages are visible without scrolling
3. Add new messages until scrolling is needed
4. Verify scroll works smoothly
5. Test on different Obsidian window sizes:
   - Small window (~800px height)
   - Medium window (~1080px height)
   - Large window (~1440px height)

### Visual Test
- Chat takes appropriate space in the panel
- Results section still visible above chat
- Balance between results and chat is good
- No awkward gaps or overflow

### Edge Cases
- Very long messages (multi-paragraph)
- Many short messages (20+ messages)
- Empty chat (no messages yet)
- Single message
- Resize Obsidian window while chat is open

## Success Metrics

- Users can see 50-100% more messages without scrolling
- Chat feels more spacious and readable
- Layout remains balanced and functional
- No visual regressions

## Notes

- The 200px increase allows viewing ~3-5 more messages on average
- Minimum height increase ensures consistent appearance
- Chat input area remains at bottom, unaffected
- Flexbox layout (`flex: 1`) handles dynamic sizing
- Users can still manually resize Discover Panel sidebar if needed
- Consider user feedback: if 600px is too tall, can adjust to 500px

## Future Considerations

- Allow user to customize chat height via settings
- Remember user's preferred panel width/height
- Add "Expand chat" button to temporarily maximize chat area
