/**
 * Every workspace package a service image bakes in must redeploy that service
 * when it changes, or be allowlisted here with the reason it can't affect
 * runtime. #7460 changed packages/rialto-catalog (the catalog prompt agent-api
 * sends the model), matched no deploy-services.yml path, merged green, and
 * shipped nothing until a manual dispatch. The workflow's own comment records
 * the same class for packages/sentry (#4927): check-workflow-paths-coverage
 * reads run: blocks and cannot see a package that only a Dockerfile COPYs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Packages an image copies only to compile, never to run. */
const BUILD_ONLY = {
  config: "TypeScript/ESLint configs; read at build time only",
  rialto:
    "built only so rialto-catalog compiles; agent-api imports @mbe/rialto-catalog/catalog, which loads no rialto code",
};

function bakedPackages(dockerfile) {
  const text = readFileSync(dockerfile, "utf8");
  const names = [...text.matchAll(/^COPY\s+(?:--from=\S+\s+)?\S*?packages\/([a-z0-9-]+)/gm)].map(
    (m) => m[1]
  );
  return [...new Set(names)].sort();
}

function deployPaths() {
  const yml = readFileSync(join(ROOT, ".github/workflows/deploy-services.yml"), "utf8");
  const block = yml.slice(yml.indexOf("paths:"), yml.indexOf("workflow_dispatch:"));
  return [...block.matchAll(/^\s+-\s+"([^"]+)"/gm)].map((m) => m[1]);
}

const services = readdirSync(join(ROOT, "services")).filter((s) =>
  existsSync(join(ROOT, "services", s, "Dockerfile"))
);

describe("deploy-services.yml covers every package a service image bakes in", () => {
  it("finds the service images and their packages", () => {
    expect(services.length).toBeGreaterThanOrEqual(3);
    for (const s of services) {
      expect(bakedPackages(join(ROOT, "services", s, "Dockerfile")).length).toBeGreaterThan(0);
    }
  });

  it.each(services)("%s: each baked package redeploys or is build-only", (service) => {
    const paths = deployPaths();
    const uncovered = bakedPackages(join(ROOT, "services", service, "Dockerfile")).filter(
      (pkg) => !paths.includes(`packages/${pkg}/**`) && !(pkg in BUILD_ONLY)
    );
    expect(uncovered).toEqual([]);
  });

  it("allowlists only packages some image actually bakes in", () => {
    const baked = new Set(
      services.flatMap((s) => bakedPackages(join(ROOT, "services", s, "Dockerfile")))
    );
    expect(Object.keys(BUILD_ONLY).filter((pkg) => !baked.has(pkg))).toEqual([]);
  });
});
