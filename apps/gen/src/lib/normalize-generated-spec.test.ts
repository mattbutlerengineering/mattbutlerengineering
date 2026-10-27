import { describe, expect, it } from "vitest";
import type { Spec } from "@json-render/react";
import { normalizeGeneratedSpec, parseTrendPoints } from "./normalize-generated-spec.js";

const SERIES = "Jan $18.2k · Feb $19.9k · Mar $21.4k · Apr $22.8k · May $24.1k · Jun $22.0k";

describe("parseTrendPoints", () => {
  it("parses a month-and-money series", () => {
    expect(parseTrendPoints(SERIES)?.map((point) => point.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
    ]);
    expect(parseTrendPoints(SERIES)?.[0]).toEqual({ label: "Jan", value: "$18.2k" });
  });

  it("rejects ordinary sentences", () => {
    expect(parseTrendPoints("Revenue trend")).toBeNull();
    expect(parseTrendPoints("Last 6 months")).toBeNull();
  });
});

describe("normalizeGeneratedSpec", () => {
  it("turns a trend sentence into a BarChart and leaves the heading", () => {
    const spec: Spec = {
      root: "card",
      elements: {
        card: { type: "Card", props: { title: "Revenue trend" }, children: ["title", "series"] },
        title: { type: "Text", props: { children: "Revenue trend" }, children: [] },
        series: { type: "Text", props: { text: SERIES }, children: [] },
      },
    };

    const next = normalizeGeneratedSpec(spec);
    expect(next.elements.title?.type).toBe("Text");
    expect(next.elements.series?.type).toBe("BarChart");
    expect(next.elements.series?.props).toMatchObject({
      label: "Trend",
      data: expect.arrayContaining([{ label: "Jun", value: "$22.0k" }]),
    });
    expect(spec.elements.series?.type).toBe("Text");
  });
});
