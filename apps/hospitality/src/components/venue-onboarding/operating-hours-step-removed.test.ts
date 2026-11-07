import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = "operating-hours-step-removed.test.ts";

function sourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && entry.name !== SELF ? [full] : [];
  });
}

/**
 * The wizard's hours step is QuickSetupHoursStep (asserted end to end in
 * pages/VenueOnboardingPage.test.tsx: the quick-setup card renders on step 3). The per-day
 * OperatingHoursStep it replaced was deleted; this guard keeps it from creeping back.
 */
describe("OperatingHoursStep removal", () => {
  it("leaves nothing under src importing or naming OperatingHoursStep / validateOperatingHours", () => {
    const offenders = sourceFiles(SRC_ROOT).filter((file) =>
      /OperatingHoursStep|validateOperatingHours/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("wires the wizard's hours step to QuickSetupHoursStep", () => {
    const page = readFileSync(join(SRC_ROOT, "pages", "VenueOnboardingPage.tsx"), "utf8");
    expect(page).toContain("<QuickSetupHoursStep");
  });
});
