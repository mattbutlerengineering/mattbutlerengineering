/**
 * Reduced-motion tests for CommandPalette.
 */
import type { DeviceContext } from "../../providers/useDeviceContext";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CommandItem } from "./CommandPalette";

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

import { CommandPalette } from "./CommandPalette";

// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();

const items: CommandItem[] = [{ id: "new-file", label: "New File", onSelect: vi.fn() }];

describe("CommandPalette — reduced motion", () => {
  it("reads the device reduced-motion signal", () => {
    prefersReducedMotion(true);
    render(<CommandPalette open onOpenChange={vi.fn()} items={items} />);
    expect(useDeviceContextSpy).toHaveBeenCalled();
  });

  it("renders correctly when reduced motion is active", () => {
    prefersReducedMotion(true);
    render(<CommandPalette open onOpenChange={vi.fn()} items={items} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders correctly when full motion is active", () => {
    prefersReducedMotion(false);
    render(<CommandPalette open onOpenChange={vi.fn()} items={items} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
