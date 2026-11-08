import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { Layer } from "@mbe/availability";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { layerLabelText } from "./layer-text.js";

const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
const format = { formatLocalTime: (time: string) => time } as unknown as VenueFormat;

const closure = (sectionId?: string): Layer =>
  ({
    kind: "closure",
    label: "Tables blocked",
    effect: "All day",
    target: { kind: "tables", ...(sectionId ? { sectionId } : {}) },
  }) as Layer;

describe("layerLabelText for a section closure (ADR-032)", () => {
  const names = new Map([["sec-bar", "Bar"]]);

  it("names the section", () => {
    expect(layerLabelText(closure("sec-bar"), t, format, names)).toBe(
      "availability.drawer.layer.sectionClosed Bar"
    );
  });

  it("says tables are blocked without a known section name, or for plain tables", () => {
    expect(layerLabelText(closure("sec-bar"), t, format)).toBe(
      "availability.drawer.layer.tablesBlocked"
    );
    expect(layerLabelText(closure(), t, format, names)).toBe(
      "availability.drawer.layer.tablesBlocked"
    );
  });
});
