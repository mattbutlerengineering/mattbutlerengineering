import { readFileSync } from "node:fs";
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

  it("does not let a suffixed duplicate of the first month flatten the rest of the series", () => {
    // Live dashboard: one huge "Jan $142k" bar, then Jan–Jun at 142…203 drawn as slivers.
    const mixed = [
      { label: "Jan", value: "$142k" },
      { label: "Jan", value: 142 },
      { label: "Feb", value: 158 },
      { label: "Mar", value: 171 },
      { label: "Apr", value: 165 },
      { label: "May", value: 183 },
      { label: "Jun", value: 203 },
    ];
    const { container } = render(<BarChart label="Monthly revenue" data={mixed} />);
    expect(screen.getAllByText("Jan")).toHaveLength(1);
    expect(screen.queryByText("$142k")).toBeNull();
    expect(screen.getByText("203")).toBeDefined();
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"))
      .map((size) => Number(size.slice(0, -1)));
    expect(heights).toHaveLength(6);
    expect(Math.min(...heights)).toBeGreaterThan(50);
    expect(heights).toContain(100);
  });

  it("drops a first bar whose tick is the suffixed spelling of the next month", () => {
    const mixed = [
      { label: "Jan $142k", value: "$142k" },
      { label: "Jan", value: 142 },
      { label: "Feb", value: 158 },
      { label: "Mar", value: 171 },
      { label: "Apr", value: 165 },
      { label: "May", value: 183 },
      { label: "Jun", value: 203 },
    ];
    const { container } = render(<BarChart label="Monthly revenue" data={mixed} />);
    expect(screen.queryByText("Jan $142k")).toBeNull();
    expect(screen.getAllByText("Jan")).toHaveLength(1);
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"))
      .map((size) => Number(size.slice(0, -1)));
    expect(heights).toHaveLength(6);
    expect(Math.min(...heights)).toBeGreaterThan(50);
  });
});

describe("BarChart.module.css tokens", () => {
  it("only references radius tokens that exist", () => {
    const css = readFileSync("src/components/BarChart/BarChart.module.css", "utf8");
    const radii = readFileSync("src/tokens/radius.css", "utf8");
    for (const [, token] of css.matchAll(/var\((--rialto-radius-[a-z-]+)\)/g)) {
      expect(radii).toContain(`${token}:`);
    }
  });
});
