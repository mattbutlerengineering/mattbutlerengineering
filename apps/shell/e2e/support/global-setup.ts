import { resolveTarget } from "./target.js";

/**
 * Runs once before any spec. Fails the whole run with a clear message when BASE_URL is absent,
 * so no spec can run, or pass, against an implied local stand-in. It lives here rather than in
 * the Playwright config so tools that merely load the config (knip, `--list`) do not need a target.
 */
export default function globalSetup(): void {
  resolveTarget(process.env);
}
