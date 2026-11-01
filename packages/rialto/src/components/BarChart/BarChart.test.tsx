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

  it("keeps same-first-word bars at the same plain scale", () => {
    const { container } = render(
      <BarChart
        label="Quarterly"
        data={[
          { label: "Q1", value: 50 },
          { label: "Q1 target", value: 50 },
          { label: "Q2", value: 60 },
        ]}
      />
    );
    expect(screen.getByText("Q1 target")).toBeDefined();
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"));
    expect(heights).toHaveLength(3);
  });

  it("keeps same-first-word bars at the same suffixed scale", () => {
    const { container } = render(
      <BarChart
        label="Revenue"
        data={[
          { label: "Jan", value: "$12k" },
          { label: "Jan 2024", value: "$12k" },
        ]}
      />
    );
    expect(screen.getByText("Jan 2024")).toBeDefined();
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"));
    expect(heights).toHaveLength(2);
  });

  it("keeps a real k suffix far taller than a small unsuffixed amount", () => {
    const { container } = render(
      <BarChart
        label="Mixed units"
        data={[
          { label: "Fee", value: "$40" },
          { label: "Revenue", value: "$20k" },
        ]}
      />
    );
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"))
      .map((size) => Number(size.slice(0, -1)));
    expect(heights).toContain(100);
    const shortest = Math.min(...heights);
    const tallest = Math.max(...heights);
    expect(tallest / shortest).toBeGreaterThan(20);
  });

  it("does not let a same-number suffixed total flatten a plain monthly series", () => {
    const mixed = [
      { label: "Total", value: "$142k" },
      { label: "Jan", value: 142 },
      { label: "Feb", value: 158 },
      { label: "Mar", value: 171 },
      { label: "Apr", value: 165 },
      { label: "May", value: 183 },
      { label: "Jun", value: 203 },
    ];
    const { container } = render(<BarChart label="Monthly revenue" data={mixed} />);
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText("$142k")).toBeDefined();
    const heights = Array.from(container.querySelectorAll("span"))
      .map((bar) => bar.style.blockSize)
      .filter((size) => size.endsWith("%"))
      .map((size) => Number(size.slice(0, -1)));
    expect(heights).toHaveLength(7);
    expect(Math.min(...heights)).toBeGreaterThan(50);
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
      `${(12 / 3_400_000) * 100}%`,
      "100%",
      `${(8 / 3_400_000) * 100}%`,
      `${(1500 / 3_400_000) * 100}%`,
    ]);
  });

  it("scales a k/m/b suffix only when it directly follows the number", () => {
    const heightsFor = (values: string[]) => {
      const { container, unmount } = render(
        <BarChart label="Units" data={values.map((value, i) => ({ label: `L${i}`, value }))} />
      );
      const heights = Array.from(container.querySelectorAll("span"))
        .map((bar) => bar.style.blockSize)
        .filter((size) => size.endsWith("%"));
      unmount();
      return heights;
    };
    // Each value is paired with a 1000000 anchor so the bar height reveals its parsed size.
    const parsed = (value: string) => {
      const [, height] = heightsFor(["1000000", value]);
      return (Number.parseFloat(height ?? "0") / 100) * 1_000_000;
    };
    expect(parsed("5 per week")).toBeCloseTo(5);
    expect(parsed("3 per month")).toBeCloseTo(3);
    expect(parsed("8 sales")).toBeCloseTo(8);
    expect(parsed("12 kg")).toBeCloseTo(12);
    expect(parsed("12 k")).toBeCloseTo(12000);
    expect(parsed("$20k")).toBeCloseTo(20000);
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
