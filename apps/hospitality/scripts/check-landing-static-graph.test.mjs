import { describe, expect, it } from "vitest";
import { findLandingGraphLeaks } from "./check-landing-static-graph.mjs";

const HTML =
  '<script type="module" src="/hospitality/assets/index-Ab12.js"></script>' +
  '<link rel="modulepreload" href="/hospitality/assets/react-vendor-Cd34.js">';

describe("findLandingGraphLeaks", () => {
  it("passes when json-render and the venue hooks are only dynamically imported", () => {
    const leaks = findLandingGraphLeaks({
      indexHtml: HTML,
      chunks: {
        "index-Ab12.js":
          'import{a}from"./react-vendor-Cd34.js";const L=()=>import("./ShowcaseLanding-1.js");const D=()=>import("./DashboardLayout-2.js");',
        "react-vendor-Cd34.js": "export{a};",
        "DashboardLayout-2.js": 'import"./json-render-vendor-Zz9.js";import"./VenueContext-Q1.js";',
      },
    });
    expect(leaks).toEqual([]);
  });

  it("reports json-render-vendor reached through a shared chunk", () => {
    const leaks = findLandingGraphLeaks({
      indexHtml: HTML,
      chunks: {
        "index-Ab12.js": 'import{a}from"./venue-context-object-X1.js";',
        "venue-context-object-X1.js": 'import{z}from"./json-render-vendor-Zz9.js";',
        "json-render-vendor-Zz9.js": "export{z};",
      },
    });
    expect(leaks).toEqual([
      expect.stringContaining("venue-context-object-X1.js"),
      expect.stringContaining("json-render-vendor-Zz9.js"),
    ]);
  });

  it("reports the venue hooks and a forbidden chunk that is only modulepreloaded", () => {
    const leaks = findLandingGraphLeaks({
      indexHtml: HTML + '<link rel="modulepreload" href="/hospitality/assets/useVenueTeam-K9.js">',
      chunks: { "index-Ab12.js": 'import"./VenueContext-Q1.js";export*from"./useMutation-M2.js";' },
    });
    expect(leaks).toHaveLength(3);
  });
});
