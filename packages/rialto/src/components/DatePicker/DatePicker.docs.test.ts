import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { datePickerCatalogMeta } from "./DatePicker.catalog";

const componentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(componentDir, "DatePicker.tsx"), "utf-8");

describe("DatePicker date-value vocabulary docs (ADR-024)", () => {
  it("documents the ISO-string value contract and references ADR-024", () => {
    // DatePickerProps.value ships as `string | null` (ISO yyyy-mm-dd) — the
    // component doc must state that type and cite the ADR that resolved it.
    expect(source).toContain("ADR-024");
    expect(source).toMatch(/yyyy-mm-dd/);
  });

  it("catalog description matches the shipped ISO-string prop type", () => {
    expect(datePickerCatalogMeta.description).toMatch(/yyyy-mm-dd ISO string/);
  });
});
