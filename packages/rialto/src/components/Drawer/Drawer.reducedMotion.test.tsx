/**
 * Reduced-motion tests for Drawer.
 *
 * These tests confirm:
 *   1. the device reduced-motion signal is read (through useMotionPreset)
 *   2. The component renders correctly in both reduced and full-motion modes
 */
import type { DeviceContext } from "../../providers/useDeviceContext";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useDeviceContextSpy } = vi.hoisted(() => ({
  useDeviceContextSpy: vi.fn<() => DeviceContext>(),
}));

// The one reduced-motion signal: useMotionPreset() reads it from the device.
vi.mock("../../providers/useDeviceContext", () => ({ useDeviceContext: useDeviceContextSpy }));

function prefersReducedMotion(reducedMotion: boolean): void {
  useDeviceContextSpy.mockReturnValue({
    pointer: "fine",
    viewport: "desktop",
    reducedMotion,
    colorScheme: "light",
    saveData: false,
  });
}

import { Drawer } from "./Drawer";

describe("Drawer — reduced motion", () => {
  it("reads the device reduced-motion signal", () => {
    prefersReducedMotion(true);
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>
    );
    expect(useDeviceContextSpy).toHaveBeenCalled();
  });

  it("renders panel correctly when reduced motion is active", () => {
    prefersReducedMotion(true);
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body content</p>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders panel correctly when full motion is active", () => {
    prefersReducedMotion(false);
    render(
      <Drawer open title="Settings" onClose={vi.fn()}>
        <p>Body content</p>
      </Drawer>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });
});
