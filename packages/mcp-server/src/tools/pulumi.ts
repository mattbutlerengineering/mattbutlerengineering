import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pulumiJson } from "../command-builder.js";

/**
 * Pulumi project dir (holds Pulumi.yaml), resolved from this file's location so it
 * is independent of the server's cwd. src/tools and dist/tools are the same depth.
 */
export const PULUMI_PROJECT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../infrastructure/pulumi"
);

export async function pulumiStackOutputs(run = pulumiJson): Promise<string> {
  return run(["-C", PULUMI_PROJECT_DIR, "stack", "output", "--json", "--stack", "prod"]);
}
