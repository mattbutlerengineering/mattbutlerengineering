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
 * Both Cloudflare KV health writers inline the same curl block (neither job
 * checks out the repo, so a shared script is not reachable). This pins both:
 * the blocks are extracted textually and executed against a stubbed curl.
 *
 * Contract pinned here: GET the stored record first and skip the PUT when the
 * conclusion (and apps_deployed, deploy health) is unchanged and the record is
 * under 24h old; a 429 on the PUT (free-tier quota, error 10048) is a
 * ::warning:: and exit 0; any other non-2xx still fails.
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

/**
 * Stub curl: honours -o <file> and -w '%{http_code}'. A GET (no `-X PUT`)
 * answers with `get`, a PUT with `put`; every call's verb is appended to
 * <bin>/calls.log. One {code, body} argument applies to both verbs.
 */
let stubSeq = 0;
function stubCurl(put, get = put) {
  const bin = join(dir, `bin-${stubSeq++}`);
  const script = [
    "#!/usr/bin/env bash",
    'out=""; verb=GET',
    "while [ $# -gt 0 ]; do",
    '  if [ "$1" = "-o" ]; then out="$2"; shift; fi',
    '  if [ "$1" = "PUT" ]; then verb=PUT; fi',
    "  shift",
    "done",
    'echo "$verb" >> "$(dirname "$0")/calls.log"',
    `if [ "$verb" = PUT ]; then code='${put.code}'; body='${put.body}'; else code='${get.code}'; body='${get.body}'; fi`,
    '[ -n "$out" ] && printf \'%s\' "$body" > "$out"',
    "printf '%s' \"$code\"",
    "",
  ].join("\n");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "curl"), script);
  chmodSync(join(bin, "curl"), 0o755);
  return bin;
}
const ok = (body = '{"success":true,"errors":[]}') => ({ code: 200, body });
const calls = (bin) => {
  try {
    return readFileSync(join(bin, "calls.log"), "utf8").trim().split("\n");
  } catch {
    return [];
  }
};
const stored = (conclusion, ageMs = 1000, extra = {}) =>
  JSON.stringify({
    conclusion,
    sha: "old",
    updated_at: new Date(Date.now() - ageMs).toISOString().replace(/\.\d+Z$/, "Z"),
    ...extra,
  });

function run(site, bin, extraEnv = {}) {
  const block = kvRunBlock(readFileSync(resolve(ROOT, site.file), "utf8"));
  return spawnSync("bash", ["-e", "-c", block], {
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CF_ACCOUNT_ID: "acct",
      CF_API_TOKEN: TOKEN,
      KV_NS_ID: "ns",
      ...site.env,
      ...extraEnv,
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
    const res = run(site, stubCurl({ code: 403, body }));
    const out = res.stdout + res.stderr;
    expect(res.status).not.toBe(0);
    expect(out).toContain("HTTP 403");
    expect(out).toContain("10000");
    expect(out).toContain("Authentication error");
    expect(out).not.toContain(TOKEN);
  });

  it("exits non-zero and still reports the status when the body is not JSON", () => {
    const res = run(site, stubCurl({ code: 502, body: "<html>bad gateway</html>" }));
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).toContain("HTTP 502");
  });

  it("exits zero on a 200", () => {
    const res = run(site, stubCurl(ok()));
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).not.toContain(TOKEN);
  });

  it("skips the PUT when the stored conclusion is unchanged and fresh", () => {
    const bin = stubCurl(ok(), ok(stored("success")));
    const res = run(site, bin);
    expect(res.status).toBe(0);
    expect(calls(bin)).toEqual(["GET"]);
    expect(res.stdout).toContain("unchanged");
    expect(res.stdout + res.stderr).not.toContain(TOKEN);
  });

  it("PUTs when the conclusion changed", () => {
    const bin = stubCurl(ok(), ok(stored("failure")));
    expect(run(site, bin).status).toBe(0);
    expect(calls(bin)).toEqual(["GET", "PUT"]);
  });

  it("PUTs a daily refresh when the unchanged record is over 24h old", () => {
    const bin = stubCurl(ok(), ok(stored("success", 25 * 3600 * 1000)));
    expect(run(site, bin).status).toBe(0);
    expect(calls(bin)).toEqual(["GET", "PUT"]);
  });

  it("PUTs when the key is absent (GET 404)", () => {
    const bin = stubCurl(ok(), {
      code: 404,
      body: '{"success":false,"errors":[{"code":10009,"message":"key not found"}]}',
    });
    expect(run(site, bin).status).toBe(0);
    expect(calls(bin)).toEqual(["GET", "PUT"]);
  });

  it("treats a 429/10048 on the PUT as a warning and exits 0", () => {
    const body = JSON.stringify({
      success: false,
      errors: [{ code: 10048, message: "free usage limit reached" }],
    });
    const res = run(site, stubCurl({ code: 429, body }, { code: 404, body: "" }));
    const out = res.stdout + res.stderr;
    expect(res.status).toBe(0);
    expect(out).toContain("::warning::");
    expect(out).toContain("10048");
    expect(out).not.toContain(TOKEN);
  });

  it("still fails on a 403 PUT that follows a GET", () => {
    const res = run(
      site,
      stubCurl(
        { code: 403, body: '{"errors":[{"code":10000,"message":"Authentication error"}]}' },
        { code: 404, body: "" }
      )
    );
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).not.toContain(TOKEN);
  });

  it("enables pipefail", () => {
    expect(kvRunBlock(readFileSync(resolve(ROOT, site.file), "utf8"))).toMatch(
      /^\s*set -o pipefail\s*$/m
    );
  });
});

describe("report-deploy-health apps_deployed comparison", () => {
  const site = SITES[1];
  const apps = '{"marketing":"true","hospitality":"false"}';

  it("skips the PUT when conclusion and apps_deployed both match", () => {
    const bin = stubCurl(
      ok(),
      ok(stored("success", 1000, { apps_deployed: { hospitality: "false", marketing: "true" } }))
    );
    expect(run(site, bin, { APPS_DEPLOYED: apps }).status).toBe(0);
    expect(calls(bin)).toEqual(["GET"]);
  });

  it("PUTs when apps_deployed differs even though the conclusion matches", () => {
    const bin = stubCurl(
      ok(),
      ok(stored("success", 1000, { apps_deployed: { marketing: "false", hospitality: "false" } }))
    );
    expect(run(site, bin, { APPS_DEPLOYED: apps }).status).toBe(0);
    expect(calls(bin)).toEqual(["GET", "PUT"]);
  });
});
