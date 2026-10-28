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

  it("repairs a LineChart into a BarChart so an unknown chart still renders", () => {
    const spec: Spec = {
      root: "line",
      elements: {
        line: {
          type: "LineChart",
          props: {
            label: "Losses",
            data: [
              { label: "A", value: -50 },
              { label: "B", value: "NaN" },
            ],
          },
          children: [],
        },
      },
    };
    const next = normalizeGeneratedSpec(spec);
    expect(next.elements.line?.type).toBe("BarChart");
    expect(next.elements.line?.props).toMatchObject({ label: "Losses" });
  });

  it("turns an Image into an avatar plus the alt text, so a broken src still says what it was", () => {
    const spec: Spec = {
      root: "pic",
      elements: {
        pic: {
          type: "Image",
          props: { src: "https://example.invalid/a.png", alt: "Broken hero" },
          children: [],
        },
      },
    };
    const next = normalizeGeneratedSpec(spec);
    expect(next.elements.pic?.type).toBe("Stack");
    const caption = Object.values(next.elements).find(
      (element) => element?.type === "Text" && element.props?.children === "Broken hero"
    );
    const avatar = Object.values(next.elements).find((element) => element?.type === "Avatar");
    expect(caption).toBeDefined();
    expect(avatar?.props).toMatchObject({
      src: "https://example.invalid/a.png",
      alt: "Broken hero",
    });
  });
});
