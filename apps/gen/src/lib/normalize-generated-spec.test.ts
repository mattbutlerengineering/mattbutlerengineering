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

  it("rejects plain-number lists that are not money or percent series", () => {
    expect(parseTrendPoints("Jan 15, Feb 20, Mar 10")).toBeNull();
  });

  it("accepts percent series", () => {
    expect(parseTrendPoints("Jan 12% · Feb 15% · Mar 18%")).toHaveLength(3);
  });

  it("rejects ordinary sentences", () => {
    expect(parseTrendPoints("Revenue trend")).toBeNull();
    expect(parseTrendPoints("Last 6 months")).toBeNull();
  });
});

describe("normalizeGeneratedSpec", () => {
  it("replaces a non-array Table data binding with sample rows (playground only)", () => {
    const spec: Spec = {
      root: "t",
      elements: {
        t: {
          type: "Table",
          props: { columns: [{ key: "name", header: "Name" }], data: { $state: "/users" } },
          children: [],
        },
      },
    };
    const next = normalizeGeneratedSpec(spec);
    expect((next.elements.t?.props as { data: unknown[] }).data).toHaveLength(8);
    expect(spec.elements.t?.props.data).toEqual({ $state: "/users" });
  });

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

  it("mounts a DataTable the tree never linked and a state gate had hidden", () => {
    const spec = {
      root: "stack",
      elements: {
        stack: { type: "Stack", props: { direction: "column" }, children: ["title"] },
        title: { type: "Text", props: { children: "Users" }, children: [] },
        note: { type: "Text", props: { children: "Sample" }, children: [] },
        table: {
          type: "DataTable",
          props: {
            columns: [{ key: "name", header: "Name" }],
            data: [{ name: "Ada Lovelace" }],
          },
          children: ["note"],
          visible: { $state: "/loaded" },
        },
      },
    } as Spec;

    const next = normalizeGeneratedSpec(spec);
    expect(next.elements.stack?.children).toEqual(["title", "table"]);
    expect(next.elements.table && "visible" in next.elements.table).toBe(false);
    expect(next.elements.note && "visible" in (next.elements.note ?? {})).toBe(false);
    // The note stays under the table, not as a second root child.
    expect(next.elements.stack?.children).not.toContain("note");
    expect(spec.elements.stack?.children).toEqual(["title"]);
  });
});
