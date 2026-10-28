import { createElement, type ElementType } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import type * as FramerMotion from "framer-motion";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../../components/Checkbox";
import { PinInput } from "../../components/PinInput";
import { AnimatedTag } from "../../components/Tag/Tag";
import { ToastProvider } from "../../components/Toast/Toast";
import { useToast } from "../../components/Toast/ToastContext";
import { precision } from "../../tokens/motion";
import { stubMatchMedia } from "../match-media";

// Motion policy (packages/rialto/docs/motion.md): never scale from below 0.9;
// productive entrances travel under 16px. Records the entrance/exit props each
// motion.* element receives as data attributes.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  const cache = new Map<PropertyKey, unknown>();
  const motion = new Proxy(actual.motion, {
    get(target, key) {
      if (!cache.has(key)) {
        const Inner = Reflect.get(target, key) as ElementType;
        const Recorded = (props: Record<string, unknown>) =>
          createElement(Inner, {
            ...props,
            "data-m-initial": JSON.stringify(props.initial ?? null),
            "data-m-animate": JSON.stringify(props.animate ?? null),
            "data-m-exit": JSON.stringify(props.exit ?? null),
            "data-m-transition": JSON.stringify(props.transition ?? null),
          });
        cache.set(key, Recorded);
      }
      return cache.get(key);
    },
  });
  return { ...actual, motion };
});

stubMatchMedia([]);

type Recorded = Record<string, number>;

function recorded(el: Element, name: "initial" | "animate" | "exit" | "transition"): Recorded {
  return JSON.parse(el.getAttribute(`data-m-${name}`) ?? "null") as Recorded;
}

function allRecorded(name: "initial" | "animate" | "exit"): Recorded[] {
  return Array.from(document.querySelectorAll(`[data-m-${name}]`))
    .map((el) => recorded(el, name))
    .filter((v) => v !== null);
}

describe("entrance scale floor", () => {
  it("PinInput enters from scale >= 0.9", () => {
    render(<PinInput length={4} label="Code" value="12" />);
    const scales = allRecorded("initial")
      .map((v) => v.scale)
      .filter((s): s is number => s !== undefined);
    expect(scales.length).toBeGreaterThan(0);
    for (const s of scales) expect(s).toBeGreaterThanOrEqual(0.9);
  });

  it("Tag enters and exits at scale >= 0.9", () => {
    render(<AnimatedTag id="t">One</AnimatedTag>);
    const el = document.querySelector("[data-m-initial]") as Element;
    expect(recorded(el, "initial").scale).toBeGreaterThanOrEqual(0.9);
    expect(recorded(el, "exit").scale).toBeGreaterThanOrEqual(0.9);
  });

  it("Checkbox mark rests at scale >= 0.9 when unchecked", () => {
    render(<Checkbox label="Agree" />);
    const marks = allRecorded("animate").filter((v) => v.opacity === 0);
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) expect(m.scale).toBeGreaterThanOrEqual(0.9);
  });
});

function Trigger() {
  const { toast } = useToast();
  return <button onClick={() => toast({ title: "Saved" })}>Show</button>;
}

describe("Toast productive entrance", () => {
  it("fades with a short lift on the precision preset", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    await act(async () => {
      await userEvent.click(screen.getByText("Show"));
    });
    await waitFor(() =>
      expect(document.querySelector('[data-m-initial*="opacity"]')).not.toBeNull()
    );
    const el = document.querySelector('[data-m-initial*="opacity"]') as Element;
    const initial = recorded(el, "initial");
    const exit = recorded(el, "exit");
    expect(initial.opacity).toBe(0);
    expect(Math.abs(initial.y ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(initial.y ?? 0)).toBeLessThan(16);
    expect(initial.x ?? 0).toBe(0);
    expect(initial.scale ?? 1).toBeGreaterThanOrEqual(0.96);
    expect(Math.abs(exit.y ?? 0)).toBeLessThan(16);
    expect(exit.x ?? 0).toBe(0);
    expect(exit.scale ?? 1).toBeGreaterThanOrEqual(0.96);
    expect(recorded(el, "transition")).toEqual({
      duration: precision.duration,
      ease: [...precision.ease],
    });
  });
});
