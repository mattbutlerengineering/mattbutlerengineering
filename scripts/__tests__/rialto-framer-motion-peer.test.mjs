/**
 * Guard (#7717): rialto's published `framer-motion` peer range must admit the
 * major the pnpm catalog resolves, or consumers on that major get a peer
 * warning (a failure under strict peers).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("rialto framer-motion peer range", () => {
  it("admits the major version the pnpm catalog uses", () => {
    const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");
    const catalog = /^\s*framer-motion:\s*"?\^?(\d+)\./m.exec(workspace);
    expect(catalog).not.toBeNull();
    const major = catalog[1];

    const pkg = JSON.parse(readFileSync(resolve(root, "packages/rialto/package.json"), "utf8"));
    const clauses = pkg.peerDependencies["framer-motion"].split("||").map((c) => c.trim());

    expect(clauses).toContain(`^${major}.0.0`);
  });
});
