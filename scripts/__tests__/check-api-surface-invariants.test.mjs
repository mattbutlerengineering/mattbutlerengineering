import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyProbe,
  isRetryable,
  API_SURFACE_PROBES,
  PROBE_STATES,
} from "../check-api-surface-invariants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const POST_DEPLOY_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/post-deploy-check.yml"),
  "utf8"
);

describe("classifyProbe", () => {
  const probe = { expectStatus: 401, requireHeaders: ["x-ratelimit-limit"] };

  it("passes when the status matches and every required header is present", () => {
    expect(classifyProbe(probe, { httpCode: 401, headers: { "x-ratelimit-limit": "100" } })).toBe(
      "ok"
    );
  });

  it("reports unreachable when the request never completed", () => {
    expect(classifyProbe(probe, { httpCode: 0, headers: {} })).toBe("unreachable");
  });

  it("reports a status mismatch when the route answers something else", () => {
    expect(classifyProbe(probe, { httpCode: 201, headers: { "x-ratelimit-limit": "100" } })).toBe(
      "status-mismatch"
    );
  });

  it("reports guard-missing when the status is right but the header is absent", () => {
    // This is the whole point: #4492 answered exactly the expected 401 while
    // silently carrying no rate-limit headers at all. A probe that only
    // asserted the status code would have passed throughout the regression.
    expect(classifyProbe(probe, { httpCode: 401, headers: {} })).toBe("guard-missing");
  });

  it("treats an empty header value as missing, not as present", () => {
    expect(classifyProbe(probe, { httpCode: 401, headers: { "x-ratelimit-limit": "" } })).toBe(
      "guard-missing"
    );
  });

  it("matches header names case-insensitively", () => {
    expect(classifyProbe(probe, { httpCode: 401, headers: { "X-RateLimit-Limit": "100" } })).toBe(
      "ok"
    );
  });

  it("checks the status before the headers, so an unreachable host is never guard-missing", () => {
    expect(classifyProbe(probe, { httpCode: 0, headers: {} })).not.toBe("guard-missing");
  });

  it("only ever returns a declared state", () => {
    const outcomes = [
      classifyProbe(probe, { httpCode: 401, headers: { "x-ratelimit-limit": "1" } }),
      classifyProbe(probe, { httpCode: 0, headers: {} }),
      classifyProbe(probe, { httpCode: 500, headers: {} }),
      classifyProbe(probe, { httpCode: 401, headers: {} }),
    ];
    for (const outcome of outcomes) expect(PROBE_STATES).toContain(outcome);
  });
});

describe("API_SURFACE_PROBES", () => {
  it("requires the rate-limit header on every probe", () => {
    // The invariant the manifest exists to defend. A probe that asserts only a
    // status code re-opens the exact hole #4499 closed.
    for (const p of API_SURFACE_PROBES) {
      expect(p.requireHeaders).toContain("x-ratelimit-limit");
    }
  });

  it("never expects a success status — no probe may authenticate or mutate", () => {
    for (const p of API_SURFACE_PROBES) {
      expect(p.expectStatus).toBeGreaterThanOrEqual(400);
    }
  });

  it("covers the venue-create regression at BOTH stages that were ungoverned", () => {
    const venueCreate = API_SURFACE_PROBES.filter(
      (p) => p.method === "POST" && p.path === "/api/v1/venues"
    );
    // Validation answers 400 before any preHandler; requireAuth answers 401
    // after it. They are separate stages and only one of them is exercised by
    // a schema-valid body, so both need their own probe.
    expect(venueCreate.map((p) => p.expectStatus).sort()).toEqual([400, 401]);
  });

  it("covers sibling routes, so a service-wide limiter regression is caught too", () => {
    const paths = new Set(API_SURFACE_PROBES.map((p) => p.path));
    expect(paths.size).toBeGreaterThan(1);
  });

  it("gives every probe a unique name for the report", () => {
    const names = API_SURFACE_PROBES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

/** A workflow with whole-line `#` comments removed. */
const stripComments = (yml) =>
  yml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

/** Every workflow file, as { file, name, source }. */
function allWorkflows() {
  const dir = resolve(ROOT, ".github/workflows");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((file) => {
      const source = readFileSync(resolve(dir, file), "utf8");
      return { file, name: source.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "", source };
    });
}

/**
 * Workflows that deploy to production.
 *
 * "Deploys" = shells out to one of the three deploy tools this repo uses.
 * "To production" = triggers on a push to `main`; `preview-deploy.yml` runs
 * the same wrangler command but only on `pull_request`, and probing the
 * production host after a PR preview would assert nothing about the preview.
 */
const DEPLOY_COMMAND =
  /wrangler.*deploy|doctl apps create-deployment|pulumi up|uses: pulumi\/actions/;

/**
 * Whether a workflow triggers on `main`.
 *
 * Deliberately not `/branches:\s*\[\s*main\s*\]/`. That matches only the
 * exact inline single-entry form every workflow happens to use today, so
 * `branches: [main, staging]` or the block form
 *
 *     branches:
 *       - main
 *
 * would read as "not a production workflow" and the workflow would drop out
 * of the coverage check silently. The dangerous direction for a guard is
 * always the narrowing one: fewer workflows checked, never more, and a
 * falsely-excluded workflow looks exactly like a correctly-excluded one.
 */
function triggersOnMain(code) {
  for (const match of code.matchAll(/branches:\s*(.*(?:\n\s+-\s*.+)*)/g)) {
    if (/\bmain\b/.test(match[1])) return true;
  }
  return false;
}

function productionDeployWorkflows() {
  return allWorkflows().filter(({ source }) => {
    const code = stripComments(source);
    return DEPLOY_COMMAND.test(code) && triggersOnMain(code);
  });
}

describe("post-deploy-check workflow wiring", () => {
  it("runs the invariant probe", () => {
    // Same class as the rialto-web spec-list guard: a checked-in probe that no
    // workflow invokes pins nothing. Comments are stripped first -- an
    // indexOf over the raw text would stay green if the real invocation were
    // deleted while a comment still named the script by path.
    expect(stripComments(POST_DEPLOY_WORKFLOW)).toContain(
      "node scripts/check-api-surface-invariants.mjs"
    );
  });

  it("probes after every workflow that deploys to production", () => {
    // The gap this closes: "Pulumi Deploy" owns the DO App Platform ingress
    // rules, and ingress is the one layer whose breakage is invisible to
    // every service-level check -- the route is registered, its tests pass,
    // the service is healthy, and the deployed host still answers 404. It
    // was absent from this list, so the single deploy that can introduce
    // that defect was the single deploy that never got probed.
    const listed = stripComments(POST_DEPLOY_WORKFLOW).match(/workflows:\s*\[([^\]]*)\]/)?.[1];
    expect(listed, "post-deploy-check has no workflow_run trigger list").toBeDefined();

    const deployers = productionDeployWorkflows();
    expect(deployers.length).toBeGreaterThan(0);

    const unprobed = deployers.filter(({ name }) => !listed.includes(`"${name}"`));
    expect(unprobed.map((w) => `${w.file} (${w.name})`)).toEqual([]);
  });

  it("recognises every branch-list form, so a workflow cannot drop out silently", () => {
    // Each of these is a production deploy trigger; a guard that only reads
    // the first would quietly stop covering a workflow the day someone
    // reformatted its trigger block.
    expect(triggersOnMain("  push:\n    branches: [main]")).toBe(true);
    expect(triggersOnMain("  push:\n    branches: [main, staging]")).toBe(true);
    expect(triggersOnMain('  push:\n    branches: ["main"]')).toBe(true);
    expect(triggersOnMain("  push:\n    branches:\n      - main")).toBe(true);
    expect(triggersOnMain("  push:\n    branches:\n      - release\n      - main")).toBe(true);
    expect(triggersOnMain("  push:\n    branches: [develop]")).toBe(false);
    expect(triggersOnMain("  pull_request:\n    types: [opened]")).toBe(false);
  });

  it("does not probe production after a PR preview deploy", () => {
    // Guards the discriminator above rather than the list: if
    // preview-deploy.yml ever starts matching, the test above would begin
    // demanding it be probed, which would be wrong.
    expect(productionDeployWorkflows().map((w) => w.file)).not.toContain("preview-deploy.yml");
  });
});

describe("runner exit codes", () => {
  // The exit code is what decides whether the workflow job can go red at all.
  // A runner that printed "guard-missing" and still exited 0 would be a gate
  // that never fires -- the exact failure class this script exists to catch,
  // one level up. These serve every probe in the real manifest from a local
  // fixture, so they cannot drift from it.
  const SCRIPT = resolve(ROOT, "scripts/check-api-surface-invariants.mjs");

  /** @param {(probe: object) => boolean} withHeaders */
  async function serve(withHeaders) {
    const server = createServer((req, res) => {
      const path = new URL(req.url, "http://x").pathname;
      const matches = API_SURFACE_PROBES.filter((p) => p.path === path && p.method === req.method);
      // POST /api/v1/venues has two probes on one path/method, split by whether
      // the body is schema-valid -- mirror Fastify's validation-before-auth
      // ordering so the fixture answers each one the way production does.
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const probe =
          matches.length > 1
            ? matches.find((p) =>
                body.includes("ianaTimezone") ? p.expectStatus === 401 : p.expectStatus === 400
              )
            : matches[0];
        if (!probe) return res.writeHead(404).end();
        if (withHeaders(probe)) {
          for (const h of probe.requireHeaders) res.setHeader(h, "100");
        }
        res.writeHead(probe.expectStatus).end("{}");
      });
    });
    await new Promise((r) => server.listen(0, r));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  }

  /** @returns {Promise<{code: number, stderr: string}>} */
  function run(base) {
    return new Promise((resolve_) => {
      const child = spawn(process.execPath, [SCRIPT, "--base", base], { stdio: "pipe" });
      let stderr = "";
      child.stderr.on("data", (c) => (stderr += c));
      child.on("close", (code) => resolve_({ code, stderr }));
    });
  }

  it("exits 0 when every invariant holds", async () => {
    const { server, base } = await serve(() => true);
    try {
      expect((await run(base)).code).toBe(0);
    } finally {
      server.close();
    }
  });

  it("exits non-zero when a guard is missing, naming it as a guard and not an outage", async () => {
    const target = API_SURFACE_PROBES[0];
    const { server, base } = await serve((p) => p.name !== target.name);
    try {
      const { code, stderr } = await run(base);
      expect(code).not.toBe(0);
      expect(stderr).toContain("guard-missing");
      expect(stderr).toContain(target.name);
      // The status was correct, so this must never be reported as the service
      // being down -- the two call for opposite responses.
      expect(stderr).not.toContain("unreachable");
    } finally {
      server.close();
    }
  });
});

describe("isRetryable", () => {
  it("retries only the state that can be a transient deploy artifact", () => {
    expect(isRetryable("unreachable")).toBe(true);
  });

  it("never retries a state that is a deterministic property of the running config", () => {
    // Retrying these could only mask a real regression — the asymmetry with
    // `unreachable` is deliberate, not an oversight.
    expect(isRetryable("guard-missing")).toBe(false);
    expect(isRetryable("status-mismatch")).toBe(false);
  });

  it("does not retry a passing probe", () => {
    expect(isRetryable("ok")).toBe(false);
  });

  it("covers every declared state", () => {
    for (const state of PROBE_STATES) {
      expect(typeof isRetryable(state)).toBe("boolean");
    }
  });
});
