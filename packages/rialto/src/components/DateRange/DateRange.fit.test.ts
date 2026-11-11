/**
 * The month grid is seven fixed 34px columns. Inside a padded card at 375px
 * that grid is wider than the card, so Saturday and the range fill paint past
 * the border. The calendar has to stay 34px when it fits and shrink when it
 * doesn't.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DateRange card fit", () => {
  const css = readFileSync(path.join(__dirname, "DateRange.module.css"), "utf8");

  it("caps the calendar at the card and lets the seven columns share that width", () => {
    const calendar = /\.calendar\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    // A definite preferred width: a percentage-based inline-size would make an
    // auto-width parent (the DateRangePicker popover panel) size itself from
    // the shrunken calendar and render 24px cells instead of 34px.
    expect(calendar).toMatch(
      /inline-size:\s*calc\(\s*7 \* var\(--date-range-cell\) \+ 6 \* var\(--date-range-gap\) \+ 2 \* var\(--rialto-space-xs\)\s*\)/
    );
    expect(calendar).not.toMatch(/(?<!max-)inline-size:\s*min\(/);
    expect(calendar).toMatch(/max-inline-size:\s*100%/);
    expect(calendar).toMatch(/box-sizing:\s*border-box/);
    const columns = /\.weekdays,\s*\n\.week\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(columns).toMatch(/grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
    const day = /\.day\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(day).toMatch(/inline-size:\s*100%/);
    expect(day).toMatch(/aspect-ratio:\s*1/);
    const grid = /\.monthGrid\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(grid).toMatch(/inline-size:\s*100%/);
  });
});
