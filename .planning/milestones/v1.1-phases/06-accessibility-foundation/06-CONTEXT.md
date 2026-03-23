# Phase 6: Accessibility Foundation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

All 58 Rialto component directories meet WCAG AA — axe-core passes in CI, keyboard navigation works, focus management is correct, contrast ratios verified at token level, and screen readers receive appropriate announcements.

</domain>

<decisions>
## Implementation Decisions

### Contrast fix strategy
- Adjust global token hex values in colors.css when pairs fail WCAG AA — no per-component overrides
- Both light and dark themes get audited and fixed together
- Minimal visual drift — darken/lighten within the same warm hue family, warmth is non-negotiable
- Dark theme rgba opacity values may need bumping (e.g., text-secondary at 0.6 opacity)

### Gold accent handling
- Claude's Discretion: decide whether to darken the gold token or restrict gold to fills-only based on contrast math (CLAUDE.md already says "Never use gold for text color except on gold-filled buttons")

### Screen reader announcements
- Toast: `aria-live="polite"` for info/success, `aria-live="assertive"` for error/warning
- Alert: only dynamic alerts (appearing after user action) get `aria-live`; static/on-load alerts are found naturally by screen readers
- Form validation errors: announced on submit only, not on blur during typing
- Loading states (Spinner, Progress): announce "Loading..." on start and "Content loaded" on completion via `aria-live="polite"`. Skeleton components don't announce (visual-only).

### Focus indicators
- Every interactive element gets the identical gold glow ring (`--rialto-shadow-focus`)
- Use `:focus-visible` only (keyboard navigation), not `:focus` (no ring on mouse clicks)
- Focus trapped inside modal overlays (Dialog, Drawer, CommandPalette) — Tab wraps within
- All overlay components (Dialog, Drawer, ConfirmDialog, DropdownMenu, CommandPalette, Popover, ContextMenu) return focus to trigger element on close

### Axe test coverage
- All 18 missing components get individual `it()` blocks in `accessibility.test.tsx` — same pattern as existing tests
- Portal-based components (CommandPalette, DropdownMenu, Popover, Tooltip, Drawer, ContextMenu, HoverCard, ConfirmDialog, Autocomplete): render in open state, scan `document.body` to catch portal content
- Non-portal components: keep scanning `container` as before
- Known jsdom limitations (e.g., color-contrast can't resolve CSS vars): disable the specific axe rule with a comment explaining why; the programmatic token-contrast test covers contrast separately

### Claude's Discretion
- Exact token value adjustments for contrast (within minimal-shift constraint)
- Focus trap implementation approach
- Loading state announcement mechanism (aria-live region placement)
- Order of component fixes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `accessibility.test.tsx`: 39 components already tested with axe-core — extend with 18 more
- `vitest-axe` package + type definitions already configured in `src/test/`
- `colors.css`: All token hex values for light/dark in one file — single source for contrast test
- `colors.json`: JSON export of token values (may simplify programmatic contrast testing)
- `--rialto-shadow-focus`: Gold glow ring token already defined in `shadows.css`

### Established Patterns
- CSS Modules (`.module.css`) for all component styling — focus-visible styles go here
- `React.forwardRef` on all components — ref forwarding available for focus management
- Framer Motion for animations — can use for focus trap and overlay transitions
- Toast already has `aria-live="polite"` and `role="region"` — extend pattern to other dynamic components

### Integration Points
- Hospitality app uses Dialog for "Add Reservation" and "Walk-in" flows — smoke-test focus return there
- `RialtoProvider` wraps all apps — could host global aria-live announcement region if needed
- `components.test.tsx` and `interactions.test.tsx` exist alongside `accessibility.test.tsx`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions captured above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-accessibility-foundation*
*Context gathered: 2026-03-22*
