# MasterOverride: Hold-to-Engage + SplitFlap Label

**Date:** 2026-04-23
**Status:** Draft — awaiting user review
**Related:** [Issue #595](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/595) (items #1 and #2 only; #3–#6 deferred)

## Problem

`MasterOverride` (`packages/rialto/src/components/MasterOverride/MasterOverride.tsx`) nails the visual language of a missile-silo arming switch — hinged cover, warning stripes, machined bezel — but the *engage* action is a single click. A single click undermines the whole "this is dangerous" framing. The component also has a bespoke crossfade between `idleLabel` and `activeLabel` that doesn't reuse the library's flagship mechanical primitive (`SplitFlap`).

This spec covers two opt-in enhancements that invest in the **moment of engagement** without changing default behavior for existing consumers:

1. `requireHold` — hold-to-engage (asymmetric; disengage stays a single click)
2. `labelTransition="splitflap"` — replace the crossfaded label with a `SplitFlap` cell

## Design

### 1. API additions

Two new optional props on `MasterOverrideProps`. Zero existing props change behavior.

```tsx
export interface MasterOverrideProps {
  // ...existing props unchanged...

  /**
   * Require the user to hold the switch for N milliseconds before it engages.
   * Only gates the off → on transition — disengaging remains a single click.
   * Pass `true` for the default 1000ms, or a number to customize.
   * @default false
   */
  requireHold?: boolean | number;

  /**
   * How the state label (idleLabel / activeLabel) transitions between states.
   * @default "fade"
   */
  labelTransition?: "fade" | "splitflap";

  /**
   * When labelTransition="splitflap", the fixed cell count for the display.
   * Ignored for "fade". If omitted, uses max(idleLabel.length, activeLabel.length).
   */
  labelLength?: number;
}
```

**Defaults preserve today's behavior.** A consumer on `@mattbutlerengineering/rialto@0.1.10` upgrading to `0.1.11` sees no visual or behavioral change unless they opt in.

Defaults resolution:
- `requireHold === true` → threshold = `1000`
- `requireHold === false | undefined` → no hold gating
- `requireHold: number` → threshold = that number (clamped to `[250, 5000]` to prevent degenerate UX)

### 2. State machine

Current component has two independent booleans:

- `armed` (cover open) — internal state
- `on` (switch engaged) — controlled by consumer

Hold-to-engage adds **only a transient sub-state** during the off → on transition:

- `holdProgress` — `0` to `1`, only meaningful while a hold gesture is active
- `isHolding` — derived boolean; true while the pointer/key is down and `!on && armed`

`holdProgress` is a Framer `MotionValue<number>`, not React state, so progress updates don't re-render the component every 16ms. Only `isHolding` is React state (for class toggling).

**Transition table (when `requireHold` is set):**

| Starting state | User action | Result |
|---|---|---|
| `armed=true, on=false` | pointerdown / keydown on switch | `isHolding=true`; start threshold timer; `holdProgress` animates 0 → 1 over threshold ms |
| hold active | pointerup / keyup before threshold | `isHolding=false`; `holdProgress` animates back to 0; announce "Arming cancelled" |
| hold active | pointerleave before threshold | same as above (cancel) |
| hold active | threshold fires | clear timer; `onChange(true)`; `isHolding=false`; `holdProgress` snaps to 0; announce `"{label} engaged"` |
| `armed=true, on=true` | click on switch | `onChange(false)` immediately (no hold required — asymmetric) |

When `requireHold` is not set, the component behaves exactly as today.

### 3. Visual — gold progress ring

A new `<span className={styles.progressRing} aria-hidden="true">` nested inside `.switchTrack`. Absolute-positioned to fill the track; uses `conic-gradient` driven by a CSS custom property:

```css
.progressRing {
  position: absolute;
  inset: -4px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  background: conic-gradient(
    var(--rialto-accent) calc(var(--mo-hold-progress, 0) * 360deg),
    transparent 0
  );
  /* Mask to ring only — hollow center */
  mask:
    radial-gradient(circle, transparent 55%, #000 58%);
  -webkit-mask:
    radial-gradient(circle, transparent 55%, #000 58%);
  transition: opacity var(--rialto-duration-fast) var(--rialto-ease-precision);
  filter: drop-shadow(0 0 6px var(--rialto-accent-glow));
}

.holding .progressRing {
  opacity: 1;
}
```

`--mo-hold-progress` is written by a `useMotionValueEvent` subscriber on the Framer motion value. One React-level state change (`isHolding`) drives the opacity class; the ring fill is pure DOM-style mutation with no re-renders.

Reduced motion: when `useReducedMotion()` is true, the progress ring opacity stays 1 (no fade-in) and the threshold fires at the normal time — we don't animate the fill, we just wait the threshold and engage. This keeps the safety property (time-gated commitment) without motion.

### 4. SplitFlap label integration

When `labelTransition === "splitflap"`:

- `.labelOn` / `.labelOff` spans are **replaced** with a single `<SplitFlap>` cell rendered above `.switchTrack`.
- `.labelOff` below the track is not rendered.
- The cell's `value` is `on ? activeLabel : idleLabel`.
- `length` defaults to `max(idleLabel.length, activeLabel.length)`; can be overridden via `labelLength` prop.
- `charset="alphanumeric"` (sufficient for any reasonable label; consumer can't override yet — deferred).
- `size` maps from MasterOverride's `size`: `sm → sm`, `md → sm` (md SplitFlap is too big for the bezel), `lg → md`.
- The SplitFlap is wrapped in a container marked `aria-hidden="true"` so assistive tech never sees it. The outer switch already communicates state via `role="switch" aria-checked={on}`; the SplitFlap is pure visual reinforcement. This avoids duplicate announcements and sidesteps `SplitFlap`'s required non-empty `aria-label` prop (we pass a dummy value that no AT will read).

### 5. Motion & reduced motion

| Motion | Normal | Reduced |
|---|---|---|
| Cover flip | `springGentle` (existing) | `reduced` (existing) |
| Lever flip | `spring` (existing) | `reduced` (existing) |
| Progress ring fill | Framer `animate` value 0 → 1 over threshold ms, ease `precision` | No animation; ring stays invisible, threshold timer still runs, engage fires at threshold |
| Progress ring cancel | `animate` back to 0 over 200ms | Instant (no animation) |
| SplitFlap cascade | SplitFlap's own motion (per-cell `flipInterval`) | SplitFlap handles internally (`instant` prop) |

### 6. Accessibility

**`requireHold`:**
- Switch button retains `role="switch" aria-checked={on}`.
- Live region announcements (existing `role="status" aria-live="polite"`):
  - Hold start: `"Hold to arm {label}"`
  - Hold cancel: `"Arming cancelled"`
  - Hold success: `"{label} engaged"` (this replaces the existing status message while the success announcement is active, then reverts)
- Keyboard: hold Enter OR Space to engage. Key-repeat events are ignored (only the first `keydown` starts the timer). `keyup` cancels if before threshold.
- Pointer: `pointerdown` starts; `pointerup` anywhere on the document cancels/confirms; `pointerleave` on the switch cancels.
- No countdown announcement — screen readers throttle `aria-live` polite regions inconsistently; a countdown ("3… 2… 1…") produces laggy, confusing audio.

**`labelTransition="splitflap"`:**
- SplitFlap container is `aria-hidden="true"`; relies on the switch's `aria-checked` for state announcement.
- axe-core test must still pass.

### 7. Styling — progress ring

New CSS class `.progressRing` in `MasterOverride.module.css`. New class `.holding` on `.wrapper` when `isHolding` is true.

```css
.wrapper {
  /* existing */
  --mo-hold-progress: 0;
}

.holding {
  /* gate the ring's opacity; also used to suppress the lever hover affordance */
  cursor: grabbing;
}

.holding .switchLever {
  /* Subtle: lever gets a faint warm tint while held, to signal imminent engagement */
  filter: drop-shadow(0 0 4px var(--rialto-accent-glow));
  transition: filter var(--rialto-duration-fast) var(--rialto-ease-precision);
}
```

### 8. Component file diff sketch

**`MasterOverride.tsx`** — additions only:

```tsx
import { motion, useReducedMotion, useMotionValue, useMotionValueEvent, animate } from "framer-motion";
import { SplitFlap } from "../SplitFlap";

// Inside component:
const holdProgress = useMotionValue(0);
const holdAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
const holdThresholdMs = requireHold === true ? 1000
  : typeof requireHold === "number" ? Math.max(250, Math.min(5000, requireHold))
  : 0;
const [isHolding, setIsHolding] = useState(false);
const [holdAnnouncement, setHoldAnnouncement] = useState<string | null>(null);

useMotionValueEvent(holdProgress, "change", (v) => {
  // Write to CSS custom property without re-rendering
  if (switchRef.current) {
    switchRef.current.style.setProperty("--mo-hold-progress", String(v));
  }
});

function startHold() {
  if (!armed || disabled || on || holdThresholdMs === 0) return;
  setIsHolding(true);
  setHoldAnnouncement(`Hold to arm ${label}`);
  holdAnimationRef.current = animate(holdProgress, 1, {
    duration: shouldReduceMotion ? 0 : holdThresholdMs / 1000,
    ease: "linear",
    onComplete: () => {
      setIsHolding(false);
      setHoldAnnouncement(`${label} engaged`);
      holdProgress.set(0);
      onChange(true);
    },
  });
}

function cancelHold() {
  if (!isHolding) return;
  holdAnimationRef.current?.stop();
  setIsHolding(false);
  setHoldAnnouncement("Arming cancelled");
  animate(holdProgress, 0, { duration: 0.2 });
}

// On switchBody — these replace the current `onClick={handleSwitchToggle}`:
onPointerDown={holdThresholdMs && !on ? startHold : undefined}
onPointerUp={holdThresholdMs ? cancelHold : undefined}
onPointerLeave={holdThresholdMs ? cancelHold : undefined}
onKeyDown={holdThresholdMs && !on
  ? (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) startHold(); }
  : undefined}
onKeyUp={holdThresholdMs
  ? (e) => { if (e.key === "Enter" || e.key === " ") cancelHold(); }
  : undefined}
onClick={(e) => {
  // When requireHold is active and we're off, suppress the click path —
  // engagement only fires via the hold's onComplete callback.
  if (holdThresholdMs && !on) return;
  handleSwitchToggle();
}}

// Also: add a document-level pointerup listener via useEffect while isHolding,
// so releasing the pointer outside the element cancels cleanly.
useEffect(() => {
  if (!isHolding) return;
  const handler = () => cancelHold();
  document.addEventListener("pointerup", handler);
  return () => document.removeEventListener("pointerup", handler);
}, [isHolding]);

// And a cleanup on unmount to stop any active hold animation:
useEffect(() => () => holdAnimationRef.current?.stop(), []);

// The live region renders holdAnnouncement when set, falling back to
// the existing cover/switch statusMessage. Transient announcements
// (cancel, success) clear themselves after ~2s via setTimeout so the
// region reverts to the resting description.
const liveText = holdAnnouncement ?? statusMessage;

// In JSX, the existing <span role="status"> uses `liveText` instead of
// `statusMessage` directly.
```

### 9. Test additions

New `describe` blocks in `MasterOverride.test.tsx`:

```tsx
describe("requireHold", () => {
  it("does not engage on single click", async () => { /* click → onChange not called */ });
  it("engages after hold threshold via pointer", async () => { /* pointerdown + advance timers + assert onChange(true) */ });
  it("engages after hold via Enter key", async () => { /* keydown Enter, advance, assert */ });
  it("engages after hold via Space key", async () => { /* keydown Space, advance, assert */ });
  it("cancels when released before threshold", async () => { /* pointerup early → no engage */ });
  it("cancels on pointerleave", async () => { /* pointerleave → no engage */ });
  it("ignores key-repeat events", async () => { /* multiple keydowns don't reset timer */ });
  it("does not gate disengaging (asymmetric)", async () => { /* on=true, click → onChange(false) instantly */ });
  it("clamps threshold below 250ms", async () => { /* requireHold={100} → uses 250 */ });
  it("clamps threshold above 5000ms", async () => { /* requireHold={10000} → uses 5000 */ });
  it("announces hold start, cancel, and success", async () => { /* status region content */ });
  it("respects prefers-reduced-motion", async () => { /* motion mock, threshold still fires, ring not animated */ });
});

describe("labelTransition", () => {
  it("renders crossfade labels by default", () => { /* labelOn + labelOff spans present */ });
  it("renders a single SplitFlap when splitflap", () => { /* SplitFlap present, labelOn/Off absent */ });
  it("updates SplitFlap value when switch toggles", async () => { /* value=STANDBY → value=ENGAGED */ });
  it("uses labelLength prop when provided", () => { /* SplitFlap length matches */ });
  it("derives length from longest label by default", () => { /* max(idle, active) */ });
});
```

All existing tests must continue to pass unchanged (behavior is fully additive).

Plus:
- `accessibility.test.tsx` — add one axe-core entry with `requireHold={true}` + `labelTransition="splitflap"` to guarantee the composed state is WCAG-clean.

### 10. Showcase update

`apps/rialto-web/src/pages/data-entry/MasterOverridePage.tsx` (or whichever page already hosts MasterOverride) — add two new demos:

1. **Hold-to-engage** — a `<MasterOverride>` with `requireHold` and a live counter showing "held for Nms" for demo observability.
2. **SplitFlap label** — a `<MasterOverride>` with `labelTransition="splitflap"` and `idleLabel="OFFLINE" activeLabel="ONLINE"` (7/6 chars, interesting cascade).

## Out of scope

- LED telltale (issue #595 item 3) — deferred; ties to `StatusLED` primitive extraction decision.
- Audio/haptic feedback (item 4).
- `autoReclose` (item 5).
- `OverridePanel` composition (item 6).
- Extracting a reusable `useHoldToConfirm` hook — deferred until a second consumer exists.
- Changing any existing default behavior.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pointer capture edge cases (drag off element then release) | `pointerleave` cancels immediately; documented in test. Also: `pointerup` listener on the document, not just the element, to catch orphan releases. |
| Key-repeat flooding `keydown` handler | Check `e.repeat` on keydown — only first event starts the hold. |
| Timer leak if component unmounts mid-hold | `useEffect` cleanup stops animation ref on unmount. |
| SplitFlap visual mismatch at `size="sm"` | Manually verified — map `md → sm` SplitFlap size so the cell fits the 7rem bezel. |
| Reduced-motion + requireHold — threshold still elapses without visual progress | Deliberate: hold gate is a safety property, not a visual flourish. Document in JSDoc. |
| Tests for hold depend on fake timers | Use `vi.useFakeTimers()` + `vi.advanceTimersByTime()` — already used elsewhere in the package (pattern established). |

## Delivery

- Single PR against main.
- Ships as `@mattbutlerengineering/rialto@0.1.11` via the standard changeset + manual CHANGELOG workflow (per CLAUDE.md gotcha: changeset post-version prettier step silently skips rialto/CHANGELOG.md).
- Closes issue #595 items 1 and 2 only; leaves issue open with a follow-up comment listing remaining items.
