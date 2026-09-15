import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiStat } from "./KpiStat.js";

// Real rialto `Stat` on purpose: the contract under test is that the override reaches the
// `role="group"` element only when the value is nullish.
describe("KpiStat", () => {
  it.each([null, undefined])(
    "renders a dash and speaks 'unavailable' when value is %s",
    (value) => {
      render(<KpiStat label="Total" value={value} />);

      const group = screen.getByRole("group", { name: "Total, unavailable" });
      expect(group).toHaveTextContent("—");
      expect(group).toHaveTextContent("Total");
    }
  );

  it("leaves Stat's own label untouched when a number is present", () => {
    render(<KpiStat label="Total" value={12} />);

    const group = screen.getByRole("group", { name: "Total" });
    expect(group).toHaveTextContent("12");
    expect(group).not.toHaveTextContent("—");
    expect(screen.queryByRole("group", { name: /unavailable/ })).toBeNull();
  });

  it("treats 0 as a real value, not as unavailable", () => {
    render(<KpiStat label="Cancelled" value={0} />);

    expect(screen.getByRole("group", { name: "Cancelled" })).toHaveTextContent("0");
  });

  it("accepts a preformatted string value", () => {
    render(<KpiStat label="Covers" value="48 / 60" />);

    expect(screen.getByRole("group", { name: "Covers" })).toHaveTextContent("48 / 60");
  });
});
