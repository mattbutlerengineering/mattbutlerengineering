import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineSkeleton } from "./TimelineSkeleton.js";

describe("TimelineSkeleton (A9.1 skeleton half)", () => {
  it("is one busy status region carrying the hidden loading text and no count", () => {
    render(<TimelineSkeleton />);
    const region = screen.getByTestId("timeline-skeleton");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-busy", "true");

    const text = screen.getByText("Loading tonight's grid…");
    expect(region).toContainElement(text);
    expect(text).toHaveClass("visuallyHidden");
    expect(region.textContent).toBe("Loading tonight's grid…");
    expect(region.textContent).not.toMatch(/\d/);
  });

  it("draws a 40 px header row and five 60 px rows as aria-hidden bars", () => {
    const { container } = render(<TimelineSkeleton />);
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]'));
    expect(bars.map((bar) => bar.style.height)).toEqual([
      "40px",
      "60px",
      "60px",
      "60px",
      "60px",
      "60px",
    ]);
  });

  it("hides the text with the srOnly clip pattern, not display:none", () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "TimelineSkeleton.module.css"),
      "utf-8"
    );
    const rule = css.match(/\.visuallyHidden\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
    expect(rule).not.toMatch(/display:\s*none/);
  });
});
