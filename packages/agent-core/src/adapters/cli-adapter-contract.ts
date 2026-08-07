/**
 * CliAdapterContract — the structural surface `runCliAdapterSession` needs
 * from a CLI-based adapter: its `name` and its `dispatch()` method.
 *
 * Extracted from `CliAdapterBase` to break the cli-adapter-base.ts ↔
 * run-cli-adapter-session.ts import cycle (#3913). `run-cli-adapter-session.ts`
 * only ever calls `dispatch()` and reads `name` — it never needs the concrete
 * class — so it imports this narrow interface instead of the full base class.
 * `CliAdapterBase` explicitly `implements` it, so any future signature drift
 * between the two is a compile error rather than a silent mismatch.
 */

import type { AdapterConfig, AdapterResult } from "../cli-adapter.js";

export interface CliAdapterContract {
  /** Unique adapter name (e.g. "gemini", "opencode"). */
  readonly name: string;

  /**
   * Spawn the CLI subprocess and detect changes WITHOUT committing them.
   * See `CliAdapterBase.dispatch()` for the full contract.
   */
  dispatch(config: AdapterConfig): Promise<AdapterResult>;
}
