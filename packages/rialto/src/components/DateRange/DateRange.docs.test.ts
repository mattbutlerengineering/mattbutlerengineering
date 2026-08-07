import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dateRangeCatalogMeta } from "./DateRange.catalog";

const componentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(componentDir, "DateRange.tsx"), "utf-8");

describe("DateRange date-value vocabulary docs (ADR-024)", () => {
  it("documents the ISO-string value contract and references ADR-024", () => {
    // DateRangeValue.start/end ship as `string | null` (ISO yyyy-mm-dd) since
    // the #3839 migration off `Date` — the component doc must state that type
    // and cite the ADR that resolved the cross-component boundary.
    expect(source).toContain("ADR-024");
    expect(source).toMatch(/yyyy-mm-dd/);
  });

  it("catalog description matches the shipped ISO-string prop type, not Date", () => {
    expect(dateRangeCatalogMeta.description).toMatch(/yyyy-mm-dd ISO strings/);
  });
});
