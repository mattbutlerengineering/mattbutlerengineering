import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

describe("@opentelemetry/api 1.9.x pin (#7715)", () => {
  // Dependabot `ignore` only holds direct deps. @sentry/node, @sentry/opentelemetry,
  // @sentry/server-utils and @pulumi/pulumi declare open ranges (^1.9, ^1.9.1), so a
  // grouped bump resolves @opentelemetry/api 1.10.0 as a second copy. The OTel API
  // compat rule rejects a 1.10 copy reading a 1.9 global registration, silently:
  // Sentry then sees a NoopTracerProvider and a null active span. core 2.12 and
  // sdk-trace-base 2.x declare <1.10.0. Remove this override with the OTel 3.0 upgrade (#7715).
  it("forces every @opentelemetry/api >=1.10.0 request back to 1.9.1", () => {
    expect(pkg.pnpm.overrides["@opentelemetry/api@>=1.10.0"]).toBe("1.9.1");
  });

  it("resolves exactly one @opentelemetry/api version in the lockfile", () => {
    const versions = new Set(
      [...lock.matchAll(/^ {2}'?@opentelemetry\/api@(\d+\.\d+\.\d+)'?:/gm)].map((m) => m[1])
    );
    expect([...versions]).toEqual(["1.9.1"]);
  });
});
