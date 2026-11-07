/**
 * #8419: live-sweep.sh must leave a results file the coverage recorder can
 * read — it is the only tracked path from the sweep to "zone recorded".
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACE_REGISTRY } from "@mbe/agent-core";
import { buildAuditCoverageRow, parseSweepResults } from "../audit-coverage.mjs";

const script = fileURLToPath(new URL("../audit/live-sweep.sh", import.meta.url));

describe("live-sweep.sh results file", () => {
  it("records one line per surface that covers every zone, including auth0 gen", () => {
    const dir = mkdtempSync(join(tmpdir(), "sweep-"));
    const curl = join(dir, "curl");
    writeFileSync(curl, "#!/bin/sh\necho '200 0.10'\n");
    chmodSync(curl, 0o755);
    const out = join(dir, "results.tsv");

    const run = spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        SWEEP_RESULTS_FILE: out,
        AUDIT_TOKEN: "",
      },
    });
    expect(run.status).toBe(0);

    const results = parseSweepResults(readFileSync(out, "utf8"));
    const row = buildAuditCoverageRow(
      results,
      { date: "2026-11-07", commit: "x" },
      SURFACE_REGISTRY
    );
    expect(row.surfaces.find((s) => s.id === "gen:playground").status).toBe("auth-gated");
    for (const zone of Object.keys(row.zones)) {
      if (zone === "hospitality") continue; // only /hospitality home is swept; still >0
      expect(row.zones[zone].recorded, zone).toBeGreaterThan(0);
    }
    expect(row.zones.hospitality.recorded).toBeGreaterThan(0);
  });
});
