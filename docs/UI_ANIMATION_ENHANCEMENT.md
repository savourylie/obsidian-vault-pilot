# VaultPilot UI Animation Enhancement

This document describes the animation enhancements implemented in VaultPilot's Discover Panel using Anime.js.

## Overview

VaultPilot now features subtle, professional animations that enhance the user experience without overwhelming the interface. All animations are optimized for desktop users and respect accessibility preferences.

## Animation Library

**Library**: [Anime.js](https://animejs.com/) v3.2.2
- **Bundle Size**: ~6 KB gzipped
- **Type**: Lightweight JavaScript animation engine
- **Benefits**: Timeline-based animations, stagger effects, excellent easing functions

## Implemented Animations

### 1. Chat Message Animations

#### Entry Animations
- **User Messages**: Slide in from left with fade (20px translateX)
- **Assistant Messages**: Slide in from right with fade (20px translateX)
- **Duration**: 400ms
- **Easing**: `easeOutCubic`

**Code Reference**: `src/ui/DiscoverView.ts:268` (`addMessageToUI` method)

#### Typing Indicator
- **Display**: Animated three-dot indicator while assistant is typing
- **Animation**: Pulsing dots with staggered scaling (0.8 → 1.0)
- **Duration**: 600ms loop
- **Stagger Delay**: 150ms between dots
- **Easing**: `easeInOutQuad`

**Code Reference**:
- Show: `src/ui/DiscoverView.ts:308` (`showTypingIndicator`)
- Hide: `src/ui/DiscoverView.ts:351` (`hideTypingIndicator`)

#### Smooth Scrolling
- **Behavior**: Smooth animated scroll to bottom on new messages
- **Duration**: 300ms
- **Easing**: `easeOutQuad`

**Code Reference**: `src/ui/DiscoverView.ts:297` (`smoothScrollToBottom`)

### 2. Search Results Animations

#### Staggered Entry
- **Animation**: Fade in + slide up (10px translateY)
- **Duration**: 350ms per item
- **Stagger Delay**: 60ms between items
- **Easing**: `easeOutCubic`

**Code Reference**: `src/ui/DiscoverView.ts:164` (`renderResults` method)

### 3. Session Dropdown Animations

#### Dropdown Entry
- **Animation**: Fade in + slide down (8px translateY)
- **Duration**: 250ms
- **Easing**: `easeOutQuad`

#### Session Items
- **Animation**: Fade in + slide right (5px translateX)
- **Duration**: 200ms per item
- **Stagger Delay**: 30ms between items
- **Start Delay**: 100ms after dropdown appears
- **Easing**: `easeOutQuad`

#### Dropdown Exit
- **Animation**: Fade out + slide up (8px translateY)
- **Duration**: 200ms
- **Easing**: `easeOutQuad`

**Code Reference**: `src/ui/DiscoverView.ts:398` (`toggleSessionDropdown` method)

### 4. Button & Interactive Micro-animations

#### Icon Buttons
- **Hover**: Scale to 1.1
- **Active**: Scale to 0.95
- **Duration**: 150ms
- **Easing**: CSS ease

**Code Reference**: `styles.css:408` (`.vp-icon-btn`)

#### Primary Buttons
- **Active**: Scale to 0.98
- **Hover**: Subtle shadow (0 2px 8px rgba(0,0,0,0.15))
- **Duration**: 150ms
- **Easing**: CSS ease

**Code Reference**: `styles.css:48` (`.vp-btn`)

## Performance Optimizations

### Will-change Property
Elements that are frequently animated have the `will-change` CSS property set to optimize rendering:

```css
.vp-chat-message,
.vp-result,
.vp-session-dropdown,
.vp-session-item {
	will-change: transform, opacity;
}
```

**Code Reference**: `styles.css:286`

### Animation Lifecycle
- Animations only trigger on new content (not on initial load of history)
- Proper cleanup in animation callbacks
- No orphaned animation instances

## Accessibility

### Reduced Motion Support

All animations respect the `prefers-reduced-motion` media query. When a user has reduced motion enabled:

- All transitions are disabled
- All animations are disabled
- `will-change` is reset to `auto`
- Elements appear instantly without animation

**Code Reference**: `styles.css:498`

```css
@media (prefers-reduced-motion: reduce) {
	/* All animations disabled */
}
```

## Customization Parameters

### Animation Timing Reference

| Element | Duration | Easing | Delay |
|---------|----------|--------|-------|
| Chat messages | 400ms | easeOutCubic | 0ms |
| Typing dots | 600ms | easeInOutQuad | 150ms stagger |
| Search results | 350ms | easeOutCubic | 60ms stagger |
| Dropdown | 250ms | easeOutQuad | 0ms |
| Dropdown items | 200ms | easeOutQuad | 30ms stagger, 100ms start |
| Scroll | 300ms | easeOutQuad | 0ms |
| Buttons | 150ms | CSS ease | 0ms |

### Modifying Animations

To adjust animation parameters, locate the relevant method in `src/ui/DiscoverView.ts` and modify the `anime()` call:

```typescript
anime({
	targets: element,
	opacity: [0, 1],
	duration: 400,        // Change duration
	easing: 'easeOutCubic', // Change easing
	delay: 0             // Add delay
});
```

### Available Easing Functions

Anime.js provides numerous easing functions:
- **Linear**: `linear`
- **Cubic**: `easeInCubic`, `easeOutCubic`, `easeInOutCubic`
- **Quad**: `easeInQuad`, `easeOutQuad`, `easeInOutQuad`
- **Elastic**: `easeInElastic`, `easeOutElastic`, `easeInOutElastic`
- **Spring**: Built-in spring physics
- And many more...

[Full easing reference](https://animejs.com/documentation/#pennerFunctions)

## Design Principles

1. **Subtle, Not Distracting**: Animations enhance, not dominate
2. **Professional Timing**: 200-400ms for most animations (feels responsive)
3. **Consistent Direction**: Related elements move in logical directions
4. **Performance First**: Hardware-accelerated properties (transform, opacity)
5. **Accessibility**: Respects user preferences for reduced motion

## Testing Animations

### Manual Testing
```bash
npm run dev
```

Then in Obsidian:
1. Open the Discover Panel
2. Send chat messages to see message animations
3. Open notes to trigger search results animations
4. Toggle session dropdown to see dropdown animations
5. Test with reduced motion preference enabled in OS settings

### Performance Testing
- Monitor FPS during animations using browser DevTools
- Check for janky animations (should be 60fps)
- Verify smooth scrolling behavior with long chat histories

## Future Enhancements

### Potential Additions
- Loading skeleton screens with shimmer effect
- Micro-interactions for result item hover
- Confetti or celebration animation for special events
- Custom transition between sessions
- Parallax effects for depth (low priority)

### Performance Considerations
- Keep bundle size impact minimal
- Avoid animating layout-triggering properties (width, height, margin, padding)
- Use `transform` and `opacity` exclusively when possible
- Consider debouncing rapid animations

## Troubleshooting

### Animations Not Working
1. Check browser console for errors
2. Verify Anime.js is properly bundled: `npm install`
3. Ensure no CSS conflicts with `!important` overrides
4. Check if reduced-motion is enabled

### Performance Issues
1. Reduce animation durations
2. Simplify stagger effects
3. Limit number of simultaneously animated elements
4. Check for memory leaks in animation callbacks

### TypeScript Errors
If you encounter type errors with Anime.js:
```bash
npm install --save-dev @types/animejs
```

## References

- [Anime.js Documentation](https://animejs.com/documentation/)
- [VaultPilot PRD](./PRD_Serendipity_Obsidian.md)
- [VaultPilot Architecture](./ARCHITECTURE_AND_DATA_FLOW.md)
- [Web Animations Best Practices](https://web.dev/animations/)
- [Reduced Motion Accessibility](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-05
**Author**: VaultPilot Development Team
