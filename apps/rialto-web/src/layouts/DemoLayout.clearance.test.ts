import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const compact = (s: string) => s.replace(/\s+/g, "");

describe("DemoLayout reserves the floating-controls band by default (#8885)", () => {
  const shell = compact(read("layouts/DemoLayout.module.css"));

  it("pads the main landmark by the clearance token", () => {
    expect(shell).toMatch(/\.main\{[^}]*padding-block-start:var\(--demo-controls-clearance\)/);
  });

  it("resets the PageHeader alias so header routes are not padded twice", () => {
    expect(shell).toMatch(/--rialto-page-header-padding-block-start:0px/);
    expect(shell).not.toMatch(/--rialto-page-header-padding-block-start:var\(/);
  });

  it("no demo route copies the clearance by hand", () => {
    for (const rel of [
      "pages/auth/AuthFlowPage.module.css",
      "pages/drivers/DriverLayout.module.css",
      "pages/visual-test/VisualTest.module.css",
    ]) {
      expect(read(rel), rel).not.toContain("--demo-controls-clearance");
    }
  });

  it("telemetry no longer hardcodes its own band offset", () => {
    expect(compact(read("pages/telemetry/Telemetry.module.css"))).not.toContain(
      "padding-block-start:calc(var(--rialto-space-4xl)+var(--rialto-space-lg))"
    );
  });
});
