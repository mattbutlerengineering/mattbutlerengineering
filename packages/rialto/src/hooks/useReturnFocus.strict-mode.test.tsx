import { StrictMode, useEffect, useRef } from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useReturnFocus } from "./useReturnFocus";

/** An overlay that is mounted already open and moves focus inside, as Drawer + useFocusTrap do. */
function Overlay({ open }: { open: boolean }) {
  const innerRef = useRef<HTMLButtonElement>(null);
  useReturnFocus(open);
  useEffect(() => {
    if (open) innerRef.current?.focus();
  }, [open]);
  return open ? <button ref={innerRef}>inside</button> : null;
}

describe("useReturnFocus under StrictMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not pull focus back to the trigger when an open overlay mounts", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    // StrictMode replays the mount effects: cleanup, then setup again.
    const { getByText } = render(
      <StrictMode>
        <Overlay open />
      </StrictMode>
    );
    act(() => {
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(getByText("inside"));

    document.body.removeChild(trigger);
  });

  it("still returns focus to the original trigger when the overlay closes", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <StrictMode>
        <Overlay open />
      </StrictMode>
    );
    act(() => {
      vi.runAllTimers();
    });
    rerender(
      <StrictMode>
        <Overlay open={false} />
      </StrictMode>
    );
    act(() => {
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});
