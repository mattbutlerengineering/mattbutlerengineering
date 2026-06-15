/**
 * Reduced-motion tests for AuthMascot.
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

import { AuthMascot } from "./AuthMascot";

describe("AuthMascot — reduced motion", () => {
  it("calls useReducedMotion", () => {
    useReducedMotionSpy.mockReturnValue(true);
    render(<AuthMascot />);
    expect(useReducedMotionSpy).toHaveBeenCalled();
  });

  it("renders correctly when reduced motion is active", () => {
    useReducedMotionSpy.mockReturnValue(true);
    render(<AuthMascot state="success" />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });

  it("renders correctly when full motion is active", () => {
    useReducedMotionSpy.mockReturnValue(false);
    render(<AuthMascot state="success" />);
    expect(screen.getByLabelText("Otter mascot")).toBeInTheDocument();
  });
});
