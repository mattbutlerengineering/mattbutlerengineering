/**
 * Reduced-motion tests for CommandPalette.
 */
import type * as FramerMotion from "framer-motion";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CommandItem } from "./CommandPalette";

const { useReducedMotionSpy } = vi.hoisted(() => ({
  useReducedMotionSpy: vi.fn(() => true),
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return { ...actual, useReducedMotion: useReducedMotionSpy };
});

import { CommandPalette } from "./CommandPalette";

// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();

const items: CommandItem[] = [{ id: "new-file", label: "New File", onSelect: vi.fn() }];

describe("CommandPalette — reduced motion", () => {
  it("calls useReducedMotion", () => {
    useReducedMotionSpy.mockReturnValue(true);
    render(<CommandPalette open onOpenChange={vi.fn()} items={items} />);
    expect(useReducedMotionSpy).toHaveBeenCalled();
  });

  it("renders correctly when reduced motion is active", () => {
    useReducedMotionSpy.mockReturnValue(true);
    render(<CommandPalette open onOpenChange={vi.fn()} items={items} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders correctly when full motion is active", () => {
    useReducedMotionSpy.mockReturnValue(false);
    render(<CommandPalette open onOpenChange={vi.fn()} items={items} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
