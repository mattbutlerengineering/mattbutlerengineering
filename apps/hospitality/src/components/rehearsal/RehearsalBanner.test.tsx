import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RehearsalBanner } from "./RehearsalBanner.js";

function setup(overrides: Partial<React.ComponentProps<typeof RehearsalBanner>> = {}) {
  const props = {
    clock: "7:30 PM",
    playing: false,
    speed: 60 as const,
    reducedMotion: false,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStep: vi.fn(),
    onSpeedChange: vi.fn(),
    ...overrides,
  };
  render(<RehearsalBanner {...props} />);
  return props;
}

describe("RehearsalBanner", () => {
  it("says plainly that the bookings are not real", () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent("Rehearsal — not real bookings");
  });

  it("shows the simulated clock", () => {
    setup();
    expect(screen.getByText("7:30 PM")).toBeInTheDocument();
  });

  it("plays when paused and pauses when playing", () => {
    const paused = setup();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(paused.onPlay).toHaveBeenCalledOnce();
  });

  it("offers Pause while playing", () => {
    const playing = setup({ playing: true });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(playing.onPause).toHaveBeenCalledOnce();
  });

  it("marks the current speed and switches speed", () => {
    const props = setup();
    expect(screen.getByRole("button", { name: "60×" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "240×" }));
    expect(props.onSpeedChange).toHaveBeenCalledWith(240);
  });

  it("under reduced motion swaps Play for Next event", () => {
    const props = setup({ reducedMotion: true });
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    expect(props.onStep).toHaveBeenCalledOnce();
  });
});
