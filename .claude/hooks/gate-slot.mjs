#!/usr/bin/env node
/**
 * gate-slot.mjs — PreToolUse Bash hook: queue worktree gate runs (#10082).
 *
 * A gate command (lint/typecheck/test/build, turbo, tsc, vitest, eslint) aimed
 * at a `.claude/worktrees/<name>` tree waits here until fewer than
 * GATE_SLOT_MAX other worktrees have gate processes running. Decision logic
 * lives in scripts/gate-slot.mjs (unit-tested).
 *
 * Fails OPEN: a parse or `ps` error, or waiting past MAX_WAIT_MS, exits 0 so the
 * command runs. MAX_WAIT_MS stays under the 600 s timeout in settings.json.
 */
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  decideGateSlot,
  gateProcesses,
  parseLsofCwds,
  worktreeOf,
} from "../../scripts/gate-slot.mjs";

const POLL_MS = 5_000;
const MAX_WAIT_MS = 540_000;

const readStdin = async () => {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

/** Gate processes with a cwd for each one whose argv names no worktree (`pnpm exec`). */
const listGateProcesses = () => {
  const procs = gateProcesses(run("ps", ["-axo", "pid=,command="]));
  const unplaced = procs.filter((p) => !worktreeOf(p.command, "")).map((p) => p.pid);
  let cwds = new Map();
  if (unplaced.length > 0) {
    try {
      cwds = parseLsofCwds(run("lsof", ["-a", "-d", "cwd", "-Fn", "-p", unplaced.join(",")]));
    } catch (err) {
      // lsof exits 1 when a listed pid has exited; its stdout still holds the rest.
      cwds = parseLsofCwds(String(err?.stdout ?? ""));
    }
  }
  return procs.map((p) => ({ command: p.command, cwd: cwds.get(p.pid) ?? "" }));
};

try {
  const data = JSON.parse(await readStdin());
  if (data.tool_name !== "Bash") process.exit(0);
  const command = data.tool_input?.command ?? "";
  const cwd = data.cwd ?? "";

  const deadline = Date.now() + MAX_WAIT_MS;
  while (decideGateSlot({ command, cwd, procs: listGateProcesses() }).wait) {
    if (Date.now() >= deadline) break;
    await sleep(POLL_MS + Math.floor(Math.random() * 2_000)); // jitter spreads freed waiters
  }
} catch {
  // Fail open: never block a Bash call because of a hook error.
}
process.exit(0);
