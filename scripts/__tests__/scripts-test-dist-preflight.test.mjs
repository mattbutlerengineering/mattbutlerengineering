import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  findMissingWorkspaceDists,
  formatPreflightError,
  BUILD_COMMAND,
} from "../scripts-test-dist-preflight.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GH_CLIENT = {
  name: "@mbe/gh-client",
  exports: { ".": { types: "./src/index.ts", node: "./dist/index.js", default: "./src/index.ts" } },
};
const AGENT_CORE = {
  name: "@mbe/agent-core",
  exports: { ".": { types: "./src/index.ts", default: "./dist/index.js" } },
};
const CONSUMER = {
  name: "@mbe/scripts",
  dependencies: {
    "@mbe/agent-core": "workspace:*",
    "@mbe/gh-client": "workspace:*",
    "js-yaml": "^5.4.3",
  },
};

function fakeWorkspace(manifests, existingFiles) {
  return {
    readManifest: (name) => {
      if (!(name in manifests)) throw new Error(`ENOENT ${name}`);
      return manifests[name];
    },
    exists: (name, relPath) => existingFiles.has(`${name}:${relPath}`),
  };
}

describe("findMissingWorkspaceDists (#6840)", () => {
  test("#6840 repro: unbuilt gh-client and agent-core are both reported missing", () => {
    const ws = fakeWorkspace(
      { "@mbe/gh-client": GH_CLIENT, "@mbe/agent-core": AGENT_CORE },
      new Set()
    );

    const result = findMissingWorkspaceDists({ consumerManifest: CONSUMER, ...ws });

    expect(result.missing).toEqual([
      { name: "@mbe/agent-core", files: ["./dist/index.js"] },
      { name: "@mbe/gh-client", files: ["./dist/index.js"] },
    ]);
    expect(result.undeterminable).toEqual([]);
  });

  test("built dists report nothing missing", () => {
    const ws = fakeWorkspace(
      { "@mbe/gh-client": GH_CLIENT, "@mbe/agent-core": AGENT_CORE },
      new Set(["@mbe/gh-client:./dist/index.js", "@mbe/agent-core:./dist/index.js"])
    );

    const result = findMissingWorkspaceDists({ consumerManifest: CONSUMER, ...ws });

    expect(result).toEqual({ missing: [], undeterminable: [] });
  });

  test("non-workspace dependencies are never inspected", () => {
    const ws = fakeWorkspace(
      { "@mbe/gh-client": GH_CLIENT, "@mbe/agent-core": AGENT_CORE },
      new Set()
    );
    const consumer = { dependencies: { "js-yaml": "^5.4.3" } };

    expect(findMissingWorkspaceDists({ consumerManifest: consumer, ...ws })).toEqual({
      missing: [],
      undeterminable: [],
    });
  });

  test("a workspace package that ships source only (no dist target) needs no build", () => {
    const srcOnly = { name: "@mbe/src-only", exports: { ".": "./src/index.mjs" } };
    const ws = fakeWorkspace({ "@mbe/src-only": srcOnly }, new Set());
    const consumer = { dependencies: { "@mbe/src-only": "workspace:*" } };

    expect(findMissingWorkspaceDists({ consumerManifest: consumer, ...ws })).toEqual({
      missing: [],
      undeterminable: [],
    });
  });

  test("main is honoured when there is no exports map", () => {
    const legacy = { name: "@mbe/legacy", main: "dist/index.js" };
    const ws = fakeWorkspace({ "@mbe/legacy": legacy }, new Set());
    const consumer = { devDependencies: { "@mbe/legacy": "workspace:^" } };

    expect(findMissingWorkspaceDists({ consumerManifest: consumer, ...ws }).missing).toEqual([
      { name: "@mbe/legacy", files: ["dist/index.js"] },
    ]);
  });

  test("an unreadable workspace manifest fails closed as undeterminable, not as fine", () => {
    const ws = fakeWorkspace(
      { "@mbe/agent-core": AGENT_CORE },
      new Set(["@mbe/agent-core:./dist/index.js"])
    );

    const result = findMissingWorkspaceDists({ consumerManifest: CONSUMER, ...ws });

    expect(result.missing).toEqual([]);
    expect(result.undeterminable).toEqual([
      { name: "@mbe/gh-client", reason: expect.stringContaining("ENOENT") },
    ]);
  });
});

describe("formatPreflightError (#6840)", () => {
  test("a clean result produces no error", () => {
    expect(formatPreflightError({ missing: [], undeterminable: [] })).toBeNull();
  });

  test("names every missing dist and the exact command that fixes it", () => {
    const message = formatPreflightError({
      missing: [
        { name: "@mbe/agent-core", files: ["./dist/index.js"] },
        { name: "@mbe/gh-client", files: ["./dist/index.js"] },
      ],
      undeterminable: [],
    });

    expect(message).toContain("@mbe/agent-core");
    expect(message).toContain("@mbe/gh-client");
    expect(message).toContain("./dist/index.js");
    expect(message).toContain(BUILD_COMMAND);
  });

  test("undeterminable packages also produce an error", () => {
    const message = formatPreflightError({
      missing: [],
      undeterminable: [{ name: "@mbe/gh-client", reason: "ENOENT" }],
    });

    expect(message).toContain("@mbe/gh-client");
    expect(message).toContain("ENOENT");
  });
});

describe("wiring (#6840)", () => {
  test("scripts/vitest.config.mjs runs the preflight as a globalSetup", async () => {
    const { default: config } = await import("../vitest.config.mjs");
    const globalSetup = [config.test.globalSetup].flat().map(String);

    expect(globalSetup.some((entry) => entry.endsWith("scripts-test-dist-preflight.mjs"))).toBe(
      true
    );
  });

  test("the preflight file exports a vitest globalSetup function", async () => {
    const mod = await import("../scripts-test-dist-preflight.mjs");
    expect(typeof mod.default).toBe("function");
    expect(fs.existsSync(path.join(__dirname, "../scripts-test-dist-preflight.mjs"))).toBe(true);
  });
});
