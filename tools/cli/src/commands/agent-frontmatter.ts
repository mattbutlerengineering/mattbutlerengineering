/**
 * `mbe agent frontmatter` — parse the yaml agent block from an issue body
 * into `mbe agent run` flags (#2021).
 *
 * Reads the body from --body-file or stdin. Prints the flag string to
 * stdout (empty when there are no usable overrides) and warnings to
 * stderr. Always exits 0: the issue-worker loop falls back to the model
 * router on empty output, so failure here must never crash the loop.
 */
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { parseAgentFrontmatter, flagsFromOverrides } from "../issue-frontmatter.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export const frontmatterCommand = new Command("frontmatter")
  .description(
    "Parse the yaml agent block from an issue body (stdin or --body-file) into mbe agent run flags"
  )
  .option("--body-file <path>", "Read the issue body from a file instead of stdin")
  .option("--field <name>", "Print a single field value instead of flags (e.g. --field verify)")
  .action(async (options: { bodyFile?: string; field?: string }) => {
    if (!options.bodyFile && process.stdin.isTTY) {
      console.warn(
        "frontmatter: stdin is a terminal and no --body-file given; pipe an issue body in"
      );
      console.log("");
      return;
    }

    let body: string;
    try {
      body = options.bodyFile ? readFileSync(options.bodyFile, "utf-8") : await readStdin();
    } catch (err) {
      console.warn(`frontmatter: cannot read issue body: ${(err as Error).message}`);
      console.log("");
      return;
    }

    const { overrides, warnings } = parseAgentFrontmatter(body);

    if (options.field !== undefined) {
      const value = overrides ? (overrides as Record<string, unknown>)[options.field] : undefined;
      console.log(typeof value === "string" ? value : "");
      return;
    }

    for (const warning of warnings) {
      console.warn(`frontmatter: ${warning}`);
    }
    console.log(flagsFromOverrides(overrides).join(" "));
  });
