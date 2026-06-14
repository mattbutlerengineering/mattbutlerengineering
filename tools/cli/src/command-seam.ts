/**
 * defineCommand / CommandResult seam.
 *
 * Commands return a structured CommandResult instead of calling
 * console.log / process.exit directly. ONE runner (runCommand) owns:
 *   - auth gating
 *   - --json vs human-table output
 *   - error → exit-code mapping
 *   - NO_COLOR suppression
 *
 * This makes migrated commands unit-testable by value assertion (no spies).
 */
import { isAuthenticated } from "./config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A row value can be any primitive or record we want rendered. */
export type Row = Record<string, unknown>;

export type CommandResult =
  | { kind: "rows"; rows: Row[]; footer?: string }
  | { kind: "json"; data: unknown }
  | { kind: "error"; message: string; exitCode?: number };

export type RunOptions = Record<string, unknown>;

/** Options available to the runner (mirrors the --json flag Commander provides). */
export interface RenderOptions {
  json?: boolean;
}

// ── defineCommand ─────────────────────────────────────────────────────────────

interface CommandConfig<O extends RunOptions = RunOptions> {
  /** When true, the runner checks isAuthenticated() before calling run. */
  requiresAuth?: boolean;
  run: (opts: O) => Promise<CommandResult>;
}

/**
 * Wraps a command handler so that:
 * - auth is checked before run() when requiresAuth is true
 * - thrown errors are caught and returned as error CommandResults
 *
 * Returns a function (opts) => Promise<CommandResult> so it can be called
 * directly in tests without Commander boilerplate.
 */
export function defineCommand<O extends RunOptions = RunOptions>(
  config: CommandConfig<O>
): (opts: O) => Promise<CommandResult> {
  return async (opts: O): Promise<CommandResult> => {
    if (config.requiresAuth && !isAuthenticated()) {
      return {
        kind: "error",
        message: "Not logged in. Run: mbe login",
        exitCode: 1,
      };
    }

    try {
      return await config.run(opts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { kind: "error", message, exitCode: 1 };
    }
  };
}

// ── runCommand ────────────────────────────────────────────────────────────────

function errorPrefix(): string {
  return process.env.NO_COLOR ? "Error: " : "\x1b[31mError:\x1b[0m ";
}

function renderRows(rows: Row[]): void {
  for (const row of rows) {
    const values = Object.values(row)
      .map((v) => String(v ?? ""))
      .join("\t");
    console.log(values);
  }
}

/**
 * Renders a CommandResult to stdout/stderr and calls process.exit on error.
 * This is the ONLY place that touches console/process.exit in the seam.
 */
export async function runCommand(result: CommandResult, opts: RenderOptions): Promise<void> {
  switch (result.kind) {
    case "json": {
      if (opts.json) {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        // json result without --json flag: pretty print the object
        console.log(JSON.stringify(result.data, null, 2));
      }
      break;
    }
    case "rows": {
      if (opts.json) {
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        renderRows(result.rows);
        if (result.footer) {
          console.log("");
          console.log(result.footer);
        }
      }
      break;
    }
    case "error": {
      console.error(`${errorPrefix()}${result.message}`);
      process.exit(result.exitCode ?? 1);
      break;
    }
  }
}
