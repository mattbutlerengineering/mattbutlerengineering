import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyProbe,
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

describe("post-deploy-check workflow wiring", () => {
  it("runs the invariant probe", () => {
    // Same class as the rialto-web spec-list guard: a checked-in probe that no
    // workflow invokes pins nothing.
    expect(POST_DEPLOY_WORKFLOW).toContain("scripts/check-api-surface-invariants.mjs");
  });
});
