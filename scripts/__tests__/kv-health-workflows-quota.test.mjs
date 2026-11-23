import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const TOKEN = "sekret-token-value-123";

/**
 * synthetic-monitoring.yml and uptime-snapshot.yml write to Workers KV with
 * plain curl. A spent free-tier write quota answers HTTP 429 (error 10048,
 * #9234); with `curl -sf` that exits 22 and turns the workflow red. Each KV
 * write step must treat 429 as a ::warning:: and carry on; any other non-2xx
 * must still fail. Steps are extracted textually and run against a stub curl.
 */
const STEPS = [
  {
    file: ".github/workflows/synthetic-monitoring.yml",
    name: "Record latency samples to KV",
    env: {
      HEALTH_RESPONSE: JSON.stringify({
        subsystems: { services: { checks: { api: { latency: 5, status: "healthy" } } } },
      }),
    },
  },
  {
    file: ".github/workflows/synthetic-monitoring.yml",
    name: "Notify webhook on status change",
    env: {
      WEBHOOK_URL: "https://hooks.example.test/x",
      CURRENT_STATUS: "healthy",
      HEALTH_RESPONSE: "{}",
    },
  },
  {
    file: ".github/workflows/synthetic-monitoring.yml",
    name: "Record status transition to KV",
    env: { CURRENT_STATUS: "healthy" },
  },
  {
    file: ".github/workflows/uptime-snapshot.yml",
    name: "Write snapshot to KV",
    env: { SNAPSHOT_DATE: "2026-11-22", HEALTH_DATA: '{"status":"healthy"}' },
  },
];

function stepRunBlock(source, stepName) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  if (start < 0) throw new Error(`no step named ${stepName}`);
  const runAt = lines.findIndex((l, i) => i > start && /^\s+run: \|\s*$/.test(l));
  const indent = lines[runAt + 1].match(/^\s*/)[0].length;
  const block = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== "" && line.match(/^\s*/)[0].length < indent) break;
    block.push(line.slice(indent));
  }
  return block.join("\n");
}

let dir;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "kv-quota-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let stubSeq = 0;
/** Stub curl: PUT/DELETE answer `write`; every other call answers `read`. */
function stubCurl(write, read = { code: 404, body: "" }) {
  const bin = join(dir, `bin-${stubSeq++}`);
  const script = [
    "#!/usr/bin/env bash",
    'out=""; verb=GET',
    "while [ $# -gt 0 ]; do",
    '  if [ "$1" = "-o" ]; then out="$2"; shift; fi',
    '  if [ "$1" = "-w" ]; then wflag=1; fi',
    '  if [ "$1" = "PUT" ] || [ "$1" = "DELETE" ]; then verb=WRITE; fi',
    "  shift",
    "done",
    `if [ "$verb" = WRITE ]; then code='${write.code}'; body='${write.body}'; else code='${read.code}'; body='${read.body}'; fi`,
    '[ -n "$out" ] && printf \'%s\' "$body" > "$out"',
    '[ -n "$wflag" ] && { printf \'%s\' "$code"; exit 0; }',
    '[ -z "$out" ] && printf \'%s\' "$body"',
    "exit 0",
    "",
  ].join("\n");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "curl"), script);
  chmodSync(join(bin, "curl"), 0o755);
  return bin;
}

function run(step, bin) {
  const block = stepRunBlock(readFileSync(resolve(ROOT, step.file), "utf8"), step.name);
  return spawnSync("bash", ["-e", "-c", block], {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CF_ACCOUNT_ID: "acct",
      CF_API_TOKEN: TOKEN,
      KV_NS_ID: "ns",
      ...step.env,
    },
    encoding: "utf8",
  });
}

const quota = {
  code: 429,
  body: JSON.stringify({ success: false, errors: [{ code: 10048, message: "limit reached" }] }),
};

describe.each(STEPS)("$name ($file)", (step) => {
  it("treats a 429/10048 write as a warning and exits 0", () => {
    const res = run(step, stubCurl(quota));
    const out = res.stdout + res.stderr;
    expect(res.status).toBe(0);
    expect(out).toContain("::warning::");
    expect(out).toContain("10048");
    expect(out).not.toContain(TOKEN);
  });

  it("still fails on a 403 write", () => {
    const res = run(
      step,
      stubCurl({ code: 403, body: '{"errors":[{"code":10000,"message":"Authentication error"}]}' })
    );
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).not.toContain(TOKEN);
  });

  it("exits 0 on a 200 write", () => {
    const res = run(step, stubCurl({ code: 200, body: '{"success":true}' }));
    expect(res.status).toBe(0);
  });

  it("enables pipefail", () => {
    const block = stepRunBlock(readFileSync(resolve(ROOT, step.file), "utf8"), step.name);
    expect(block).toMatch(/^\s*set -o pipefail\s*$/m);
  });
});

describe("uptime-snapshot cleanup deletes", () => {
  const file = ".github/workflows/uptime-snapshot.yml";
  const name = "Cleanup old snapshots (>90 days)";
  const list = { code: 200, body: JSON.stringify({ result: [{ name: "uptime/2020-01-01" }] }) };

  function runCleanup(bin) {
    const block = stepRunBlock(readFileSync(resolve(ROOT, file), "utf8"), name);
    return spawnSync("bash", ["-e", "-c", block], {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        CF_ACCOUNT_ID: "acct",
        CF_API_TOKEN: TOKEN,
        KV_NS_ID: "ns",
      },
      encoding: "utf8",
    });
  }

  it("a 429 on DELETE warns and exits 0", () => {
    const res = runCleanup(stubCurl(quota, list));
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toContain("::warning::");
  });

  it("a 403 on DELETE still fails", () => {
    const res = runCleanup(stubCurl({ code: 403, body: "{}" }, list));
    expect(res.status).not.toBe(0);
  });
});
