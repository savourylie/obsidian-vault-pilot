# Ticket 15: Align Chat Messages Left and Right in Discover Panel

**Phase:** 5 - UI Improvements
**Status:** To Do
**Dependencies:** None

## Description

Improve chat message layout by aligning user messages to the left and assistant messages to the right, similar to modern chat applications. This creates a clear visual distinction between the two participants and improves conversation readability.

## Acceptance Criteria

1. User messages align to the left side of the chat container
2. Assistant messages align to the right side of the chat container
3. Messages have a maximum width of 85% to prevent full-width spanning
4. Clear visual separation between user and assistant messages
5. Role labels ("You", "Assistant") remain visible
6. Layout is responsive and works on different screen sizes
7. No visual glitches or overflow issues

## Implementation Details

### File: `styles.css`

**Current code (lines 297-299):**
```css
.vp-chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

**New code:**
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

### Visual Layout

**Before (current):**
```
┌─────────────────────────────────────┐
│ You: What is this?                  │
│                                     │
│ Assistant: This is a document...    │
│                                     │
│ You: Can you explain more?          │
└─────────────────────────────────────┘
```

**After (improved):**
```
┌─────────────────────────────────────┐
│ You: What is this?                  │
│         ┌───────────────────────────┤
│         │ Assistant: This is a...   │
│         └───────────────────────────┤
│ You: Can you explain more?          │
└─────────────────────────────────────┘
```

### Parent Container Requirement

The parent `.vp-chat-messages` must be a flex container (already is):
```css
.vp-chat-messages {
  display: flex;         /* Already set */
  flex-direction: column; /* Already set */
  /* ... */
}
```

## Tasks

- [ ] Update `.vp-chat-message` in `styles.css`:
  - Add `max-width: 85%;`
- [ ] Add `.vp-chat-message--user` in `styles.css`:
  - Add `align-self: flex-start;`
- [ ] Add `.vp-chat-message--assistant` in `styles.css`:
  - Add `align-self: flex-end;`
- [ ] Test layout:
  - Verify user messages align left
  - Verify assistant messages align right
  - Check different message lengths
  - Test on different screen widths
- [ ] Visual QA:
  - Check role labels still visible
  - Verify message bubbles don't overlap
  - Ensure scrolling works correctly

## Testing

### Manual Test
1. Open Discover Panel with existing chat
2. Verify user messages are on the left
3. Verify assistant messages are on the right
4. Send a new message:
   - User message appears on left
   - Assistant response appears on right
5. Test with different message types:
   - Short messages (1-2 words)
   - Medium messages (1-2 sentences)
   - Long messages (multiple paragraphs)
   - Messages with code blocks
   - Messages with lists

### Visual Test
- Messages don't touch the container edges
- 85% max-width provides comfortable reading
- Gap between messages is appropriate
- Role labels are readable
- Alignment is consistent across messages

### Edge Cases
- Very long words (URLs, code) → should wrap or truncate
- Empty messages → should still align correctly
- First message in chat
- Last message in chat
- Single-word messages
- Multi-paragraph messages

### Screen Size Test
Test on different Discover Panel widths:
- Narrow (~300px)
- Medium (~400px)
- Wide (~600px)

## Success Metrics

- Chat conversation is easier to follow
- Visual distinction between user/assistant is clear
- Layout matches modern chat UX patterns
- No horizontal scrolling or overflow
- Message bubbles are well-proportioned

## Notes

- The 85% max-width creates visual breathing room
- Left/right alignment is standard in chat apps (iMessage, WhatsApp, etc.)
- Role labels ("You", "Assistant") remain at top of each message
- Message background colors already distinguish user vs assistant
- This change makes the chat feel more conversational
- Works well with existing message styling (borders, backgrounds)

## Future Considerations

- Add slight inward padding to prevent edge touching
- Consider different max-width percentages (80%, 90%)
- Add subtle shadows or borders to enhance depth
- Experiment with different alignment styles (centered for system messages)
