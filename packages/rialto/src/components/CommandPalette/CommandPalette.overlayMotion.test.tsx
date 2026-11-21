/**
 * The CommandPalette overlay resolves its transition through useMotionPreset()
 * (ADR-025), never a hand-built `shouldReduceMotion ? 0 : <literal>` fallback.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createElement, type ElementType } from "react";
import type * as FramerMotion from "framer-motion";
import { stubMatchMedia } from "../../test/match-media";
import { precision } from "../../tokens/motion";
import { CommandPalette } from "./CommandPalette";

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

Element.prototype.scrollIntoView = vi.fn();

describe("CommandPalette — overlay transition", () => {
  it("uses the motion preset precision transition", () => {
    const { container } = render(
      <CommandPalette
        open
        onOpenChange={vi.fn()}
        items={[{ id: "a", label: "New File", onSelect: vi.fn() }]}
      />
    );
    const overlay = container.querySelector('[class*="overlay"]');
    expect(overlay?.getAttribute("data-motion-transition")).toBe(JSON.stringify(precision));
  });
});
