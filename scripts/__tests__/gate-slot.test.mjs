import { describe, expect, it } from "vitest";
import {
  GATE_SLOT_MAX,
  activeGateWorktrees,
  decideGateSlot,
  isGateCommand,
  worktreeOf,
} from "../gate-slot.mjs";

const ROOT = "/Users/me/repo/.claude/worktrees";

// Real process lines, shaped like `ps -axo command=` output captured 2026-11-27 (#10082).
const psLine = (wt, tail) => `node ${ROOT}/${wt}/node_modules/.bin/../${tail}`;

describe("isGateCommand", () => {
  it.each([
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm run build",
    "pnpm --dir /x/apps/hospitality test",
    "pnpm check:knip",
    "cd /x && pnpm typecheck",
    "pnpm exec turbo run size:check --filter=...[origin/main]",
    "npx tsc --noEmit",
    "pnpm exec vitest run src/foo.test.ts",
    "pnpm exec eslint src/",
  ])("treats %j as a gate", (cmd) => {
    expect(isGateCommand(cmd)).toBe(true);
  });

  it.each(["git status", "pnpm install --frozen-lockfile", "ls node_modules", "gh pr view 12", ""])(
    "does not treat %j as a gate",
    (cmd) => {
      expect(isGateCommand(cmd)).toBe(false);
    }
  );
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

describe("activeGateWorktrees", () => {
  it("collects distinct worktrees running tsc, eslint, vitest or turbo", () => {
    const ps = [
      psLine("agent-a", "typescript/bin/tsc --noEmit -p tsconfig.test.json"),
      psLine("agent-a", "eslint/bin/eslint.js src/"),
      psLine("agent-b", "vitest/vitest.mjs run"),
      `${ROOT}/agent-c/node_modules/.pnpm/@turbo+darwin-arm64@2.11.13/node_modules/@turbo/darwin-arm64/bin/turbo run lint`,
      "node /Users/me/.npm/_npx/x/node_modules/.bin/mcp-server-github",
    ].join("\n");
    expect([...activeGateWorktrees(ps)].sort()).toEqual(["agent-a", "agent-b", "agent-c"]);
  });

  it("ignores shell wrappers whose command text merely names a worktree gate", () => {
    const ps = `/bin/zsh -c source snap && eval 'node ${ROOT}/agent-z/node_modules/.bin/../eslint/bin/eslint.js src/'`;
    expect(activeGateWorktrees(ps).size).toBe(0);
  });
});

describe("decideGateSlot", () => {
  const busy = ["agent-a", "agent-b", "agent-c"]
    .map((wt) => psLine(wt, "typescript/bin/tsc --noEmit"))
    .join("\n");

  it("defaults to three slots", () => {
    expect(GATE_SLOT_MAX).toBe(3);
  });

  it("does not wait for a non-gate command", () => {
    expect(
      decideGateSlot({ command: "git status", cwd: `${ROOT}/agent-d`, psText: busy }).wait
    ).toBe(false);
  });

  it("does not wait for a main-checkout gate", () => {
    expect(decideGateSlot({ command: "pnpm test", cwd: "/Users/me/repo", psText: busy }).wait).toBe(
      false
    );
  });

  it("waits when every slot is held by other worktrees", () => {
    const d = decideGateSlot({ command: "pnpm test", cwd: `${ROOT}/agent-d`, psText: busy });
    expect(d).toMatchObject({ wait: true, worktree: "agent-d" });
    expect(d.active.sort()).toEqual(["agent-a", "agent-b", "agent-c"]);
  });

  it("lets a worktree that already holds a slot keep going", () => {
    expect(
      decideGateSlot({ command: "pnpm test", cwd: `${ROOT}/agent-a`, psText: busy }).wait
    ).toBe(false);
  });

  it("proceeds when a slot is free", () => {
    const ps = psLine("agent-a", "vitest/vitest.mjs run");
    expect(decideGateSlot({ command: "pnpm lint", cwd: `${ROOT}/agent-d`, psText: ps }).wait).toBe(
      false
    );
  });

  it("honours a custom max", () => {
    const ps = psLine("agent-a", "vitest/vitest.mjs run");
    expect(
      decideGateSlot({ command: "pnpm lint", cwd: `${ROOT}/agent-d`, psText: ps, max: 1 }).wait
    ).toBe(true);
  });
});
