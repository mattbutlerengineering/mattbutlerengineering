import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * The service and migrate images share one Node base image, pinned by the
 * multi-arch index digest. `node:22-alpine3.19` was frozen at Node 22.12.0
 * (Alpine 3.19 is end-of-life), which blocks upgrades needing Node >= 22.15
 * (#7715). To bump: update BASE_IMAGE below and every Dockerfile together.
 */
const BASE_IMAGE =
  "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914";

const DOCKERFILES = [
  "services/agent/Dockerfile",
  "services/reservations/Dockerfile",
  "services/users/Dockerfile",
  "infrastructure/migrate/Dockerfile",
];

function nodeFromLines(file) {
  const text = readFileSync(resolve(ROOT, file), "utf8");
  return text.split("\n").filter((line) => /^FROM\s+node:/.test(line));
}

describe("Dockerfile Node base image", () => {
  for (const file of DOCKERFILES) {
    it(`${file} uses the shared digest-pinned base on every node stage`, () => {
      const lines = nodeFromLines(file);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.split(/\s+/)[1]).toBe(BASE_IMAGE);
      }
    });
  }

  it("does not use the frozen alpine3.19 tag anywhere", () => {
    for (const file of DOCKERFILES) {
      expect(readFileSync(resolve(ROOT, file), "utf8")).not.toContain("alpine3.19");
    }
  });
});
