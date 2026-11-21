/// <reference types="node" />
// @vitest-environment node
/**
 * Landing-page motion vocabulary guard.
 *
 * The landing choreography is meant to read as one motion system: every
 * transition on it borrows its duration and easing from the Rialto motion
 * tokens (`--rialto-duration-*`, `--rialto-ease-*`). A hand-written `150ms`
 * or `ease` is not a CSS error — it just quietly desyncs one section from
 * the rest, which no linter catches. This test reads the landing sections'
 * stylesheets and fails on any timing value that is not a token.
 *
 * Scope is deliberately the landing page only: it is the surface issue #3512
 * choreographs, and the other pages carry their own (untouched) timings.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Stylesheets behind the landing sections rendered by `HomePage`. */
const LANDING_STYLESHEETS = [
  "pages/HomePage.module.css",
  "components/HeroSection.module.css",
  "components/ProjectCard.module.css",
  "components/factory/FactorySection.module.css",
] as const;

/** `transition: …;` / `animation: …;` declarations, value only. */
const TIMED_DECLARATION = /\b(?:transition|animation)(?:-duration|-timing-function)?:([^;}]*)[;}]/g;

/** Bare durations (`150ms`, `0.15s`) and bare easings (`ease-out`, `cubic-bezier(…)`). */
const AD_HOC_TIMING = /\b\d*\.?\d+m?s\b|\bcubic-bezier\s*\(|\b(?:linear|ease(?:-in)?(?:-out)?)\b/;

/** Token references read as `ease`/`s`-free once collapsed away. */
function stripTokenReferences(value: string): string {
  return value.replace(/var\(\s*--rialto-[\w-]+\s*\)/g, "");
}

function findAdHocTimings(css: string): string[] {
  return [...css.matchAll(TIMED_DECLARATION)]
    .map((match) => match[1] ?? "")
    .filter((value) => AD_HOC_TIMING.test(stripTokenReferences(value)))
    .map((value) => value.replace(/\s+/g, " ").trim());
}

describe("landing-page motion vocabulary", () => {
  it.each(LANDING_STYLESHEETS)("takes every timing in %s from Rialto motion tokens", (file) => {
    const css = readFileSync(join(SRC_DIR, file), "utf-8");
    expect(findAdHocTimings(css)).toEqual([]);
  });
});
