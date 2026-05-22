#!/usr/bin/env node

/**
 * Adaptive cadence governor for RemoteTriggers.
 *
 * Checks workload (ready issue count) and decides whether the current
 * trigger firing should execute or skip. Skills read the governor state
 * to decide whether to proceed.
 *
 * Usage:
 *   node plugins/acmm/scripts/cadence-governor.js          # check and update state
 *   node plugins/acmm/scripts/cadence-governor.js --status  # print current mode
 *   node plugins/acmm/scripts/cadence-governor.js --execute # mark that execution happened
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE_PATH = path.resolve(".claude/governor-state.json");
const MAX_HISTORY = 100;

/** @type {Record<string, {min: number, label: string, skipWindow: number}>} */
const MODES = {
  SURGE: { min: 11, label: "SURGE", skipWindow: 0 },
  BUSY: { min: 5, label: "BUSY", skipWindow: 0 },
  QUIET: { min: 2, label: "QUIET", skipWindow: 60 }, // skip if executed within 60 min
  IDLE: { min: 0, label: "IDLE", skipWindow: Infinity }, // always skip
};

/**
 * Determine the cadence mode from the ready issue count.
 * @param {number} readyCount
 * @returns {"SURGE" | "BUSY" | "QUIET" | "IDLE"}
 */
export function determineMode(readyCount) {
  if (readyCount >= MODES.SURGE.min) return "SURGE";
  if (readyCount >= MODES.BUSY.min) return "BUSY";
  if (readyCount >= MODES.QUIET.min) return "QUIET";
  return "IDLE";
}

/**
 * Decide whether to execute based on mode and last execution time.
 * @param {string} mode
 * @param {string | null} lastExecution - ISO timestamp or null
 * @param {number} [now] - current time in ms (for testing)
 * @returns {boolean}
 */
export function shouldExecute(mode, lastExecution, now = Date.now()) {
  const modeDef = MODES[mode];
  if (!modeDef) return true;
  if (modeDef.skipWindow === 0) return true;
  if (modeDef.skipWindow === Infinity) return false;
  if (!lastExecution) return true;

  const elapsed = (now - new Date(lastExecution).getTime()) / (1000 * 60);
  return elapsed >= modeDef.skipWindow;
}

/**
 * Fetch the count of open issues labeled 'ready' via gh CLI.
 * @returns {number | null} - null if gh is unavailable
 */
export function getReadyCount() {
  try {
    const result = execFileSync(
      "gh",
      [
        "issue",
        "list",
        "--label",
        "ready",
        "--state",
        "open",
        "--json",
        "number",
        "--jq",
        "length",
      ],
      { encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] }
    );
    return parseInt(result.trim(), 10) || 0;
  } catch {
    return null; // gh unavailable
  }
}

/**
 * Load governor state from disk.
 * @param {string} statePath
 * @returns {object}
 */
export function loadState(statePath = DEFAULT_STATE_PATH) {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return {
      mode: null,
      readyCount: 0,
      lastCheck: null,
      lastExecution: null,
      shouldExecute: true,
      history: [],
    };
  }
}

/**
 * Save governor state to disk.
 * @param {object} state
 * @param {string} statePath
 */
export function saveState(state, statePath = DEFAULT_STATE_PATH) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

/**
 * Build fallback state when gh CLI is unavailable.
 * Persists a history entry so state accumulates even without metrics.
 * @param {object} previousState
 * @param {number} [now] - current time in ms (for testing)
 * @returns {object} fallback state
 */
export function buildFallbackState(previousState, now = Date.now()) {
  const timestamp = new Date(now).toISOString();
  return {
    ...previousState,
    lastCheck: timestamp,
    shouldExecute: true,
    history: [
      ...previousState.history.slice(-(MAX_HISTORY - 1)),
      {
        date: timestamp,
        mode: previousState.mode ?? "UNKNOWN",
        readyCount: null,
        executed: true,
        reason: "gh-unavailable",
      },
    ],
  };
}

/**
 * Build updated state from current inputs.
 * @param {object} params
 * @param {number} params.readyCount
 * @param {object} params.previousState
 * @param {number} [params.now] - current time in ms (for testing)
 * @returns {object} new state
 */
export function buildNextState({ readyCount, previousState, now = Date.now() }) {
  const mode = determineMode(readyCount);
  const execute = shouldExecute(mode, previousState.lastExecution, now);
  const timestamp = new Date(now).toISOString();

  return {
    mode,
    readyCount,
    lastCheck: timestamp,
    lastExecution: previousState.lastExecution,
    shouldExecute: execute,
    history: [
      ...previousState.history.slice(-(MAX_HISTORY - 1)),
      { date: timestamp, mode, readyCount, executed: execute },
    ],
  };
}

/**
 * CLI entry point. Only runs when this file is executed directly.
 */
function main() {
  const args = new Set(process.argv.slice(2));
  const statePath = DEFAULT_STATE_PATH;

  if (args.has("--execute")) {
    const state = loadState(statePath);
    const updated = { ...state, lastExecution: new Date().toISOString() };
    saveState(updated, statePath);
    console.log(`Governor: marked execution at ${updated.lastExecution}`);
    process.exit(0);
  }

  const readyCount = getReadyCount();
  if (readyCount === null) {
    console.log("Governor: gh CLI unavailable, defaulting to execute");
    const previousState = loadState(statePath);
    const fallbackState = buildFallbackState(previousState);
    saveState(fallbackState, statePath);
    process.exit(0);
  }

  const previousState = loadState(statePath);
  const newState = buildNextState({ readyCount, previousState });
  saveState(newState, statePath);

  const priorMode = previousState.mode;
  const modeChanged = priorMode && priorMode !== newState.mode;

  if (args.has("--status")) {
    console.log(`Mode: ${newState.mode} (${readyCount} ready issues)`);
    console.log(`Should execute: ${newState.shouldExecute}`);
    if (modeChanged) console.log(`Mode transition: ${priorMode} → ${newState.mode}`);
    console.log(`Last execution: ${previousState.lastExecution || "never"}`);
    process.exit(0);
  }

  // Default: print decision for consumption by calling skill
  if (modeChanged) {
    console.log(`Governor: mode transition ${priorMode} → ${newState.mode} (${readyCount} ready)`);
  }
  console.log(
    `Governor: ${newState.mode} mode, ${readyCount} ready → ${newState.shouldExecute ? "EXECUTE" : "SKIP"}`
  );

  // Exit code: 0 = execute, 1 = skip
  if (!newState.shouldExecute) process.exit(1);
}

// Run main() only when executed directly (not imported for testing)
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main();
}
