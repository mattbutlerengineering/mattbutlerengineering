/**
 * Reduced-motion tests for Drawer.
 *
 * The global test setup mocks useReducedMotion → true (reduced motion active).
 * These tests confirm:
 *   1. useReducedMotion is called (the component respects the hook)
 *   2. The component renders correctly in both reduced and full-motion modes
 */
import type * as FramerMotion from "framer-motion";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useReducedMotionSpy } = vi.hoisted(() => ({
  useReducedMotionSpy: vi.fn(() => true),
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return { ...actual, useReducedMotion: useReducedMotionSpy };
});

import { Drawer } from "./Drawer";

describe("Drawer — reduced motion", () => {
  it("calls useReducedMotion", () => {
    useReducedMotionSpy.mockReturnValue(true);
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(useReducedMotionSpy).toHaveBeenCalled();
  });

  it("renders panel correctly when reduced motion is active", () => {
    useReducedMotionSpy.mockReturnValue(true);
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body content</p>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders panel correctly when full motion is active", () => {
    useReducedMotionSpy.mockReturnValue(false);
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body content</p>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });
});
