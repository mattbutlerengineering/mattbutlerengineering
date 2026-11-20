import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const TOKEN = "sekret-token-value-123";

/**
 * Both Cloudflare KV health writers inline the same curl block (neither job
 * checks out the repo, so a shared script is not reachable). This pins both:
 * the blocks are extracted textually and executed against a stubbed curl.
 */
const SITES = [
  {
    name: "ci.yml report-health",
    file: ".github/workflows/ci.yml",
    env: {
      GH_RUN_ID: "42",
      GH_REF_NAME: "main",
      GH_SHA: "abc123",
      LINT_RESULT: "success",
      TYPECHECK_RESULT: "success",
      BUILD_RESULT: "success",
      TEST_RESULT: "success",
      MIGRATIONS_RESULT: "success",
    },
  },
  {
    name: "report-deploy-health action",
    file: ".github/actions/report-deploy-health/action.yml",
    env: {
      KV_KEY: "deploy/services",
      DEPLOY_RESULT: "success",
      VERIFY_RESULT: "success",
      ROLLBACK_RESULT: "",
      APPS_DEPLOYED: "",
      GH_SHA: "abc123",
    },
  },
];

function kvRunBlock(source) {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s+run: \|\s*$/.test(lines[i])) continue;
    const indent = lines[i + 1].match(/^\s*/)[0].length;
    const block = [];
    for (const line of lines.slice(i + 1)) {
      if (line.trim() !== "" && line.match(/^\s*/)[0].length < indent) break;
      block.push(line.slice(indent));
    }
    if (block.join("\n").includes("storage/kv")) return block.join("\n");
  }
  throw new Error("no run block writes to storage/kv");
}

let dir;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "kv-diag-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Stub curl: honours -o <file>, -w '%{http_code}', prints CODE, writes BODY. */
function stubCurl(code, body) {
  const bin = join(dir, `bin-${code}`);
  const script = [
    "#!/usr/bin/env bash",
    'out=""',
    "while [ $# -gt 0 ]; do",
    '  if [ "$1" = "-o" ]; then out="$2"; shift; fi',
    "  shift",
    "done",
    `[ -n "$out" ] && printf '%s' '${body}' > "$out"`,
    `printf '%s' '${code}'`,
    "",
  ].join("\n");
  require_mkdir(bin);
  writeFileSync(join(bin, "curl"), script);
  chmodSync(join(bin, "curl"), 0o755);
  return bin;
}
function require_mkdir(p) {
  spawnSync("mkdir", ["-p", p]);
}

function run(site, bin) {
  const block = kvRunBlock(readFileSync(resolve(ROOT, site.file), "utf8"));
  return spawnSync("bash", ["-e", "-c", block], {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CF_ACCOUNT_ID: "acct",
      CF_API_TOKEN: TOKEN,
      KV_NS_ID: "ns",
      ...site.env,
    },
    encoding: "utf8",
  });
}

describe.each(SITES)("$name KV write diagnostics", (site) => {
  it("prints status and Cloudflare error, exits non-zero, never leaks the token", () => {
    const body = JSON.stringify({
      success: false,
      errors: [{ code: 10000, message: "Authentication error" }],
    });
    const res = run(site, stubCurl(403, body));
    const out = res.stdout + res.stderr;
    expect(res.status).not.toBe(0);
    expect(out).toContain("HTTP 403");
    expect(out).toContain("10000");
    expect(out).toContain("Authentication error");
    expect(out).not.toContain(TOKEN);
  });

  it("exits non-zero and still reports the status when the body is not JSON", () => {
    const res = run(site, stubCurl(502, "<html>bad gateway</html>"));
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).toContain("HTTP 502");
  });

  it("exits zero on a 200", () => {
    const res = run(site, stubCurl(200, '{"success":true,"errors":[]}'));
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).not.toContain(TOKEN);
  });

  it("enables pipefail", () => {
    expect(kvRunBlock(readFileSync(resolve(ROOT, site.file), "utf8"))).toMatch(
      /^\s*set -o pipefail\s*$/m
    );
  });
});
