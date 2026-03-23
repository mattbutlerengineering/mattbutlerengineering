# Phase 6: Accessibility Foundation - Research

**Researched:** 2026-03-22
**Domain:** WCAG AA compliance, axe-core testing, keyboard navigation, focus management, screen reader announcements
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Contrast fix strategy:**
- Adjust global token hex values in `colors.css` when pairs fail WCAG AA — no per-component overrides
- Both light and dark themes get audited and fixed together
- Minimal visual drift — darken/lighten within the same warm hue family, warmth is non-negotiable
- Dark theme rgba opacity values may need bumping (e.g., text-secondary at 0.6 opacity)

**Gold accent handling:**
- Claude's Discretion: decide whether to darken the gold token or restrict gold to fills-only based on contrast math (CLAUDE.md already says "Never use gold for text color except on gold-filled buttons")

**Screen reader announcements:**
- Toast: `aria-live="polite"` for info/success, `aria-live="assertive"` for error/warning
- Alert: only dynamic alerts (appearing after user action) get `aria-live`; static/on-load alerts are found naturally by screen readers
- Form validation errors: announced on submit only, not on blur during typing
- Loading states (Spinner, Progress): announce "Loading..." on start and "Content loaded" on completion via `aria-live="polite"`. Skeleton components don't announce (visual-only).

**Focus indicators:**
- Every interactive element gets the identical gold glow ring (`--rialto-shadow-focus`)
- Use `:focus-visible` only (keyboard navigation), not `:focus` (no ring on mouse clicks)
- Focus trapped inside modal overlays (Dialog, Drawer, CommandPalette) — Tab wraps within
- All overlay components (Dialog, Drawer, ConfirmDialog, DropdownMenu, CommandPalette, Popover, ContextMenu) return focus to trigger element on close

**Axe test coverage:**
- All 18 missing components get individual `it()` blocks in `accessibility.test.tsx` — same pattern as existing tests
- Portal-based components (CommandPalette, DropdownMenu, Popover, Tooltip, Drawer, ContextMenu, HoverCard, ConfirmDialog, Autocomplete): render in open state, scan `document.body` to catch portal content
- Non-portal components: keep scanning `container` as before
- Known jsdom limitations (e.g., color-contrast can't resolve CSS vars): disable the specific axe rule with a comment explaining why; the programmatic token-contrast test covers contrast separately

### Claude's Discretion
- Exact token value adjustments for contrast (within minimal-shift constraint)
- Focus trap implementation approach
- Loading state announcement mechanism (aria-live region placement)
- Order of component fixes

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| A11Y-01 | All components meet WCAG AA color contrast (4.5:1 text, 3:1 UI controls) via token-level audit | Contrast math computed below; 6 failing token pairs identified with fix guidance |
| A11Y-02 | All interactive components have visible `:focus-visible` keyboard focus indicators | `focusRing` class in `surfaces.module.css` already exists; pattern is `composes: focusRing` |
| A11Y-03 | All interactive components have correct ARIA roles, labels, and state attributes | Per-component audit needed; Dialog/CommandPalette already have role="dialog" + aria-modal |
| A11Y-04 | Every component has an axe-core assertion in Vitest CI (`toHaveNoViolations`) | 18 components missing; portal scan pattern documented below |
| A11Y-05 | Keyboard navigation follows logical DOM order with no keyboard traps | Focus trap exists in Dialog; Drawer missing trap; overlay close returns focus not yet implemented |
| A11Y-06 | Dynamic content changes use `aria-live` regions for screen reader announcements | Toast has `aria-live="polite"` + role="region"; Alert uses role="alert"/"status"; Spinner/Progress need live region |
| A11Y-07 | Every form input has an associated visible or screen-reader-accessible label | Input/TextArea/Checkbox/Toggle all have label props; InputGroup needs audit |
| A11Y-08 | Dialog, Drawer, and ConfirmDialog return focus to trigger element on close | Currently ABSENT in all three — must capture `document.activeElement` before open and restore on close |
| A11Y-10 | Contrast ratios verified and fixed at design token level, not per-component CSS | Token contrast test must read `colors.json`; 6 failing pairs need token value adjustments |
</phase_requirements>

---

## Summary

Phase 6 adds WCAG AA accessibility to the Rialto design system. The codebase has a strong existing foundation: 44 axe-core test cases already pass, a `focusRing` CSS class exists in `surfaces.module.css`, Dialog has a working focus trap, and Toast already has `aria-live`. The work is well-scoped incremental improvement, not a ground-up rewrite.

The highest-priority task is a programmatic token-contrast Vitest test that reads `colors.json` — this must be first because jsdom cannot resolve CSS custom properties for color-contrast checks, so axe alone cannot verify contrast compliance. Six token pairs fail WCAG AA in the current palette; fixes must stay within the warm hue family.

The 18 missing axe test cases split into two categories: portal-based overlays (9 components) that need `document.body` scanning when rendered open, and simple non-portal components (9 components) that follow the existing `container`-scan pattern. Focus-return-on-close is completely absent from all overlay components and must be implemented by capturing `document.activeElement` at open time and restoring it on close.

**Primary recommendation:** Wave 1 = token contrast test + contrast fixes. Wave 2 = 18 missing axe tests. Wave 3 = focus-return-on-close for overlays + loading state announcements. Wave 4 = focus-visible audit for any component missing the `focusRing` compose.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest-axe` | 0.1.0 | axe-core wrapper for Vitest `toHaveNoViolations` | Already in devDeps + configured in setup.ts |
| `axe-core` | 4.11.1 | WCAG rule engine | Industry standard automated a11y testing |
| `@testing-library/react` | 16.3.2 | Render components for axe scanning | Already used in existing tests |
| `vitest` | 4.0.18 | Test runner | Project standard |

### No new dependencies needed
All required libraries are already installed. This phase is pure implementation work on existing infrastructure.

---

## Architecture Patterns

### Pattern 1: Axe Test — Non-Portal Component
**What:** Render into `container`, scan `container`. Used for all components that don't use a portal.
**When to use:** Components that render inline (AppBar, AspectRatio, DisabledTooltip, Footer, Hero, InputGroup, PageHeader, ScrollArea, Skeleton).

```typescript
// Source: existing accessibility.test.tsx pattern
it("ComponentName", async () => {
  const { container } = render(<ComponentName prop="value" />);
  expect(await axe(container)).toHaveNoViolations();
});
```

### Pattern 2: Axe Test — Portal Component (open state)
**What:** Render in open state, scan `document.body`. Portal content is rendered outside `container` so `container` scan misses it.
**When to use:** CommandPalette, DropdownMenu, Popover, Tooltip, Drawer, ContextMenu, HoverCard, ConfirmDialog, Autocomplete.

```typescript
// Source: derived from existing Dialog test + CONTEXT.md decision
it("Drawer (open)", async () => {
  render(
    <Drawer open onClose={noop} title="Test Drawer">
      <p>Content</p>
    </Drawer>
  );
  expect(await axe(document.body)).toHaveNoViolations();
});
```

### Pattern 3: Disable Unresolvable Axe Rules
**What:** Pass `axe(target, { rules: { 'color-contrast': { enabled: false } } })` when the component uses CSS custom property colors that jsdom cannot resolve.
**When to use:** Any component where color-contrast rule fires false positives in jsdom. The programmatic token-contrast test covers this separately.

```typescript
// Source: CONTEXT.md decision + axe-core docs
it("ComponentName", async () => {
  const { container } = render(<ComponentName />);
  expect(
    await axe(container, {
      rules: {
        // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
        "color-contrast": { enabled: false },
      },
    })
  ).toHaveNoViolations();
});
```

### Pattern 4: Token Contrast Test (programmatic)
**What:** Import `colors.json` directly (no jsdom CSS resolution needed), compute WCAG relative luminance and contrast ratio in pure JS, assert 4.5:1 for text and 3:1 for UI controls.
**When to use:** Once, as a dedicated `src/test/token-contrast.test.ts` file. This is the only reliable way to verify contrast in a Vitest/jsdom environment.

```typescript
// Source: WCAG 2.1 spec + colors.json structure already in repo
import colors from "../tokens/colors.json";

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
```

### Pattern 5: Focus Return on Close
**What:** Capture `document.activeElement` at the moment the overlay opens, store in a ref, restore on close via `useEffect` cleanup or explicit `onClose` handler.
**When to use:** Dialog, Drawer, ConfirmDialog, DropdownMenu, CommandPalette, Popover, ContextMenu.

```typescript
// Source: WAI-ARIA authoring practices + derived from Dialog.tsx pattern
const triggerRef = useRef<Element | null>(null);

useEffect(() => {
  if (open) {
    triggerRef.current = document.activeElement;
  } else {
    // Restore focus on close
    (triggerRef.current as HTMLElement | null)?.focus();
    triggerRef.current = null;
  }
}, [open]);
```

**Note:** The effect dependency on `open` means the capture happens synchronously when `open` transitions to `true`, before the focus trap moves focus inside the dialog. This is the correct ordering.

### Pattern 6: aria-live for Loading States
**What:** A visually-hidden `aria-live="polite"` region that receives text updates when Spinner/Progress start and complete. The region is always in the DOM (not conditionally rendered) so screen readers register it before updates arrive.

```typescript
// Source: WAI-ARIA best practices
// Place inside Spinner/Progress component:
<span
  role="status"
  aria-live="polite"
  aria-atomic="true"
  style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
>
  {isLoading ? "Loading" : ""}
</span>
```

**Note on Skeleton:** Skeleton components are visual-only placeholders. They should have `aria-hidden="true"` and the loading region pattern is handled by the parent (Spinner/Progress), not Skeleton itself.

### Recommended File Structure Changes

```
packages/rialto/src/
├── test/
│   ├── setup.ts                  # existing — no change
│   ├── vitest-axe.d.ts           # existing — no change
│   └── token-contrast.test.ts    # NEW — programmatic contrast assertions
├── components/
│   └── accessibility.test.tsx    # existing — extend with 18 new it() blocks
```

### Anti-Patterns to Avoid
- **Scanning `container` for portal components:** Portal content renders into `document.body` outside the container. Always scan `document.body` for open overlay components.
- **Conditional aria-live rendering:** Mounting/unmounting an `aria-live` region means screen readers won't catch the first announcement. Keep it always in DOM with empty text content when idle.
- **Per-component contrast overrides in CSS:** All contrast fixes go in `colors.css` token values only. No one-off hardcoded colors.
- **Using `:focus` instead of `:focus-visible`:** `:focus` fires on mouse clicks, creating visible rings for pointer users. Only `:focus-visible` matches keyboard navigation.
- **Capturing `activeElement` after focus trap fires:** The trigger ref must be captured when `open` changes to `true`, not after the focus-trap effect runs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WCAG contrast ratio math | Custom algorithm | Established WCAG formula (implemented in token-contrast test) | The formula is specified exactly in WCAG 2.1 §1.4.3 — just implement it once |
| Axe rule engine | Custom ARIA checker | `axe-core` via `vitest-axe` | axe covers 300+ rules; hand-written ARIA checks miss edge cases |
| Focus trap | Custom Tab key interception | Existing Dialog.tsx pattern (copy to Drawer/CommandPalette) | Dialog already has a correct implementation |

**Key insight:** The axe-core + vitest-axe stack is already configured and working for 44 tests. The 18 missing tests are additive work, not new infrastructure.

---

## Contrast Audit Results

### Light Theme Failures (computed from colors.json)

| Token Pair | Current Ratio | Required | Delta | Fix Direction |
|------------|--------------|----------|-------|---------------|
| `text-tertiary` (#9e9890) on `surface` (#f8f6f3) | 2.65 | 4.5:1 (text) | -1.85 | Darken `--rialto-text-tertiary` toward #7a7470 range |
| `warning` (#b8862a) on `surface` (#f8f6f3) | 3.00 | 4.5:1 (text) | -1.50 | Darken `--rialto-warning` toward #7a5a1a range |
| `success` (#7a8a3c) on `surface` (#f8f6f3) | 3.52 | 4.5:1 (text) | -0.98 | Darken `--rialto-success` toward #5a6830 range |
| `text-on-accent` (#fdfcfa) on `accent` (#c4922a) | 2.73 | 4.5:1 (button text) | -1.77 | Switch `--rialto-text-on-accent` to dark text (#1a1918) on accent — gives 6.26:1 |
| `accent` (#c4922a) on `surface` as UI control | 2.60 | 3:1 (UI controls) | -0.40 | Darken `--rialto-accent` — risk: changes focus ring appearance |

**Note on `text-on-accent`:** Dark text (#1a1918) on accent (#c4922a) gives 6.26:1 — this is the cleanest fix. CLAUDE.md already forbids light text on non-button-fill contexts. The `--rialto-text-on-accent` token can be set to `#1a1918` in light theme. This is Claude's discretion territory.

**Note on `accent` UI control contrast:** The accent color is used for focus rings (against `surface`) and active states. A 3:1 requirement means the focus ring box-shadow must be perceptible. The `--rialto-shadow-focus` is a 2px offset ring + 12px glow — the 4px solid ring edge against surface is what must pass 3:1. This requires darkening `--rialto-accent` slightly.

### Dark Theme Status (computed from colors.json + opacity blending)

| Token Pair | Current Ratio | Required | Status |
|------------|--------------|----------|--------|
| `text-primary` (0.92 opacity blend) on `surface` (#1e1c1a) | 14.13 | 4.5:1 | PASS |
| `text-secondary` (0.60 opacity blend) on `surface` (#1e1c1a) | 6.68 | 4.5:1 | PASS |
| `text-tertiary` (0.38 opacity blend) on `surface` (#1e1c1a) | 3.49 | 3:1 UI | PASS |
| `text-on-accent` (#1a1918) on `accent` (#d4a23a) | 7.55 | 4.5:1 | PASS |
| `accent` (#d4a23a) on `surface` (#1e1c1a) | 7.30 | 3:1 UI | PASS |
| `error` (#e06050) on `surface` (#1e1c1a) | 4.82 | 4.5:1 | PASS |
| `warning` (#d4a030) on `surface` (#1e1c1a) | 7.18 | 4.5:1 | PASS |
| `success` (#9aaa4c) on `surface` (#1e1c1a) | 6.66 | 4.5:1 | PASS |

**Dark theme is fully WCAG AA compliant.** All fixes are light-theme-only.

---

## Common Pitfalls

### Pitfall 1: Portal Content Invisible to Container Scan
**What goes wrong:** `axe(container)` returns no violations for a Tooltip/Dropdown even though the content has ARIA errors — because the content rendered into `document.body`.
**Why it happens:** React portals by definition mount outside the component tree's container div.
**How to avoid:** For all open-state overlay tests, use `axe(document.body)`.
**Warning signs:** axe test passes with zero rules checked (empty scan) — check the axe result's `violations` array is actually populated with at least a run.

### Pitfall 2: Focus Return Timing Race
**What goes wrong:** Focus returns to trigger element but then the next frame moves focus elsewhere (e.g., a scroll event, another useEffect).
**Why it happens:** `onClose` fires during React's synthetic event processing; restoring focus synchronously during the same flush can be overridden.
**How to avoid:** Wrap the focus restore in `requestAnimationFrame(() => triggerRef.current?.focus())` if synchronous restore gets overridden.
**Warning signs:** Focus visually flickers or ends up on `document.body`.

### Pitfall 3: aria-live Region Added After Content Update
**What goes wrong:** Screen reader doesn't announce the loading state because the region was mounted at the same time as the text.
**Why it happens:** Screen readers register live regions on mount; content inside the region at mount time is not announced.
**How to avoid:** Always keep the region in the DOM with empty content, update content after mount.
**Warning signs:** Works in browser extension testing but fails with actual screen reader.

### Pitfall 4: Opacity-Based Colors Resolve Differently Per Background
**What goes wrong:** `rgb(253 252 250 / 0.60)` passes contrast math when computed against #1e1c1a but fails on #2a2725 (surface-elevated).
**Why it happens:** Opacity-based tokens are not absolute — their effective contrast depends on the actual background behind them.
**How to avoid:** In the token-contrast test, compute the blended absolute hex value for both `surface` and `surface-elevated` backgrounds and assert both.
**Warning signs:** Contrast passes on base surface but a component on an elevated card fails visually.

### Pitfall 5: axe `color-contrast` Rule Fires False Positives in jsdom
**What goes wrong:** axe reports color-contrast violations on components that actually pass — because jsdom returns empty string for `getComputedStyle()` on CSS custom properties.
**Why it happens:** jsdom does not compute CSS cascade; `var(--rialto-text-primary)` resolves to `""`.
**How to avoid:** Disable `color-contrast` rule in axe options with a comment. The token-contrast test handles this separately.
**Warning signs:** axe reports contrast violations with `bgColor: "rgba(0, 0, 0, 0)"`.

### Pitfall 6: ConfirmDialog Focus Timing
**What goes wrong:** `ConfirmDialog` uses a `setTimeout(50)` to focus buttons — but this races with the Dialog focus trap which focuses the first focusable element immediately.
**Why it happens:** Two focus management effects running concurrently.
**How to avoid:** ConfirmDialog's explicit focus override should run after Dialog's trap. The 50ms delay in the existing code handles this, but verify it still works when focus-return is added.
**Warning signs:** After open, focus lands on the Dialog close button instead of cancel/confirm.

---

## Component Coverage Gap: 18 Missing Axe Tests

### Portal Components (scan `document.body` when open)
| Component | Render Strategy | Notes |
|-----------|----------------|-------|
| CommandPalette | `open={true}` | Has search input — ensure placeholder doesn't trigger label violation |
| Drawer | `open={true}` | Needs title prop to satisfy aria-label |
| ConfirmDialog | `open={true}` | Wraps Dialog — will trigger Dialog's focus trap |
| DropdownMenu | `open={true}` | Need to check export shape |
| Popover | `open={true}` | Need to check export shape |
| Tooltip | render with trigger visible | Tooltip content may need delay bypass |
| ContextMenu | `open={true}` | Need to check export shape |
| HoverCard | render with content visible | Need to check export shape |
| Autocomplete | `open={true}` or with options | Need to check export shape |

### Non-Portal Components (scan `container`)
| Component | Render Strategy | Notes |
|-----------|----------------|-------|
| AppBar | minimal props | Navigation landmark — check role="banner" |
| AspectRatio | with child content | Layout-only; minimal ARIA concerns |
| DisabledTooltip | with disabled child | Renders trigger + tooltip; check for orphaned tooltip |
| Footer | minimal props | Check role="contentinfo" |
| Hero | minimal props | Check heading hierarchy |
| InputGroup | with input children | Check label association for grouped inputs |
| PageHeader | with title prop | Check heading level |
| ScrollArea | with scrollable content | Check for scroll region labeling |
| Skeleton | render as-is | Should be aria-hidden="true" |

---

## Focus Management: Current State vs Required

### Dialog
- **Focus trap:** PRESENT (Tab wraps within panel)
- **Focus on open:** PRESENT (focuses first focusable element)
- **Focus return on close:** ABSENT — must add

### Drawer
- **Focus trap:** ABSENT — must add (copy from Dialog)
- **Focus on open:** ABSENT — must add
- **Focus return on close:** ABSENT — must add

### CommandPalette
- **Focus trap:** ABSENT (input gets focus but Tab can escape)
- **Focus on open:** PRESENT (inputRef.current?.focus() via rAF)
- **Focus return on close:** ABSENT — must add

### ConfirmDialog
- **Focus trap:** Inherited from Dialog (PRESENT)
- **Focus on open:** PRESENT (cancel/confirm button via setTimeout)
- **Focus return on close:** ABSENT — inherited gap from Dialog

### DropdownMenu / Popover / ContextMenu
- **All:** Need individual audit — check export shape first

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `role="alert"` on everything dynamic | `aria-live="polite"` for non-urgent, `assertive` only for errors | Alert component already correctly uses `role="alert"` for error/warning, `role="status"` for info/success |
| `:focus` for all focus styling | `:focus-visible` only | focusRing in surfaces.module.css already uses `:focus-visible` |
| Inline `aria-label` on every element | Prefer native semantics + `aria-label` only where needed | Good pattern; axe will catch missing labels |
| `tabindex="0"` on divs for interactivity | Use semantic HTML (button, a) | Check DropdownMenu/ContextMenu items for div-based interactivity |

---

## Code Examples

### Token Contrast Test Structure
```typescript
// Source: WCAG 2.1 §1.4.3 algorithm + colors.json structure
// File: packages/rialto/src/test/token-contrast.test.ts

import { describe, it, expect } from "vitest";
import colors from "../tokens/colors.json";

function sRGB(c: number): number {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Blend an rgba color over a background hex for opacity-based tokens
function blendAlpha(fgHex: string, bgHex: string, alpha: number): string {
  const fr = parseInt(fgHex.slice(1, 3), 16);
  const fg = parseInt(fgHex.slice(3, 5), 16);
  const fb = parseInt(fgHex.slice(5, 7), 16);
  const br = parseInt(bgHex.slice(1, 3), 16);
  const bg = parseInt(bgHex.slice(3, 5), 16);
  const bb = parseInt(bgHex.slice(5, 7), 16);
  const r = Math.round(fr * alpha + br * (1 - alpha));
  const g = Math.round(fg * alpha + bg * (1 - alpha));
  const b = Math.round(fb * alpha + bb * (1 - alpha));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

describe("Token contrast ratios — WCAG AA", () => {
  describe("Light theme", () => {
    const surface = colors.color.surface.default.$value;
    const textPrimary = colors.color.text.primary.$value;
    const textSecondary = colors.color.text.secondary.$value;

    it("text-primary on surface meets 4.5:1", () => {
      expect(contrastRatio(textPrimary, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it("text-secondary on surface meets 4.5:1", () => {
      expect(contrastRatio(textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
    });

    // ... additional pairs
  });
});
```

### Focus Return on Close Pattern
```typescript
// Source: WAI-ARIA Dialog authoring practices
// Add to Dialog.tsx, Drawer.tsx, CommandPalette.tsx

const triggerRef = useRef<Element | null>(null);

useEffect(() => {
  if (open) {
    // Capture the element that had focus before the overlay opened
    triggerRef.current = document.activeElement;
  } else {
    // Restore focus when overlay closes
    requestAnimationFrame(() => {
      (triggerRef.current as HTMLElement | null)?.focus();
      triggerRef.current = null;
    });
  }
}, [open]);
```

### Toast variant-aware aria-live (update required)
```typescript
// Current: single role="region" aria-live="polite"
// Required per CONTEXT.md: error/warning should be assertive

// In Toast.tsx ToastProvider render:
<div
  className={styles.container}
  role="region"
  aria-label="Notifications"
>
  {/* polite region for info/success */}
  <div aria-live="polite" aria-atomic="false">
    {toasts.filter(t => !["error","warning"].includes(t.variant ?? "")).map(...)}
  </div>
  {/* assertive region for error/warning */}
  <div aria-live="assertive" aria-atomic="true">
    {toasts.filter(t => ["error","warning"].includes(t.variant ?? "")).map(...)}
  </div>
</div>
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `packages/rialto/vitest.config.ts` |
| Quick run command | `cd packages/rialto && pnpm test` |
| Full suite command | `pnpm test` (from monorepo root) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| A11Y-01 | Token pairs meet WCAG contrast ratios | unit | `cd packages/rialto && npx vitest run src/test/token-contrast.test.ts` | ❌ Wave 0 |
| A11Y-02 | Interactive elements have focus-visible outlines | manual (tab through showcase) + axe | `cd packages/rialto && pnpm test` | Partial — axe covers some |
| A11Y-03 | Correct ARIA roles/labels/state | unit (axe) | `cd packages/rialto && pnpm test` | Partial — 18 missing |
| A11Y-04 | All 58 component dirs have axe assertions | unit (axe) | `cd packages/rialto && pnpm test` | ❌ 18 missing — Wave 2 |
| A11Y-05 | No keyboard traps, logical DOM order | axe + manual | `cd packages/rialto && pnpm test` | Partial |
| A11Y-06 | Dynamic content uses aria-live | unit (axe) + manual SR | `cd packages/rialto && pnpm test` | Partial |
| A11Y-07 | All form inputs have labels | unit (axe) | `cd packages/rialto && pnpm test` | Partial |
| A11Y-08 | Dialog/Drawer/ConfirmDialog return focus on close | unit (userEvent) | `cd packages/rialto && npx vitest run src/components/Dialog` | ❌ Wave 0 |
| A11Y-10 | Contrast verified at token level | unit | `cd packages/rialto && npx vitest run src/test/token-contrast.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/rialto && pnpm test`
- **Per wave merge:** `pnpm test` from monorepo root
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/rialto/src/test/token-contrast.test.ts` — covers A11Y-01, A11Y-10
- [ ] Focus-return unit test additions to `accessibility.test.tsx` or new `focus-management.test.tsx` — covers A11Y-08

*(Existing axe infrastructure is sufficient — no framework installs needed)*

---

## Open Questions

1. **DropdownMenu / Popover / ContextMenu export shape**
   - What we know: They exist as directories and are exported from `lib-entry.ts`
   - What's unclear: Their exact prop API (particularly whether they accept `open` prop for test rendering)
   - Recommendation: Read each component's `.tsx` file at plan time to determine correct test render pattern

2. **Toast variant-aware aria-live split**
   - What we know: CONTEXT.md requires `aria-live="assertive"` for error/warning toasts
   - What's unclear: Whether splitting into two separate live regions is the correct DOM structure or if a single region with dynamic `aria-live` attribute swap is better
   - Recommendation: Two separate always-mounted live regions is more reliable — `aria-live` attribute changes are not consistently picked up by screen readers

3. **`text-tertiary` usage scope**
   - What we know: Used for "Placeholders, disabled text, timestamps" — disabled text is WCAG-exempt, timestamps are body text
   - What's unclear: Whether placeholder text in inputs must meet 4.5:1 (WCAG 1.4.3 applies; placeholder is informative text)
   - Recommendation: Fix `text-tertiary` to meet 4.5:1 for placeholder use case; disabled text exemption still applies when the token is used for disabled state

4. **Autocomplete portal rendering**
   - What we know: It's listed as a portal component in CONTEXT.md
   - What's unclear: Whether Autocomplete renders its dropdown into a portal or inline
   - Recommendation: Read `Autocomplete.tsx` at plan time; if inline, use `container` scan

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `packages/rialto/src/` — all component files, test files, token files
- WCAG 2.1 §1.4.3 formula — implemented and verified against token hex values above
- Contrast computations — computed in this session via Node.js script from `colors.json` values

### Secondary (MEDIUM confidence)
- WAI-ARIA Authoring Practices 1.1 — Dialog Pattern (focus management, trigger restore)
- MDN — `:focus-visible` pseudo-class behavior

### Tertiary (LOW confidence — validate if needed)
- Screen reader behavior for split `aria-live` regions — recommend empirical testing with VoiceOver

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, versions confirmed from package.json
- Architecture patterns: HIGH — derived directly from existing code + computed contrast values
- Contrast failures: HIGH — computed from actual token hex values in colors.json using WCAG formula
- Missing component list: HIGH — counted directly from directory listing vs test file imports
- Focus management gaps: HIGH — read Dialog, Drawer, CommandPalette source directly
- Pitfalls: MEDIUM — based on known jsdom/axe behavior patterns

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain — axe-core WCAG rules change rarely)
