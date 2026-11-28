import { describe, expect, it } from "vitest";
import {
  GATE_SLOT_MAX,
  activeGateWorktrees,
  decideGateSlot,
  gateProcesses,
  isGateCommand,
  parseLsofCwds,
  worktreeOf,
} from "../gate-slot.mjs";

const ROOT = "/Users/me/repo/.claude/worktrees";

// Process lines shaped like `ps -axo pid=,command=` output captured 2026-11-27 (#10082).
const abs = (wt, tail) => ({ command: `node ${ROOT}/${wt}/node_modules/.bin/../${tail}`, cwd: "" });

describe("isGateCommand", () => {
  it.each([
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm run build",
    "pnpm --dir /x/apps/hospitality test",
    "pnpm --filter @mbe/hospitality typecheck",
    "pnpm check:knip",
    "cd /x && pnpm typecheck",
    "pnpm exec turbo run size:check --filter=...[origin/main]",
    "npx tsc --noEmit",
    "pnpm exec vitest run src/foo.test.ts",
    "pnpm --dir /x exec eslint src/",
    "VITEST_MAX_WORKERS=2 pnpm test",
    "./node_modules/.bin/vitest run --config x.mjs",
  ])("treats %j as a gate", (cmd) => {
    expect(isGateCommand(cmd)).toBe(true);
  });

  it.each([
    "git status",
    "pnpm install --frozen-lockfile",
    "pnpm add -D @mbe/test-utils",
    "ls node_modules",
    "ls eslint.config.js",
    "cat /x/.claude/worktrees/agent-x/vitest.config.ts",
    "grep -rn tsc .",
    'git commit -m "fix eslint warning"',
    "gh pr view 12",
    "",
  ])("does not treat %j as a gate", (cmd) => {
    expect(isGateCommand(cmd)).toBe(false);
  });
});

describe("worktreeOf", () => {
  it("reads the worktree from a --dir path in the command", () => {
    expect(worktreeOf(`pnpm --dir ${ROOT}/agent-abc/apps/hospitality test`, "/Users/me/repo")).toBe(
      "agent-abc"
    );
  });

  it("falls back to the payload cwd", () => {
    expect(worktreeOf("pnpm lint", `${ROOT}/agent-def/apps/web`)).toBe("agent-def");
  });

  it("returns empty for the main checkout", () => {
    expect(worktreeOf("pnpm lint", "/Users/me/repo")).toBe("");
  });
});

describe("gateProcesses", () => {
  it("keeps gate binaries, relative or absolute, and drops shell wrappers and others", () => {
    const ps = [
      ` 101 node ${ROOT}/agent-a/node_modules/.bin/../typescript/bin/tsc --noEmit`,
      " 102 node ./node_modules/.bin/../vitest/vitest.mjs run --maxWorkers=2",
      ` 103 /bin/zsh -c source snap && eval 'node ${ROOT}/agent-z/node_modules/.bin/../eslint/bin/eslint.js'`,
      " 104 node /Users/me/.npm/_npx/x/node_modules/.bin/mcp-server-github",
    ].join("\n");
    expect(gateProcesses(ps).map((p) => p.pid)).toEqual([101, 102]);
  });
});

describe("parseLsofCwds", () => {
  it("maps each pid to its cwd from `lsof -Fn` output", () => {
    const out = ["p102", "fcwd", `n${ROOT}/agent-b/apps/hospitality`, "p103", "fcwd", "n/tmp"].join(
      "\n"
    );
    expect(parseLsofCwds(out)).toEqual(
      new Map([
        [102, `${ROOT}/agent-b/apps/hospitality`],
        [103, "/tmp"],
      ])
    );
  });
});

describe("activeGateWorktrees", () => {
  it("attributes by argv path, else by cwd", () => {
    const procs = [
      abs("agent-a", "typescript/bin/tsc --noEmit -p tsconfig.test.json"),
      abs("agent-a", "eslint/bin/eslint.js src/"),
      {
        command: "node ./node_modules/.bin/../vitest/vitest.mjs run",
        cwd: `${ROOT}/agent-b/apps/hospitality`,
      },
      {
        command: `${ROOT}/agent-c/node_modules/.pnpm/@turbo+darwin-arm64@2.11.13/node_modules/@turbo/darwin-arm64/bin/turbo run lint`,
        cwd: "",
      },
      { command: "node ./node_modules/.bin/../vitest/vitest.mjs run", cwd: "/Users/me/repo" },
    ];
    expect([...activeGateWorktrees(procs)].sort()).toEqual(["agent-a", "agent-b", "agent-c"]);
  });
});

describe("decideGateSlot", () => {
  const busy = ["agent-a", "agent-b", "agent-c"].map((wt) =>
    abs(wt, "typescript/bin/tsc --noEmit")
  );

  it("defaults to three slots", () => {
    expect(GATE_SLOT_MAX).toBe(3);
  });

  it("does not wait for a non-gate command", () => {
    expect(
      decideGateSlot({ command: "git status", cwd: `${ROOT}/agent-d`, procs: busy }).wait
    ).toBe(false);
  });

  it("does not wait for a main-checkout gate", () => {
    expect(decideGateSlot({ command: "pnpm test", cwd: "/Users/me/repo", procs: busy }).wait).toBe(
      false
    );
  });

  it("waits when every slot is held by other worktrees", () => {
    const d = decideGateSlot({ command: "pnpm test", cwd: `${ROOT}/agent-d`, procs: busy });
    expect(d).toMatchObject({ wait: true, worktree: "agent-d" });
    expect(d.active.sort()).toEqual(["agent-a", "agent-b", "agent-c"]);
  });

  it("lets a worktree that already holds a slot keep going", () => {
    expect(decideGateSlot({ command: "pnpm test", cwd: `${ROOT}/agent-a`, procs: busy }).wait).toBe(
      false
    );
  });

  it("counts a relative pnpm-exec vitest by its cwd as holding a slot", () => {
    const procs = [
      ...busy,
      {
        command: "node ./node_modules/.bin/../vitest/vitest.mjs run",
        cwd: `${ROOT}/agent-d/apps/x`,
      },
    ];
    expect(decideGateSlot({ command: "pnpm typecheck", cwd: `${ROOT}/agent-d`, procs }).wait).toBe(
      false
    );
  });

  it("proceeds when a slot is free", () => {
    const procs = [abs("agent-a", "vitest/vitest.mjs run")];
    expect(decideGateSlot({ command: "pnpm lint", cwd: `${ROOT}/agent-d`, procs }).wait).toBe(
      false
    );
  });

  it("honours a custom max", () => {
    const procs = [abs("agent-a", "vitest/vitest.mjs run")];
    expect(
      decideGateSlot({ command: "pnpm lint", cwd: `${ROOT}/agent-d`, procs, max: 1 }).wait
    ).toBe(true);
  });
});
