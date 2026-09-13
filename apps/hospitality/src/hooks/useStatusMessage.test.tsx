import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useStatusMessage } from "./useStatusMessage.js";
import { LiveStatus } from "../components/LiveStatus.js";

function Page() {
  const { status, announce } = useStatusMessage();
  return (
    <>
      <LiveStatus status={status} />
      <button onClick={() => announce("Seated.")}>seat</button>
      <button
        onClick={() => {
          announce("First.");
          announce("Second.");
        }}
      >
        twice
      </button>
    </>
  );
}

describe("useStatusMessage + LiveStatus", () => {
  it("mounts one empty, polite, visually hidden status region from first render", () => {
    render(<Page />);

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.textContent).toBe("");
    expect(region.querySelector("span")).toBeNull();
    // vitest maps CSS-module classes non-scoped, so the class name is the source name.
    expect(region).toHaveClass("visuallyHidden");
  });

  it("announcing the same sentence twice yields two seq values and remounts the span", () => {
    const { result } = renderHook(() => useStatusMessage());
    expect(result.current.status).toBeNull();

    act(() => result.current.announce("Seated."));
    const first = result.current.status;
    act(() => result.current.announce("Seated."));
    const second = result.current.status;

    expect(first).toEqual({ seq: expect.any(Number), text: "Seated." });
    expect(second?.text).toBe("Seated.");
    expect(second?.seq).toBeGreaterThan(first?.seq ?? Number.POSITIVE_INFINITY);

    render(<Page />);
    const region = screen.getByRole("status");
    fireEvent.click(screen.getByText("seat"));
    const spanA = region.querySelector("span");
    fireEvent.click(screen.getByText("seat"));
    const spanB = region.querySelector("span");

    expect(spanA).not.toBeNull();
    expect(spanB).not.toBeNull();
    expect(spanB).not.toBe(spanA); // DOM identity changed: the keyed span remounted
    expect(spanB?.textContent).toBe("Seated.");
  });

  it("two announce calls in one tick keep the last (B3.1 seam)", () => {
    const { result } = renderHook(() => useStatusMessage());

    act(() => {
      result.current.announce("First.");
      result.current.announce("Second.");
    });
    expect(result.current.status?.text).toBe("Second.");

    render(<Page />);
    fireEvent.click(screen.getByText("twice"));
    expect(screen.getByRole("status").textContent).toBe("Second.");
  });

  it("announce is referentially stable across renders", () => {
    const { result, rerender } = renderHook(() => useStatusMessage());
    const announce = result.current.announce;

    act(() => result.current.announce("Seated."));
    rerender();

    expect(result.current.announce).toBe(announce);
  });

  it("hides the region visually with the srOnly clip pattern, not display:none", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../components/LiveStatus.module.css"),
      "utf-8"
    );
    const rule = css.match(/\.visuallyHidden\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
  });
});
