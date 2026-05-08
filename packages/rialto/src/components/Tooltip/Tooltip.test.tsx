/**
 * Unit tests for the Tooltip component.
 */
import type * as FramerMotion from "framer-motion";

// Make AnimatePresence render-and-remove immediately (no exit animation delay)
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => true,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { Tooltip } from "./Tooltip";

afterEach(() => {
  vi.useRealTimers();
});

/** Helper: open tooltip by firing mouseenter on the wrapper and advancing time */
function hoverIn(element: HTMLElement, delay = 0) {
  fireEvent.mouseEnter(element);
  act(() => {
    vi.advanceTimersByTime(delay);
  });
}

function hoverOut(element: HTMLElement) {
  fireEvent.mouseLeave(element);
}

describe("Tooltip", () => {
  it("does not show tooltip by default", () => {
    render(
      <Tooltip content="Helpful text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip after delay on mouse enter", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Helpful text" delay={200}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").closest("[onmouseenter]") ??
      screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    // Not visible yet
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Helpful text");
  });

  it("shows tooltip with delay=0 immediately after mouse enter", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Immediate tooltip" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("hides tooltip on mouse leave", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Helpful text" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    hoverOut(wrapper);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip on focus when showOnFocus=true (default)", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Focus tooltip" delay={0} showOnFocus>
        <button>Focus me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    fireEvent.focus(wrapper);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("hides tooltip on blur", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Focus tooltip" delay={0} showOnFocus>
        <button>Focus me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    fireEvent.focus(wrapper);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(wrapper);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not show on focus when showOnFocus=false", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="No focus" delay={0} showOnFocus={false}>
        <button>Focus me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    fireEvent.focus(wrapper);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape key when visible", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Press escape" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders content as ReactNode", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content={<strong>Bold tooltip</strong>} delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toContainElement(screen.getByText("Bold tooltip"));
  });

  it("sets aria-describedby on wrapper when tooltip is open", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Describe me" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    expect(wrapper).not.toHaveAttribute("aria-describedby");
    hoverIn(wrapper, 0);
    const tooltip = screen.getByRole("tooltip");
    expect(wrapper).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("clears aria-describedby when tooltip closes", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Describe me" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(wrapper).toHaveAttribute("aria-describedby");
    hoverOut(wrapper);
    expect(wrapper).not.toHaveAttribute("aria-describedby");
  });

  it("supports placement=bottom", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Bottom tooltip" delay={0} placement="bottom">
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("supports placement=left", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Left tooltip" delay={0} placement="left">
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("supports placement=right", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Right tooltip" delay={0} placement="right">
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("supports placement=top (default)", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Top tooltip" delay={0} placement="top">
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    hoverIn(wrapper, 0);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("respects custom delay before showing", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Delayed" delay={500}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    fireEvent.mouseEnter(wrapper);
    // 499ms: not yet visible
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // 500ms: visible
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("cancels delayed show on mouse leave before delay fires", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Cancelled" delay={300}>
        <button>Hover me</button>
      </Tooltip>
    );
    const wrapper = screen.getByRole("button").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.mouseLeave(wrapper);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
