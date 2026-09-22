import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * Every Dockerfile that runs `pnpm install` must also COPY the `patches/`
 * directory into its build context.
 *
 * pnpm reads `pnpm.patchedDependencies` out of the root package.json and hashes
 * each referenced patch file *during install*. If the file is absent, install
 * aborts before resolving anything:
 *
 *   ENOENT: no such file or directory,
 *   open '/app/patches/@stryker-mutator__vitest-runner@10.0.0.patch'
 *   command exited with code 254
 *
 * On 2026-09-22 this broke every DigitalOcean service build for hours. The
 * Dockerfiles copied `package.json` (which declares the patch) but not
 * `patches/`, so the declaration pointed at a file that did not exist in the
 * image. The failure was especially expensive to diagnose because DO does not
 * surface the exit code — it reports `BuildJobTerminated` / "This often happens
 * due to resource exhaustion", which sent the investigation toward build memory
 * and DO capacity rather than a missing file. The real error is only visible in
 * `doctl apps logs <app> <component> --type=build`.
 *
 * Keyed on the real files, so adding a second patch, or a new service whose
 * Dockerfile forgets the COPY, fails here instead of in production.
 */
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const PATCHED = PKG.pnpm?.patchedDependencies ?? {};

/** Recursively collect Dockerfiles, skipping dependency and artifact dirs. */
function findDockerfiles(dir, found = []) {
  const SKIP = new Set(["node_modules", ".git", "dist", "coverage", ".turbo", ".claude"]);
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findDockerfiles(full, found);
    else if (entry === "Dockerfile" || entry.startsWith("Dockerfile.")) found.push(full);
  }
  return found;
}

describe("Dockerfiles and pnpm patchedDependencies", () => {
  it("declares at least one patched dependency (otherwise this guard is vacuous)", () => {
    // If this ever legitimately drops to zero, delete this file rather than
    // letting it pass silently while asserting nothing.
    expect(Object.keys(PATCHED).length).toBeGreaterThan(0);
  });

  it("every referenced patch file actually exists in the repo", () => {
    for (const [dep, patchPath] of Object.entries(PATCHED)) {
      expect(
        () => readFileSync(resolve(ROOT, patchPath), "utf8"),
        `${dep} points at ${patchPath}, which is missing`
      ).not.toThrow();
    }
  });

  it("every Dockerfile running `pnpm install` also copies patches/", () => {
    const offenders = [];
    for (const file of findDockerfiles(ROOT)) {
      const text = readFileSync(file, "utf8");
      if (!/^\s*RUN\s+.*\bpnpm install\b/m.test(text)) continue;
      if (!/^\s*COPY\s+patches\b/m.test(text)) offenders.push(relative(ROOT, file));
    }
    expect(
      offenders,
      `these run pnpm install without COPYing patches/: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("copies patches/ in every build stage that installs, not just the first", () => {
    // Multi-stage service Dockerfiles install twice (builder, then --prod
    // runtime). A single COPY in stage 1 does not carry into stage 2, so the
    // runtime stage fails identically. Count both.
    const offenders = [];
    for (const file of findDockerfiles(ROOT)) {
      const text = readFileSync(file, "utf8");
      const installs = (text.match(/^\s*RUN\s+.*\bpnpm install\b/gm) ?? []).length;
      if (installs === 0) continue;
      const copies = (text.match(/^\s*COPY\s+patches\b/gm) ?? []).length;
      if (copies < installs)
        offenders.push(`${relative(ROOT, file)} (${installs} installs, ${copies} copies)`);
    }
    expect(offenders, `stages install without patches/: ${offenders.join(", ")}`).toEqual([]);
  });
});
