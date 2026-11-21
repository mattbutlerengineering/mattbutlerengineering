/// <reference types="@testing-library/jest-dom/vitest" />
import { expect } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";

expect.extend(jestDomMatchers);

// axe's label-content-name-mismatch (WCAG 2.5.3) measures glyphs on a 2D canvas to skip
// icon-font ligatures. jsdom has no canvas: the rule throws, lands in `incomplete`, and
// every `violations` assertion for it passes vacuously. This stub reports ordinary text
// (width grows with length, uniform ink), so the rule evaluates names the way it does in
// a browser for text fonts. Pinned by src/test/axe-label-in-name.test.tsx.
// Node-environment test files (no DOM) have no HTMLCanvasElement to stub.
const LIGATURE_FREE_CONTEXT_KEY = Symbol("ligature-free-2d-context");
type CanvasWithStub = HTMLCanvasElement & { [LIGATURE_FREE_CONTEXT_KEY]?: object };
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext =
    ligatureFreeGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
function ligatureFreeGetContext(this: CanvasWithStub) {
  this[LIGATURE_FREE_CONTEXT_KEY] ??= {
    canvas: this,
    font: "",
    textAlign: "left",
    textBaseline: "top",
    measureText: (text: string) => ({ width: 10 * text.length }),
    fillText: () => {},
    clearRect: () => {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, Math.ceil(width) * Math.ceil(height)) * 4).fill(1),
    }),
  };
  return this[LIGATURE_FREE_CONTEXT_KEY];
}

// Initialise the app's i18next instance so components render en-US text in tests.
import "../i18n/runtime.js";
