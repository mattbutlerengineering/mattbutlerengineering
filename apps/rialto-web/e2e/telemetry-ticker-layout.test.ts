/**
 * DepartureBoard stretches to its parent and centers its flaps by default so
 * the container-query fit has a definite width. The telemetry event feed
 * reads from the start, and its visual baselines are left-aligned, so it has
 * to opt back out; otherwise the ticker shifts into the middle of the strip.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../src/pages/telemetry/Telemetry.module.css"),
  "utf8"
);

describe("telemetry event ticker", () => {
  it("start-aligns the DepartureBoard flaps", () => {
    expect(CSS).toMatch(/\.ticker\s+\.tickerBoard\s*\{[^}]*justify-content:\s*flex-start/);
  });
});
