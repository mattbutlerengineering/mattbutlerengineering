/**
 * Marketing `prebuild` step: write the live Rialto component count to the
 * gitignored `src/data/generated/rialto-component-count.json`.
 *
 * Runs after turbo has built `@mattbutlerengineering/rialto` (a workspace
 * dependency), so the compiled manifest exists. If it does not (e.g. a bare
 * `vite build` on a fresh clone), the script leaves the committed
 * `rialto-component-count.fallback.json` in charge — a repo test keeps that
 * fallback equal to the manifest. Always exits 0.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readRialtoComponentCount } from "../../../scripts/rialto-component-count.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUTPUT = resolve(ROOT, "apps/marketing/src/data/generated/rialto-component-count.json");

try {
  const rialtoComponents = readRialtoComponentCount(ROOT);
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify({ rialtoComponents })}\n`);
  process.stdout.write(`write-rialto-component-count: ${rialtoComponents} components\n`);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stdout.write(`write-rialto-component-count: ${reason} — keeping committed fallback\n`);
}
