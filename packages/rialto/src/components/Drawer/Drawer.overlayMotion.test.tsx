/**
 * The Drawer backdrop resolves its transition through useMotionPreset() (ADR-025),
 * never a hand-built `shouldReduceMotion ? 0 : <literal>` fallback.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createElement, type ElementType } from "react";
import type * as FramerMotion from "framer-motion";
import { stubMatchMedia } from "../../test/match-media";
import { spring } from "../../tokens/motion";
import { Drawer } from "./Drawer";

stubMatchMedia([]);

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  const motion = new Proxy(actual.motion, {
    get(target, key) {
      const Inner = Reflect.get(target, key) as ElementType;
      return (props: { transition?: unknown }) =>
        createElement(Inner, {
          ...props,
          "data-motion-transition": JSON.stringify(props.transition ?? null),
        });
    },
  });
  return { ...actual, motion };
});

describe("Drawer — backdrop transition", () => {
  it("uses the motion preset spring", () => {
    const { container } = render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    const backdrop = container.querySelector('[class*="overlay"]');
    expect(backdrop?.getAttribute("data-motion-transition")).toBe(JSON.stringify(spring));
  });
});
