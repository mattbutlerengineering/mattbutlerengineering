import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";

const data = [
  { label: "Jan", value: "$18.2k" },
  { label: "Feb", value: "$19.9k" },
  { label: "Jun", value: "$22.0k" },
];

describe("BarChart", () => {
  it("renders a caption and one bar per point", () => {
    render(<BarChart label="Revenue trend" data={data} />);
    expect(screen.getByText("Revenue trend")).toBeDefined();
    expect(screen.getByText("Jan")).toBeDefined();
    expect(screen.getByText("$18.2k")).toBeDefined();
    expect(screen.getByText("Jun")).toBeDefined();
    const bars = document.querySelectorAll("[class*='bar']");
    expect(bars.length).toBeGreaterThanOrEqual(3);
  });

  it("scales the tallest formatted value to the full plot", () => {
    const { container } = render(<BarChart label="Revenue trend" data={data} />);
    const bars = container.querySelectorAll("span");
    const heights = Array.from(bars)
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"));
    expect(heights).toContain("100%");
    expect(heights).toContain(`${(18.2 / 22) * 100}%`);
  });
});
