import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../../lint-staged.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const abs = (rel) => resolve(ROOT, rel);

const TS_GLOB = "**/*.{ts,tsx}";
const MJS_GLOB = "**/*.mjs";
const OTHER_GLOB = Object.keys(config).find((k) => k !== TS_GLOB && k !== MJS_GLOB);

/** The commands lint-staged would run for one staged path. */
const commandsFor = (glob, files) => config[glob](files.map(abs));
const joined = (glob, files) => commandsFor(glob, files).join("\n");

describe("lint-staged formats every staged file it claims to handle", () => {
  it("prettifies a ts file inside a recognised package", () => {
    expect(joined(TS_GLOB, ["packages/rialto/src/index.ts"])).toContain("prettier");
  });

  it("prettifies a ts file OUTSIDE apps/packages/services/tools", () => {
    // The regression this pins. `groupByPackage` only recognises those four
    // top-level dirs, so an infrastructure/ file used to yield an empty
    // command list: lint-staged printed "**/*.{ts,tsx} — 1 file" and then
    // ran nothing at all. CI's repo-wide `prettier --check .` was the first
    // thing that disagreed, one push later.
    const cmds = commandsFor(TS_GLOB, ["infrastructure/pulumi/index.ts"]);
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.join("\n")).toContain("prettier");
  });

  it("still lints, not just formats, a file in a recognised package", () => {
    expect(joined(TS_GLOB, ["packages/rialto/src/index.ts"])).toContain("eslint --fix");
  });

  it("runs eslint before prettier so formatting is what lands", () => {
    const text = joined(TS_GLOB, ["packages/rialto/src/index.ts"]);
    expect(text.indexOf("eslint --fix")).toBeLessThan(text.indexOf("prettier"));
  });

  it("emits nothing when only generated files are staged", () => {
    expect(commandsFor(TS_GLOB, ["services/users/src/generated/client.ts"])).toEqual([]);
  });

  it("covers the non-ts file types ESLint never sees", () => {
    for (const file of ["docs/readme.md", ".github/workflows/ci.yml"]) {
      expect(joined(OTHER_GLOB, [file])).toContain("prettier");
    }
  });

  it("keeps the globs disjoint, so eslint and prettier never race a file", () => {
    // Separate globs run concurrently in lint-staged; an overlapping pair
    // would let `eslint --fix` and `prettier --write` write the same path at
    // the same time. Commands chained within one glob run in order instead.
    const tsExtensions = TS_GLOB.match(/\{([^}]*)\}/)[1].split(",");
    const otherExtensions = OTHER_GLOB.match(/\{([^}]*)\}/)[1].split(",");
    expect(tsExtensions.filter((e) => otherExtensions.includes(e))).toEqual([]);
    // .mjs has its own eslint+prettier entry; neither brace glob may also
    // match it, or two concurrent commands would write the same file.
    expect(tsExtensions).not.toContain("mjs");
    expect(otherExtensions).not.toContain("mjs");
  });

  it("passes the resolved prettier config explicitly", () => {
    expect(joined(OTHER_GLOB, ["docs/readme.md"])).toContain("--config .prettierrc.js");
  });
});

describe("lint-staged routes staged .mjs through ESLint (scripts/ lint gate)", () => {
  it("has a dedicated .mjs entry", () => {
    expect(Object.keys(config)).toContain(MJS_GLOB);
  });

  it("lints, not just formats, a staged repo script", () => {
    expect(joined(MJS_GLOB, ["scripts/collect-pr-metrics.mjs"])).toContain("eslint --fix");
  });

  it("runs eslint before prettier so formatting is what lands", () => {
    const text = joined(MJS_GLOB, ["scripts/collect-pr-metrics.mjs"]);
    expect(text.indexOf("eslint --fix")).toBeLessThan(text.indexOf("prettier"));
  });

  it("lints .mjs files outside apps/packages/services/tools too", () => {
    // scripts/ is not one of groupByPackage's four dirs; the .mjs entry must
    // not inherit that filter or the gate misses its primary target.
    expect(joined(MJS_GLOB, [".claude/hooks/hook-input.mjs"])).toContain("eslint --fix");
  });

  it("emits nothing when only generated files are staged", () => {
    // ESLint 10's `ignores` array does not apply to explicitly-passed paths,
    // so generated files must be filtered before the command is built.
    expect(commandsFor(MJS_GLOB, ["services/users/src/generated/helper.mjs"])).toEqual([]);
  });
});
