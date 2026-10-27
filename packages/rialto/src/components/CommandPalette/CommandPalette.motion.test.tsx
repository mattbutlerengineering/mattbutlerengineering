/**
 * Motion policy: the palette opens 100+ times a day, so its panel enters and
 * exits on opacity only — no scale, no travel, no spring (docs/motion.md).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement, type ElementType } from "react";
import type * as FramerMotion from "framer-motion";
import { stubMatchMedia } from "../../test/match-media";
import { CommandPalette } from "./CommandPalette";

// Full-motion path: the default test setup runs reduced.
stubMatchMedia([]);

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  const motion = new Proxy(actual.motion, {
    get(target, key) {
      const Inner = Reflect.get(target, key) as ElementType;
      return (props: { initial?: unknown; animate?: unknown; exit?: unknown }) =>
        createElement(Inner, {
          ...props,
          "data-motion-initial": JSON.stringify(props.initial ?? null),
          "data-motion-animate": JSON.stringify(props.animate ?? null),
          "data-motion-exit": JSON.stringify(props.exit ?? null),
        });
    },
  });
  return { ...actual, motion };
});

Element.prototype.scrollIntoView = vi.fn();

describe("CommandPalette — frequent-path motion", () => {
  it("panel enters and exits on opacity only", () => {
    render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        items={[{ id: "a", label: "New File", onSelect: vi.fn() }]}
      />
    );
    const panel = screen.getByRole("dialog");
    const read = (name: string): unknown =>
      JSON.parse(panel.getAttribute(`data-motion-${name}`) ?? "null") as unknown;
    expect(read("initial")).toEqual({ opacity: 0 });
    expect(read("animate")).toEqual({ opacity: 1 });
    expect(read("exit")).toEqual({ opacity: 0 });
  });
});
