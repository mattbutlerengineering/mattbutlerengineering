// @vitest-environment node
/**
 * TDD: generate-exports.ts must consume the canonical introspectComponents()
 * model from component-metadata.ts rather than scanning the filesystem
 * directly via lib-entrypoints.ts.  The exports map it produces must remain
 * byte-identical to the committed package.json "exports" field, including
 * the ./Toast subpath.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { buildExportsMap, writeStylesTypeStub } from "./generate-exports.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");

describe("buildExportsMap", () => {
  it("includes ./Toast subpath (Toast dir exports ToastProvider, not Toast)", () => {
    const map = buildExportsMap(RIALTO_ROOT);
    expect(Object.keys(map)).toContain("./Toast");
  });

  it("includes the root, motion, hooks, providers, styles, and manifest entries", () => {
    const map = buildExportsMap(RIALTO_ROOT);
    expect(Object.keys(map)).toContain(".");
    expect(Object.keys(map)).toContain("./motion");
    expect(Object.keys(map)).toContain("./hooks");
    expect(Object.keys(map)).toContain("./providers");
    expect(Object.keys(map)).toContain("./styles");
    expect(Object.keys(map)).toContain("./manifest");
  });

  it("produces an exports map byte-identical to the committed package.json exports", () => {
    const map = buildExportsMap(RIALTO_ROOT);
    const serialized = JSON.stringify(map, null, 2);

    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      exports: unknown;
    };

    const committed = JSON.stringify(pkg.exports, null, 2);
    expect(serialized).toBe(committed);
  });
});

describe("writeStylesTypeStub", () => {
  // The ./styles subpath's `types` points at dist/lib/styles.d.ts, which vite
  // does not emit (there is no styles.ts source). The build must write this
  // stub or consumers fail to typecheck the side-effect CSS import (TS2882).
  it("writes a side-effect-only declaration stub into dist/lib", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rialto-stub-"));
    try {
      fs.mkdirSync(path.join(tmpRoot, "dist", "lib"), { recursive: true });
      writeStylesTypeStub(tmpRoot);
      const stub = fs.readFileSync(path.join(tmpRoot, "dist", "lib", "styles.d.ts"), "utf-8");
      expect(stub).toContain("export {};");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
