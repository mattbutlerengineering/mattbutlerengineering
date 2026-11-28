import { describe, expect, it } from "vitest";
import { findCanvasVendorLeaks } from "./check-canvas-vendor-isolation.mjs";

const CLEAN_HTML =
  '<script type="module" src="/hospitality/assets/index-Ab12.js"></script>' +
  '<link rel="modulepreload" href="/hospitality/assets/react-vendor-Cd34.js">';

describe("findCanvasVendorLeaks", () => {
  it("passes when nothing preloads or statically imports canvas-vendor", () => {
    const leaks = findCanvasVendorLeaks({
      indexHtml: CLEAN_HTML,
      chunks: {
        "index-Ab12.js":
          'import{a}from"./react-vendor-Cd34.js";const L=()=>import("./canvas-vendor-Zz9.js");',
        "floor-plan-Qq1.js": 'import{Stage}from"./canvas-vendor-Zz9.js";',
        "canvas-vendor-Zz9.js": "export{x as Stage};",
      },
    });
    expect(leaks).toEqual([]);
  });

  it("reports a modulepreload of canvas-vendor in index.html", () => {
    const leaks = findCanvasVendorLeaks({
      indexHtml:
        CLEAN_HTML +
        '<link rel="modulepreload" crossorigin href="/hospitality/assets/canvas-vendor-Zz9.js">',
      chunks: {},
    });
    expect(leaks).toEqual([expect.stringContaining("index.html")]);
  });

  it("reports a non-floor-plan chunk that statically imports canvas-vendor", () => {
    const leaks = findCanvasVendorLeaks({
      indexHtml: CLEAN_HTML,
      chunks: {
        "react-vendor-Cd34.js": 'import{Stage}from"./canvas-vendor-Zz9.js";export{Stage};',
      },
    });
    expect(leaks).toEqual([expect.stringContaining("react-vendor-Cd34.js")]);
  });

  it("reports bare side-effect and re-export static imports", () => {
    const leaks = findCanvasVendorLeaks({
      indexHtml: CLEAN_HTML,
      chunks: {
        "a-1.js": 'import"./canvas-vendor-Zz9.js";',
        "b-2.js": 'export*from"./canvas-vendor-Zz9.js";',
        "c-3.js": "import { Stage } from './canvas-vendor-Zz9.js';",
      },
    });
    expect(leaks).toHaveLength(3);
  });

  it("does not flag dynamic imports", () => {
    const leaks = findCanvasVendorLeaks({
      indexHtml: CLEAN_HTML,
      chunks: { "FloorPlanEditorPage-1.js": 'const m=()=>import("./canvas-vendor-Zz9.js");' },
    });
    expect(leaks).toEqual([]);
  });
});
