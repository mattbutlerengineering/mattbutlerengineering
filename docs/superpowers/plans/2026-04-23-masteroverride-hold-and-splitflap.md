# MasterOverride: Hold-to-Engage + SplitFlap Label — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two opt-in enhancements to rialto's `MasterOverride` — a `requireHold` prop that gates engagement behind a press-and-hold gesture, and a `labelTransition="splitflap"` mode that replaces the crossfaded status labels with the library's mechanical SplitFlap cell.

**Architecture:** All hold-to-engage state lives inline in `MasterOverride.tsx` (no hook extraction — see spec for rationale). Threshold is a plain `setTimeout` so it's deterministically testable with `vi.useFakeTimers`; the gold progress ring is a parallel Framer `animate()` on a `MotionValue` writing a CSS custom property via `useMotionValueEvent` — visual-only, decoupled from correctness. SplitFlap integration is a conditional render path inside the existing switch body JSX.

**Tech Stack:** TypeScript, React 19, Framer Motion, CSS Modules with rialto design tokens, Vitest + @testing-library/react + user-event, vitest-axe for accessibility.

**Spec:** `docs/superpowers/specs/2026-04-23-masteroverride-hold-and-splitflap-design.md`

**Closes:** Issue #595 items #1 and #2 only (#3–#6 remain open).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/rialto/src/components/MasterOverride/MasterOverride.tsx` | Modify | Add `requireHold` and `labelTransition`/`labelLength` props; inline hold state machine; conditional SplitFlap render |
| `packages/rialto/src/components/MasterOverride/MasterOverride.module.css` | Modify | Add `.progressRing`, `.holding` class, `--mo-hold-progress` custom property; holding-state lever glow |
| `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx` | Modify | Add `describe("requireHold", ...)` and `describe("labelTransition", ...)` blocks |
| `packages/rialto/src/components/accessibility.test.tsx` | Modify | Add one axe-core entry for the composed `requireHold` + `labelTransition` state |
| `apps/rialto-web/src/pages/forms/MasterOverridePage.tsx` | Modify | Add two new demo sections |

No new files. All changes are additive; existing behavior and API is preserved.

---

## Task 1: Add new props to the interface (types only)

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx:27-46` (props interface)
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `MasterOverride.test.tsx` inside the outer `describe("MasterOverride", ...)`:

```tsx
  describe("prop scaffolding", () => {
    it("accepts requireHold and labelTransition without crashing", () => {
      const { container } = render(
        <MasterOverride
          label="Test"
          on={false}
          onChange={() => {}}
          requireHold={500}
          labelTransition="fade"
          labelLength={8}
        />
      );
      expect(container.firstChild).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails (typecheck, not runtime)**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: FAIL — TypeScript compile error "Property 'requireHold' does not exist on type..." or similar.

- [ ] **Step 3: Add the props to the interface**

In `MasterOverride.tsx`, inside `export interface MasterOverrideProps { ... }`, before the closing brace (after `className?: string;`), add:

```tsx
  /**
   * Require the user to hold the switch for N milliseconds before it engages.
   * Only gates the off → on transition — disengaging remains a single click.
   * Pass `true` for the default 1000ms, or a number to customize.
   * Threshold is clamped to [250, 5000] ms.
   * @default false
   */
  requireHold?: boolean | number;

  /**
   * How the state label (idleLabel / activeLabel) transitions between states.
   * `"splitflap"` replaces the crossfaded labels with a single SplitFlap cell
   * above the switch track that cascades between idle and active values.
   * @default "fade"
   */
  labelTransition?: "fade" | "splitflap";

  /**
   * When `labelTransition="splitflap"`, the fixed cell count for the display.
   * Defaults to `max(idleLabel.length, activeLabel.length)`. Ignored for "fade".
   */
  labelLength?: number;
```

And destructure them in the component function signature (`MasterOverride.tsx:50-62`), after `disabled = false,`:

```tsx
      disabled = false,
      requireHold = false,
      labelTransition = "fade",
      labelLength,
      className,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: PASS (all existing tests + new `prop scaffolding > accepts...` test).

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — add requireHold, labelTransition, labelLength prop types"
```

---

## Task 2: requireHold — happy path (pointer engages after threshold)

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block at the bottom of the outer describe in `MasterOverride.test.tsx`:

```tsx
  describe("requireHold", () => {
    function HoldHarness(props: { threshold?: boolean | number; initial?: boolean }) {
      const [on, setOn] = useState(props.initial ?? false);
      return (
        <MasterOverride
          label="Primary"
          on={on}
          onChange={setOn}
          requireHold={props.threshold ?? true}
        />
      );
    }

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("engages after holding the switch for the default 1000ms threshold", async () => {
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );

      // Open the cover first
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));

      const switchEl = screen.getByRole("switch");
      // Begin hold
      fireEvent.pointerDown(switchEl);
      expect(onChange).not.toHaveBeenCalled();

      // Advance past the threshold
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });
```

Also ensure the imports at the top of the test file include `fireEvent` and `act`:

```tsx
import { render, screen, fireEvent, act } from "@testing-library/react";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "engages after holding"`
Expected: FAIL — `onChange` was called 0 times (hold logic not implemented yet).

- [ ] **Step 3: Implement the minimal hold state machine**

In `MasterOverride.tsx`, update the imports at the top:

```tsx
import { forwardRef, useState, useId, useRef, useEffect, useCallback, type ReactNode } from "react";
import { motion, useReducedMotion, useMotionValue, useMotionValueEvent, animate } from "framer-motion";
```

Inside the component body, after the existing `const shouldReduceMotion = useReducedMotion();` line, add:

```tsx
    const holdThresholdMs =
      requireHold === true ? 1000
      : typeof requireHold === "number" ? Math.max(250, Math.min(5000, requireHold))
      : 0;
    const holdProgress = useMotionValue(0);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
    const [isHolding, setIsHolding] = useState(false);

    const startHold = useCallback(() => {
      if (!armed || disabled || on || holdThresholdMs === 0) return;
      if (holdTimerRef.current) return; // already holding — ignore repeats
      setIsHolding(true);
      holdAnimationRef.current = animate(holdProgress, 1, {
        duration: shouldReduceMotion ? 0 : holdThresholdMs / 1000,
        ease: "linear",
      });
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdAnimationRef.current?.stop();
        holdAnimationRef.current = null;
        setIsHolding(false);
        holdProgress.set(0);
        onChange(true);
      }, holdThresholdMs);
    }, [armed, disabled, on, holdThresholdMs, shouldReduceMotion, holdProgress, onChange]);
```

And on the `switchBody` button element, add the event handler:

```tsx
          <button
            ref={switchRef}
            id={switchId}
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={labelId}
            aria-describedby={description ? descriptionId : undefined}
            className={styles.switchBody}
            disabled={disabled || !armed}
            onClick={handleSwitchToggle}
            onPointerDown={holdThresholdMs && !on ? startHold : undefined}
          >
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "engages after holding"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — requireHold pointer-hold engagement"
```

---

## Task 3: requireHold — suppress click engagement; keep click disengage (asymmetric)

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx` (`handleSwitchToggle`)
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

Inside the `describe("requireHold", ...)` block, add:

```tsx
    it("does not engage on a single click (no hold)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      await user.click(screen.getByRole("switch"));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("disengages on a single click — asymmetric (on → off is instant)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={true} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      await user.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(false);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "does not engage on a single click|asymmetric"`
Expected: The "does not engage" test FAILS (because current click handler still fires `onChange(!on)` when `!on`). The asymmetric disengage test likely passes already since `handleSwitchToggle` unconditionally toggles.

- [ ] **Step 3: Update `handleSwitchToggle` to suppress click engagement when hold is required**

Replace the existing `function handleSwitchToggle()` block in `MasterOverride.tsx` with:

```tsx
    function handleSwitchToggle() {
      if (disabled || !armed) return;
      // When hold is required and we're off, engagement only happens via the
      // hold path — suppress click. Disengaging (on → off) always allowed.
      if (holdThresholdMs > 0 && !on) return;
      onChange(!on);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All previous tests + the two new ones PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — asymmetric requireHold (click disengages instantly)"
```

---

## Task 4: requireHold — keyboard (Enter + Space; ignore key-repeat)

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

Inside `describe("requireHold", ...)`:

```tsx
    it("engages when Enter is held past threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("engages when Space is held past threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: " " });
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("ignores key-repeat events (does not reset the hold timer)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(500); });
      // Simulate OS key-repeat firing a second keydown midway
      fireEvent.keyDown(switchEl, { key: "Enter", repeat: true });
      await act(async () => { vi.advanceTimersByTime(500); });
      // Total elapsed = 1000ms; if repeat had reset, threshold would not have fired
      expect(onChange).toHaveBeenCalledWith(true);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "Enter is held|Space is held|key-repeat"`
Expected: FAIL — no key handlers yet.

- [ ] **Step 3: Add key handlers to the switch body**

On the `switchBody` button in `MasterOverride.tsx`, add two new handlers alongside `onPointerDown`:

```tsx
            onPointerDown={holdThresholdMs && !on ? startHold : undefined}
            onKeyDown={
              holdThresholdMs && !on
                ? (e) => {
                    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                      e.preventDefault(); // block default switch toggle via keydown
                      startHold();
                    }
                  }
                : undefined
            }
```

(We'll add `onKeyUp` for cancel in Task 5.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All tests PASS including the three new keyboard tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — requireHold keyboard (Enter + Space, ignore repeat)"
```

---

## Task 5: requireHold — cancel paths (pointerup, pointerleave, keyup, document pointerup)

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

Inside `describe("requireHold", ...)`:

```tsx
    it("cancels when pointer is released before threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(500); });
      fireEvent.pointerUp(switchEl);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("cancels when pointer leaves the switch before threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(400); });
      fireEvent.pointerLeave(switchEl);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("cancels when key is released before threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(300); });
      fireEvent.keyUp(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("cancels when pointer is released outside the element (document pointerup)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(300); });
      // Release somewhere other than the switch
      fireEvent.pointerUp(document.body);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "cancels when"`
Expected: FAIL — no cancel logic yet; all four tests fire `onChange(true)` when the threshold elapses.

- [ ] **Step 3: Add `cancelHold` and wire cancel paths**

In `MasterOverride.tsx`, add `cancelHold` right after `startHold`:

```tsx
    const cancelHold = useCallback(() => {
      if (holdTimerRef.current === null && !isHolding) return;
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      holdAnimationRef.current?.stop();
      holdAnimationRef.current = null;
      setIsHolding(false);
      animate(holdProgress, 0, { duration: shouldReduceMotion ? 0 : 0.2 });
    }, [isHolding, shouldReduceMotion, holdProgress]);

    // Document-level pointerup cancels the hold — catches releases outside the element.
    useEffect(() => {
      if (!isHolding) return;
      const handler = () => cancelHold();
      document.addEventListener("pointerup", handler);
      return () => document.removeEventListener("pointerup", handler);
    }, [isHolding, cancelHold]);
```

On the `switchBody` button, add three more handlers alongside the existing ones:

```tsx
            onPointerDown={holdThresholdMs && !on ? startHold : undefined}
            onPointerUp={holdThresholdMs ? cancelHold : undefined}
            onPointerLeave={holdThresholdMs ? cancelHold : undefined}
            onKeyDown={
              holdThresholdMs && !on
                ? (e) => {
                    if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                      e.preventDefault();
                      startHold();
                    }
                  }
                : undefined
            }
            onKeyUp={
              holdThresholdMs
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") cancelHold();
                  }
                : undefined
            }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All tests PASS including the four cancel tests and all earlier tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — requireHold cancel on release / leave / keyup"
```

---

## Task 6: requireHold — threshold clamping to [250, 5000] ms

**Files:**
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

(The clamp was implemented in Task 2 — these tests verify that work. If they already pass, the tests still earn their keep as regression coverage.)

Inside `describe("requireHold", ...)`:

```tsx
    it("clamps requireHold below 250ms to 250ms", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold={100} />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      // At 100ms (requested) — should NOT have fired yet
      await act(async () => { vi.advanceTimersByTime(100); });
      expect(onChange).not.toHaveBeenCalled();
      // At 250ms (clamp minimum) — should fire
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("clamps requireHold above 5000ms to 5000ms", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold={10000} />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      // At 5000ms (clamp ceiling) — should fire
      await act(async () => { vi.advanceTimersByTime(5000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });
```

- [ ] **Step 2: Run tests to verify they pass (clamping already implemented)**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "clamps"`
Expected: PASS (the `Math.max(250, Math.min(5000, requireHold))` expression in Task 2 handles both cases).

- [ ] **Step 3: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "test(rialto): MasterOverride — requireHold clamping coverage"
```

---

## Task 7: requireHold — live region announcements

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

Inside `describe("requireHold", ...)`:

```tsx
    it("announces 'Hold to arm' when hold begins", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <MasterOverride label="Primary" on={false} onChange={() => {}} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      const live = screen.getByRole("status");
      expect(live.textContent).toMatch(/hold to arm primary/i);
    });

    it("announces 'Arming cancelled' on early release", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <MasterOverride label="Primary" on={false} onChange={() => {}} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(200); });
      fireEvent.pointerUp(switchEl);
      expect(screen.getByRole("status").textContent).toMatch(/arming cancelled/i);
    });

    it("announces '<label> engaged' on successful engagement", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const Harness = () => {
        const [on, setOn] = useState(false);
        return (
          <MasterOverride label="Primary" on={on} onChange={setOn} requireHold />
        );
      };
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.getByRole("status").textContent).toMatch(/primary engaged/i);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "announces"`
Expected: FAIL — no `holdAnnouncement` state yet.

- [ ] **Step 3: Add `holdAnnouncement` state and wire it into the live region**

In `MasterOverride.tsx`, add state alongside `isHolding`:

```tsx
    const [isHolding, setIsHolding] = useState(false);
    const [holdAnnouncement, setHoldAnnouncement] = useState<string | null>(null);
```

Update `startHold` to set the announcement when the hold begins and on success. Replace the `startHold` body with:

```tsx
    const startHold = useCallback(() => {
      if (!armed || disabled || on || holdThresholdMs === 0) return;
      if (holdTimerRef.current) return;
      setIsHolding(true);
      setHoldAnnouncement(`Hold to arm ${label}`);
      holdAnimationRef.current = animate(holdProgress, 1, {
        duration: shouldReduceMotion ? 0 : holdThresholdMs / 1000,
        ease: "linear",
      });
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdAnimationRef.current?.stop();
        holdAnimationRef.current = null;
        setIsHolding(false);
        setHoldAnnouncement(`${label} engaged`);
        holdProgress.set(0);
        onChange(true);
      }, holdThresholdMs);
    }, [armed, disabled, on, holdThresholdMs, shouldReduceMotion, holdProgress, onChange, label]);
```

Update `cancelHold` to set the cancel announcement only when we were actively holding:

```tsx
    const cancelHold = useCallback(() => {
      if (holdTimerRef.current === null && !isHolding) return;
      const wasActive = holdTimerRef.current !== null;
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      holdAnimationRef.current?.stop();
      holdAnimationRef.current = null;
      setIsHolding(false);
      if (wasActive) setHoldAnnouncement("Arming cancelled");
      animate(holdProgress, 0, { duration: shouldReduceMotion ? 0 : 0.2 });
    }, [isHolding, shouldReduceMotion, holdProgress]);
```

Finally, change the live region JSX from:

```tsx
        <span role="status" aria-live="polite" className={styles.srOnly}>
          {statusMessage}
        </span>
```

…to:

```tsx
        <span role="status" aria-live="polite" className={styles.srOnly}>
          {holdAnnouncement ?? statusMessage}
        </span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All tests PASS including the three new announcement tests and all earlier tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — requireHold live region announcements"
```

---

## Task 8: requireHold — progress ring (CSS, DOM, MotionValue → CSS var)

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.module.css`
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing test**

Inside `describe("requireHold", ...)`:

```tsx
    it("renders the progress ring element inside the switch track while holding", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { container } = render(
        <MasterOverride label="Primary" on={false} onChange={() => {}} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      // Ring element exists at rest (styling hides it); verify opacity class flips while holding
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).not.toMatch(/holding/);
      fireEvent.pointerDown(screen.getByRole("switch"));
      expect(wrapper.className).toMatch(/holding/);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "progress ring element"`
Expected: FAIL — no `holding` class on wrapper.

- [ ] **Step 3: Add CSS for the progress ring and holding class**

In `MasterOverride.module.css`, add these rules. Insert before the `/* ── Description ──` section:

```css
/* ── Progress ring (visible while holding) ─── */
.wrapper {
  /* existing rules… (don't duplicate — append the custom prop to the same
     :root-like .wrapper rule you already have) */
}

/* Keep the ring element mounted always; .holding toggles opacity. */
.progressRing {
  position: absolute;
  inset: -4px;
  border-radius: calc(var(--rialto-radius-default) + 4px);
  pointer-events: none;
  opacity: 0;
  background: conic-gradient(
    var(--rialto-accent) calc(var(--mo-hold-progress, 0) * 360deg),
    transparent 0
  );
  mask: radial-gradient(circle, transparent 55%, #000 58%);
  -webkit-mask: radial-gradient(circle, transparent 55%, #000 58%);
  transition: opacity var(--rialto-duration-fast) var(--rialto-ease-precision);
  filter: drop-shadow(0 0 6px var(--rialto-accent-glow));
}

.holding .progressRing {
  opacity: 1;
}

.holding .switchLever {
  filter: drop-shadow(0 0 4px var(--rialto-accent-glow));
  transition: filter var(--rialto-duration-fast) var(--rialto-ease-precision);
}
```

Also append `--mo-hold-progress: 0;` inside the existing `.wrapper` rule, alongside the other custom properties. Open the CSS and add it below `--mo-switch-text-size: 10px;`:

```css
  --mo-switch-text-size: 10px;
  --mo-hold-progress: 0;
```

- [ ] **Step 4: Add the ring to the JSX and wire the MotionValue**

In `MasterOverride.tsx`, inside the component after the other hooks, subscribe to the motion value:

```tsx
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    useMotionValueEvent(holdProgress, "change", (v) => {
      wrapperRef.current?.style.setProperty("--mo-hold-progress", String(v));
    });
```

Update the top-level `<div>` to also attach `wrapperRef`. Change the current `ref={ref}` line to a merged-ref pattern:

```tsx
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        wrapperRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );
```

…and use it on the wrapper div:

```tsx
      <div ref={setRefs} className={wrapperClasses} aria-disabled={disabled || undefined}>
```

Then add `isHolding && styles.holding` to the `wrapperClasses` array:

```tsx
    const wrapperClasses = [
      styles.wrapper,
      styles[size],
      styles[`variant-${variant}`],
      on && styles.engaged,
      armed && styles.armed,
      isHolding && styles.holding,
      disabled && styles.disabled,
      className,
    ]
      .filter(Boolean)
      .join(" ");
```

Finally, insert the ring element inside the `.switchTrack` span, as the first child:

```tsx
            <span className={styles.switchTrack} aria-hidden="true">
              <span className={styles.progressRing} />
              <motion.span
                className={styles.switchLever}
                animate={{ y: on ? "-75%" : "75%" }}
                transition={shouldReduceMotion ? reduced : spring}
              />
            </span>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.module.css packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — gold progress ring fills while holding"
```

---

## Task 9: requireHold — reduced motion + unmount cleanup

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

Inside `describe("requireHold", ...)`:

```tsx
    it("still engages at threshold when prefers-reduced-motion is true (default in tests)", async () => {
      // The global test setup mocks useReducedMotion() to return true.
      // This test proves the hold GATE still operates even when motion is disabled.
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("does not leak the hold timer when unmounted mid-hold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      const { unmount } = render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(400); });
      unmount();
      await act(async () => { vi.advanceTimersByTime(2000); });
      // If the timer leaked, onChange would have fired after unmount.
      expect(onChange).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify the leak test fails (reduced-motion test likely passes)**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "reduced-motion|leak"`
Expected: The reduced-motion test PASSES already (timer fires regardless of animation). The leak test FAILS — timer still fires post-unmount and may throw or call setState on an unmounted component.

- [ ] **Step 3: Add unmount cleanup**

In `MasterOverride.tsx`, add a cleanup effect near the other `useEffect` calls:

```tsx
    // Stop any in-flight hold on unmount — prevents timer leak + setState-after-unmount.
    useEffect(() => {
      return () => {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdAnimationRef.current?.stop();
      };
    }, []);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — unmount cleanup for hold timer"
```

---

## Task 10: labelTransition — single SplitFlap cell when "splitflap"

**Files:**
- Modify: `packages/rialto/src/components/MasterOverride/MasterOverride.tsx`
- Test: `packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block in `MasterOverride.test.tsx`:

```tsx
  describe("labelTransition", () => {
    it("renders the crossfade labels by default (fade mode)", () => {
      render(<MasterOverride label="Kill" on={false} onChange={() => {}} />);
      expect(screen.getByText("STANDBY")).toBeInTheDocument();
      expect(screen.getByText("ENGAGED")).toBeInTheDocument();
    });

    it("renders a single SplitFlap (role='img') when splitflap mode", () => {
      const { container } = render(
        <MasterOverride
          label="Kill"
          on={false}
          onChange={() => {}}
          labelTransition="splitflap"
        />
      );
      // SplitFlap renders role="img" internally, but we wrap it in
      // aria-hidden=true so it's role-less to AT. Assert by DOM, not role.
      const board = container.querySelector('[class*="board"]');
      expect(board).toBeTruthy();
      expect(screen.queryByText("STANDBY")).not.toBeInTheDocument();
      expect(screen.queryByText("ENGAGED")).not.toBeInTheDocument();
    });

    it("updates the SplitFlap content when the switch toggles", async () => {
      const user = userEvent.setup();
      const Harness = () => {
        const [on, setOn] = useState(false);
        return (
          <MasterOverride
            label="Kill"
            on={on}
            onChange={setOn}
            labelTransition="splitflap"
          />
        );
      };
      const { container } = render(<Harness />);
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      await user.click(screen.getByRole("switch"));
      // The SplitFlap srOnly mirror inside the board reflects target value.
      const srMirror = container.querySelector('[class*="srOnly"]');
      expect(srMirror?.textContent).toMatch(/ENGAGED/);
    });

    it("uses labelLength when provided", () => {
      const { container } = render(
        <MasterOverride
          label="Kill"
          on={false}
          onChange={() => {}}
          labelTransition="splitflap"
          labelLength={10}
        />
      );
      // Board cells count should match labelLength.
      const cells = container.querySelectorAll('[class*="board"] > [class*="cell"]');
      expect(cells.length).toBe(10);
    });

    it("derives length from max(idleLabel, activeLabel) when labelLength not provided", () => {
      const { container } = render(
        <MasterOverride
          label="Kill"
          on={false}
          onChange={() => {}}
          idleLabel="OFF"
          activeLabel="RUNNING"
          labelTransition="splitflap"
        />
      );
      const cells = container.querySelectorAll('[class*="board"] > [class*="cell"]');
      expect(cells.length).toBe(7); // length of "RUNNING"
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run -t "labelTransition"`
Expected: FAIL — the splitflap mode is not rendered; tests find no board element and still see crossfade spans.

- [ ] **Step 3: Import SplitFlap and implement the conditional render**

In `MasterOverride.tsx`, add the import:

```tsx
import { SplitFlap } from "../SplitFlap";
```

Compute the effective length once inside the component body (near other derived values):

```tsx
    const useSplitFlap = labelTransition === "splitflap";
    const resolvedLabelLength =
      labelLength ?? Math.max(idleLabel.length, activeLabel.length);
    const splitFlapSize: "sm" | "md" = size === "lg" ? "md" : "sm";
```

Inside the `<button className={styles.switchBody}>…</button>` body, replace the existing pair of `<span className={styles.labelOn}>…` + `<span className={styles.labelOff}>…` blocks — and the `<span className={styles.switchTrack}>…` between them — with a conditional:

```tsx
            {useSplitFlap ? (
              <>
                <span className={styles.splitFlapLabel} aria-hidden="true">
                  <SplitFlap
                    value={on ? activeLabel : idleLabel}
                    length={resolvedLabelLength}
                    size={splitFlapSize}
                    charset="alphanumeric"
                    aria-label=""
                  />
                </span>
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.progressRing} />
                  <motion.span
                    className={styles.switchLever}
                    animate={{ y: on ? "-75%" : "75%" }}
                    transition={shouldReduceMotion ? reduced : spring}
                  />
                </span>
              </>
            ) : (
              <>
                <span className={styles.labelOn} data-active={on} aria-hidden="true">
                  {activeLabel}
                </span>
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.progressRing} />
                  <motion.span
                    className={styles.switchLever}
                    animate={{ y: on ? "-75%" : "75%" }}
                    transition={shouldReduceMotion ? reduced : spring}
                  />
                </span>
                <span className={styles.labelOff} data-active={!on} aria-hidden="true">
                  {idleLabel}
                </span>
              </>
            )}
```

Note: `SplitFlap` requires a non-empty `aria-label`. Pass an empty string via the type-cast workaround if TS complains — the container's `aria-hidden="true"` ensures AT never sees it. If TS doesn't permit the empty string, pass a space: `aria-label=" "`.

Add the corresponding CSS in `MasterOverride.module.css`, inserting before the description section:

```css
/* ── SplitFlap state label (replaces labelOn/labelOff when splitflap) ── */
.splitFlapLabel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* SplitFlap component brings its own styling — wrapper is just a flex container */
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir packages/rialto test MasterOverride -- --run`
Expected: All tests PASS (fade mode unchanged, splitflap mode tests all green).

- [ ] **Step 5: Commit**

```bash
git add packages/rialto/src/components/MasterOverride/MasterOverride.tsx packages/rialto/src/components/MasterOverride/MasterOverride.module.css packages/rialto/src/components/MasterOverride/MasterOverride.test.tsx
git commit -m "feat(rialto): MasterOverride — labelTransition='splitflap' renders SplitFlap cell"
```

---

## Task 11: Accessibility axe entry for composed state

**Files:**
- Modify: `packages/rialto/src/components/accessibility.test.tsx`

- [ ] **Step 1: Write the failing test**

Locate the existing `it("MasterOverride", ...)` block (around line 428) in `accessibility.test.tsx`. Immediately after the closing brace of that `it(...)`, add a new one:

```tsx
  it("MasterOverride (requireHold + splitflap label)", async () => {
    const { container } = render(
      <MasterOverride
        label="System kill switch"
        description="Halts production workloads immediately."
        on={false}
        onChange={() => {}}
        requireHold
        labelTransition="splitflap"
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
```

- [ ] **Step 2: Run the test**

Run: `pnpm --dir packages/rialto test accessibility -- --run -t "MasterOverride \\(requireHold"`
Expected: PASS — the switch's `role="switch" aria-checked` surface is intact, and the SplitFlap wrapper is `aria-hidden`, so no new WCAG issues surface.

If it FAILS: resolve via the test's assertion output. Most likely causes: SplitFlap container not properly aria-hidden, or missing `aria-label` on the switch. Fix in `MasterOverride.tsx` and re-run.

- [ ] **Step 3: Commit**

```bash
git add packages/rialto/src/components/accessibility.test.tsx
git commit -m "test(rialto): accessibility — MasterOverride composed requireHold + splitflap"
```

---

## Task 12: Showcase page demos

**Files:**
- Modify: `apps/rialto-web/src/pages/forms/MasterOverridePage.tsx`

- [ ] **Step 1: Add two new demo sections**

Open `apps/rialto-web/src/pages/forms/MasterOverridePage.tsx`. Find the existing `<Section>` blocks (or the `MasterOverridePlayground` function) and add two new demo cards. After the existing playground `<Card>`, add:

```tsx
      <Section title="Hold to engage">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <HoldDemo />
        </Card>
      </Section>

      <Section title="Split-flap status label">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <SplitFlapDemo />
        </Card>
      </Section>
```

Define the two demo components at the bottom of the file, before the default export:

```tsx
function HoldDemo() {
  const [on, setOn] = useState(false);
  return (
    <Stack gap="md">
      <MasterOverride
        label="Launch sequence"
        description="Press and hold the switch for 1 second to engage."
        on={on}
        onChange={setOn}
        requireHold
        variant="danger"
      />
      <Text variant="caption" color="secondary">
        Hold engages; a single click disengages (asymmetric dead-man switch).
      </Text>
    </Stack>
  );
}

function SplitFlapDemo() {
  const [on, setOn] = useState(false);
  return (
    <Stack gap="md">
      <MasterOverride
        label="System state"
        description="Label transitions through mechanical split-flap cells."
        on={on}
        onChange={setOn}
        idleLabel="OFFLINE"
        activeLabel="ONLINE"
        labelTransition="splitflap"
      />
    </Stack>
  );
}
```

- [ ] **Step 2: Build the package so the showcase picks up the new exports (if any)**

Run: `pnpm --dir packages/rialto build`
Expected: Build succeeds. (No new exports here — the new props on MasterOverride travel with the existing export — but building regenerates `.d.ts` files consumed by the showcase.)

- [ ] **Step 3: Typecheck the showcase**

Run: `pnpm --dir apps/rialto-web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/rialto-web/src/pages/forms/MasterOverridePage.tsx
git commit -m "docs(rialto-web): showcase requireHold + labelTransition demos on MasterOverride page"
```

---

## Task 13: Final gates (lint, typecheck, test, axe)

**Files:** none modified; all gates.

- [ ] **Step 1: Lint rialto**

Run: `pnpm --dir packages/rialto lint`
Expected: PASS with at most pre-existing warnings (current baseline is 128 warnings per memory obs 484). No new errors.

- [ ] **Step 2: Typecheck rialto**

Run: `pnpm --dir packages/rialto typecheck`
Expected: PASS.

- [ ] **Step 3: Full rialto test suite**

Run: `pnpm --dir packages/rialto test -- --run`
Expected: PASS — all existing tests plus the 20+ new ones from Tasks 1–11.

- [ ] **Step 4: Typecheck + build showcase**

Run: `pnpm --dir apps/rialto-web typecheck && pnpm --dir apps/rialto-web build`
Expected: Both PASS.

- [ ] **Step 5: If any gate fails, fix in place and commit before moving on**

If you encounter failures:
- Lint errors → fix them; never skip with `// eslint-disable` unless there's a real reason.
- Type errors → fix them; don't `any`-cast away.
- Test failures → diagnose (the fake-timer interactions with `userEvent` are the most common source of flake; `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` in the harness is required for user-event methods to drive fake timers correctly).
- axe violations → adjust ARIA or mark composed-aria-hidden correctly; do NOT lower the axe rule floor.

Commit the fix as its own commit:

```bash
git add -u
git commit -m "fix(rialto): MasterOverride — address <specific gate failure>"
```

---

## Task 14: Release (rialto 0.1.11)

**Files:**
- Modify: `.changeset/<new-changeset>.md`
- Modify: `packages/rialto/package.json` (auto by changeset)
- Modify: `packages/rialto/CHANGELOG.md` (manual — per CLAUDE.md gotcha)

- [ ] **Step 1: Author a changeset**

Run: `pnpm changeset`
Interactive prompts:
- Package to bump: `@mattbutlerengineering/rialto`
- Semver: `patch`
- Summary:
  ```
  MasterOverride: add requireHold (asymmetric dead-man hold-to-engage) and labelTransition="splitflap" (SplitFlap state label). Both opt-in; zero behavior change for existing consumers.
  ```

Commit the changeset:

```bash
git add .changeset/
git commit -m "chore(rialto): changeset for MasterOverride requireHold + labelTransition"
```

- [ ] **Step 2: Run version-packages**

Run: `GITHUB_TOKEN=$(gh auth token) pnpm version-packages`
Expected: `packages/rialto/package.json` bumps to `0.1.11`. **Note:** the prettier step will likely error with `Cannot find package '@mbe/config'` — this is a known issue per CLAUDE.md. The version bump succeeds but `packages/rialto/CHANGELOG.md` may not be updated.

- [ ] **Step 3: Manually patch CHANGELOG.md**

Open `packages/rialto/CHANGELOG.md` and prepend a new section:

```markdown
## 0.1.11

### Patch Changes

- MasterOverride: add `requireHold` (asymmetric dead-man hold-to-engage) and `labelTransition="splitflap"` (SplitFlap state label). Both opt-in; zero behavior change for existing consumers.
```

- [ ] **Step 4: Build, lint, typecheck, test (pre-publish gates)**

Run in sequence:

```bash
pnpm --dir packages/rialto build
pnpm --dir packages/rialto lint
pnpm --dir packages/rialto typecheck
pnpm --dir packages/rialto test -- --run
```

All must PASS.

- [ ] **Step 5: Check for regenerated exports map**

Run: `git status packages/rialto/package.json`
Expected: either clean or an updated `exports` map. If updated, include in the release commit.

- [ ] **Step 6: Commit the release**

```bash
git add packages/rialto/package.json packages/rialto/CHANGELOG.md .changeset/
git commit -m "chore(rialto): release 0.1.11 — MasterOverride requireHold + SplitFlap label"
```

- [ ] **Step 7: Publish to GitHub Packages**

Run: `cd packages/rialto && npm publish`
Expected: package published at `https://npm.pkg.github.com/mattbutlerengineering/rialto/-/0.1.11.tgz`.

- [ ] **Step 8: Tag and push**

```bash
git tag @mattbutlerengineering/rialto@0.1.11
git push origin main --tags
```

- [ ] **Step 9: Close issue #595 with a status comment**

```bash
gh issue comment 595 --repo mattbutlerengineering/mattbutlerengineering --body "$(cat <<'EOF'
Items #1 (requireHold) and #2 (SplitFlap label) shipped in rialto 0.1.11. Remaining items #3 (LED telltale), #4 (audio/haptic), #5 (autoReclose), #6 (OverridePanel) are still open — left this issue open for them.
EOF
)"
```

Do NOT close the issue — the remaining items stay tracked.

---

## Self-Review Notes

1. **Spec coverage:** Every spec section maps to at least one task:
   - §1 API additions → Task 1
   - §2 State machine → Tasks 2, 3, 5
   - §3 Progress ring visual → Task 8
   - §4 SplitFlap integration → Task 10
   - §5 Motion & reduced motion → Tasks 8, 9
   - §6 Accessibility → Tasks 7, 11
   - §7 Styling → Task 8, 10
   - §8 Component file diff sketch → Tasks 2–10 (executed in slices)
   - §9 Test additions → Tasks 2–11 (TDD-ordered)
   - §10 Showcase update → Task 12
   - Release workflow → Task 14

2. **Type consistency check:** `holdThresholdMs`, `holdProgress`, `holdTimerRef`, `holdAnimationRef`, `isHolding`, `holdAnnouncement`, `cancelHold`, `startHold`, `useSplitFlap`, `resolvedLabelLength`, `splitFlapSize`, `wrapperRef`, `setRefs` — names are consistent across tasks.

3. **No placeholders:** every test includes actual code, every implementation step includes the actual diff, every command is exact. One caveat: Task 10 step 3 mentions "if TS doesn't permit the empty string, pass a space" — this is a real branch in code, not a placeholder. Resolve during implementation.

4. **Scope:** Focused on one feature (issue #595 items #1+#2). No cross-component refactor.

5. **Known risk from spec:** Progress ring pixel dimensions (the `-4px` inset, mask radius 55%/58%) are visual tuning values that may need iteration during Task 8 to look right against the actual bezel. Acceptable — they are CSS-only tweaks that don't affect tests.

6. **Known gotchas baked into commands:** fake-timer + user-event interop requires `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`; reduced-motion mock is global (test setup mocks `useReducedMotion: () => true`), so the "reduced motion" test in Task 9 is implicitly exercising that path rather than toggling it.
