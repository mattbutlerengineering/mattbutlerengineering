import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { load } from "js-yaml";

const workflow = load(
  readFileSync(new URL("../../.github/workflows/gen-live-smoke.yml", import.meta.url), "utf8")
);
const step = Object.values(workflow.jobs)
  .flatMap((j) => j.steps)
  .find((s) => s.name === "Repeat generation (spec-cache path)");

// Runs the real "Repeat generation" step with curl stubbed to write `second`
// as the replay body, against `first` as the original generation.
function runRepeatStep(first, second) {
  const dir = mkdtempSync(join(tmpdir(), "gen-smoke-"));
  writeFileSync(join(dir, "gen1.ndjson"), first);
  writeFileSync(join(dir, "second.ndjson"), second);
  writeFileSync(join(dir, "body.json"), "{}");
  const curl = join(dir, "curl");
  writeFileSync(
    curl,
    `#!/bin/bash\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && out=$2; shift; done\ncp "${dir}/second.ndjson" "$out"\nprintf 200\n`
  );
  chmodSync(curl, 0o755);
  const r = spawnSync("bash", ["-c", step.run], {
    cwd: dir,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, API_URL: "x", GEN_SMOKE_TOKEN: "t" },
    encoding: "utf8",
  });
  return r.stdout + r.stderr;
}

describe("gen-live-smoke repeat step cache check", () => {
  it("reports a HIT when jsonb reordered keys but content is identical", () => {
    const out = runRepeatStep('{"key":"a","type":"b"}\n', '{"type":"b","key":"a"}\n');
    expect(out).toContain("cache HIT");
    expect(out).not.toContain("::warning::");
  });

  it("still warns when the second generation genuinely differs", () => {
    const out = runRepeatStep('{"key":"a","type":"b"}\n', '{"key":"a","type":"c"}\n');
    expect(out).toContain("::warning::");
  });
});
