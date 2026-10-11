/**
 * Test helper — a framer-motion module whose `motion.*` components record the
 * `transition` prop they receive as a `data-motion-transition` attribute.
 *
 * framer-motion's real components still render underneath, so the check sits
 * at the rendered interface — what a component actually hands framer — not in
 * a grep of source text. `useSpring` is wrapped in a spy for the same reason.
 *
 * @example
 * vi.mock("framer-motion", async () => (await import("../record-motion")).recordingFramerMotion());
 */

import { createElement, type ElementType, type Ref } from "react";
import type * as FramerMotion from "framer-motion";

export async function recordingFramerMotion(): Promise<typeof FramerMotion> {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  const cache = new Map<PropertyKey, unknown>();
  const motion = new Proxy(actual.motion, {
    get(target, key) {
      if (!cache.has(key)) {
        const Inner = Reflect.get(target, key) as ElementType;
        const Recorded = (props: { transition?: unknown; ref?: Ref<unknown> }) =>
          createElement(Inner, {
            ...props,
            "data-motion-transition": JSON.stringify(props.transition ?? null),
          });
        Recorded.displayName = `Recorded(${String(key)})`;
        cache.set(key, Recorded);
      }
      return cache.get(key);
    },
  });
  // Overloaded signature: vi.fn() keeps only the last overload, so cast back.
  const useSpring = vi.fn(actual.useSpring) as unknown as typeof actual.useSpring;
  return { ...actual, motion, useSpring };
}

/** Every transition recorded under `root`, in document order (nulls dropped). */
export function recordedTransitions(root: ParentNode = document): unknown[] {
  return Array.from(root.querySelectorAll("[data-motion-transition]"))
    .map((el) => JSON.parse(el.getAttribute("data-motion-transition") ?? "null") as unknown)
    .filter((t) => t !== null);
}
