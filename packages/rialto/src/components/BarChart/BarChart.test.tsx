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

  it("draws negative values down from a zero baseline and skips non-finite ones", () => {
    const { container } = render(
      <BarChart
        label="Mixed values"
        data={[
          { label: "A", value: -50 },
          { label: "B", value: "NaN" },
          { label: "C", value: 20 },
          { label: "D", value: "null" },
          { label: "E", value: -300 },
          { label: "F", value: "Infinity" },
          { label: "G", value: "1e999" },
        ]}
      />
    );
    const negative = container.querySelectorAll("[data-sign='negative']");
    const positive = container.querySelectorAll("[data-sign='positive']");
    expect(negative).toHaveLength(2);
    expect(positive).toHaveLength(1);
    expect(container.querySelectorAll("[data-bar='missing']")).toHaveLength(4);
    const down = Number.parseFloat((negative[0] as HTMLElement).style.blockSize);
    const further = Number.parseFloat((negative[1] as HTMLElement).style.blockSize);
    expect(further).toBeGreaterThan(down);
    expect(container.querySelector("[class*='baseline']")).not.toBeNull();
  });

  it("reads a value with a word containing 'e' by its digits, and real exponent notation", () => {
    const { container } = render(
      <BarChart
        label="Units"
        data={[
          { label: "A", value: "12 tickets" },
          { label: "C", value: "$3.4M revenue" },
          { label: "D", value: "8 sales" },
          { label: "E", value: "1.5e3" },
        ]}
      />
    );
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"));
    expect(heights).toEqual([
      `${(12 / 1500) * 100}%`,
      `${(3.4 / 1500) * 100}%`,
      `${(8 / 1500) * 100}%`,
      "100%",
    ]);
  });

  it("draws a bar for '5 per week' instead of dropping it as non-finite", () => {
    const { container } = render(
      <BarChart label="Cadence" data={[{ label: "A", value: "5 per week" }]} />
    );
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"));
    expect(heights).toEqual(["100%"]);
  });

  it("does not turn Infinity or 1e999 into a bar when the rest of the series is positive", () => {
    const { container } = render(
      <BarChart
        label="Spikes"
        data={[
          { label: "A", value: 20 },
          { label: "B", value: Number.POSITIVE_INFINITY },
          { label: "C", value: "1e999" },
        ]}
      />
    );
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"));
    expect(heights).toEqual(["100%"]);
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
