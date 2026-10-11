/**
 * Regression test for the unreachable-CLI-command class: a `new Command(...)`
 * export that nothing calls `.addCommand()` on, so `mbe <name>` exits
 * "unknown command" while the module's own unit tests keep passing against the
 * exported object.
 *
 * `tools/cli/src/commands/compound.ts` sat that way — 75 lines, an 11-test
 * suite, zero attachment sites — and no existing check could see it.
 * `check-claude-md-table-drift.mjs` deliberately cannot: it reconciles the
 * CLAUDE.md table against *registered* commands, and carries its own test
 * asserting an unregistered one is not flagged. See
 * scripts/check-orphaned-cli-commands.mjs.
 */

import { describe, it, expect } from "vitest";

import {
  ALLOWLIST,
  findOrphanedCliCommands,
  formatFinding,
  parseAttachedSymbols,
  parseCommandDeclarations,
  scanRepo,
  toFindings,
} from "../check-orphaned-cli-commands.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("parseCommandDeclarations", () => {
  it("extracts the symbol and the command name", () => {
    const source = 'export const fooCommand = new Command("foo").description("x");';
    expect(parseCommandDeclarations(source, "a.ts")).toEqual([
      { symbol: "fooCommand", name: "foo", file: "a.ts" },
    ]);
  });

  it("tolerates whitespace and multiple declarations in one module", () => {
    const source = [
      'export const aCommand = new Command( "a" )',
      'export  const  bCommand  =  new  Command("b")',
    ].join("\n");
    expect(parseCommandDeclarations(source, "m.ts").map((d) => d.name)).toEqual(["a", "b"]);
  });

  it("ignores an unnamed program root (`const program = new Command()`)", () => {
    expect(parseCommandDeclarations("const program = new Command();", "index.ts")).toEqual([]);
  });
});

describe("parseAttachedSymbols", () => {
  it("finds attachments on any receiver, not just `program`", () => {
    const source = "program.addCommand(aCommand);\nagentCommand.addCommand(runCommand);";
    expect(parseAttachedSymbols(source)).toEqual(["aCommand", "runCommand"]);
  });

  it("returns nothing when there are no attachments", () => {
    expect(parseAttachedSymbols("const x = 1;")).toEqual([]);
  });
});

describe("findOrphanedCliCommands", () => {
  const declaration = { symbol: "compoundCommand", name: "compound", file: "c.ts" };

  it("flags a declared command that nothing attaches", () => {
    const { orphans } = findOrphanedCliCommands({
      declarations: [declaration],
      attachedSymbols: [],
      allowlist: [],
    });
    expect(orphans).toEqual([declaration]);
  });

  it("passes a command attached to a parent command, not just to the program root", () => {
    const { orphans } = findOrphanedCliCommands({
      declarations: [{ symbol: "runCommand", name: "run", file: "agent/run.ts" }],
      attachedSymbols: ["runCommand"],
      allowlist: [],
    });
    expect(orphans).toEqual([]);
  });

  it("suppresses an allowlisted orphan and does not report it stale", () => {
    const allowlist = [{ symbol: "compoundCommand", reason: "kept for X" }];
    const result = findOrphanedCliCommands({
      declarations: [declaration],
      attachedSymbols: [],
      allowlist,
    });
    expect(result.orphans).toEqual([]);
    expect(result.staleAllowlist).toEqual([]);
  });

  it("reports an allowlist entry whose command is now attached — an exemption must not outlive its reason", () => {
    const result = findOrphanedCliCommands({
      declarations: [declaration],
      attachedSymbols: ["compoundCommand"],
      allowlist: [{ symbol: "compoundCommand", reason: "stale" }],
    });
    expect(result.orphans).toEqual([]);
    expect(result.staleAllowlist).toEqual(["compoundCommand"]);
  });

  it("reports an allowlist entry for a command that no longer exists", () => {
    const result = findOrphanedCliCommands({
      declarations: [],
      attachedSymbols: [],
      allowlist: [{ symbol: "goneCommand", reason: "deleted" }],
    });
    expect(result.staleAllowlist).toEqual(["goneCommand"]);
  });
});

describe("toFindings / formatFinding", () => {
  it("sorts orphans by symbol and puts stale allowlist entries last", () => {
    const findings = toFindings({
      orphans: [
        { symbol: "zCommand", name: "z", file: "z.ts" },
        { symbol: "aCommand", name: "a", file: "a.ts" },
      ],
      staleAllowlist: ["goneCommand"],
    });
    expect(findings.map((f) => f.symbol)).toEqual(["aCommand", "zCommand", "goneCommand"]);
  });

  it("names the file and command in an orphan message", () => {
    expect(formatFinding({ kind: "orphan", symbol: "fooCommand", name: "foo", file: "f.ts" })).toBe(
      'f.ts: `fooCommand` declares command "foo" but nothing attaches it'
    );
  });

  it("tells the reader to remove a stale allowlist entry", () => {
    expect(formatFinding({ kind: "stale-allowlist", symbol: "gone" })).toContain("remove it");
  });
});

describe("the real repo tree", () => {
  it("has every declared CLI command attached", () => {
    const { orphans, staleAllowlist } = findOrphanedCliCommands(scanRepo(repoRoot));
    expect({ orphans, staleAllowlist }).toEqual({ orphans: [], staleAllowlist: [] });
  });

  it("finds the real command surface, so a silently-empty scan cannot pass vacuously", () => {
    const { declarations, attachedSymbols } = scanRepo(repoRoot);
    expect(declarations.length).toBeGreaterThan(20);
    expect(attachedSymbols.length).toBeGreaterThan(20);
    expect(declarations.map((d) => d.name)).toContain("health");
  });

  it("ships with an empty allowlist — no exemption is currently claimed", () => {
    expect(ALLOWLIST).toEqual([]);
  });
});
