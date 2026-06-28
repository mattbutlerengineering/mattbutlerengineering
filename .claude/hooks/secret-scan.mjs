#!/usr/bin/env node
/**
 * secret-scan.mjs — PreToolUse hook: block edits that plant a hardcoded secret.
 *
 * Reads the PreToolUse payload on stdin, extracts the content an agent is about
 * to write (Write/Edit/MultiEdit), and runs the high-confidence
 * {@link scanForSecrets} detector. On a hit it writes a typed BLOCK message to
 * stderr and exits 2 (which Claude Code surfaces as a tool-call block). Clean
 * content exits 0 silently.
 *
 * Fails OPEN: any parse/read error exits 0 so a hook bug can never deadlock
 * normal editing. Detection logic lives in scripts/secret-scan.mjs (unit-tested).
 */
import { scanForSecrets } from "../../scripts/secret-scan.mjs";

let input = "";
const timeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(input);
    const tool = data.tool_name;
    if (tool !== "Write" && tool !== "Edit" && tool !== "MultiEdit") {
      process.exit(0);
    }

    const ti = data.tool_input || {};
    const filePath = ti.file_path || "";

    const parts = [];
    if (typeof ti.content === "string") parts.push(ti.content);
    if (typeof ti.new_string === "string") parts.push(ti.new_string);
    if (Array.isArray(ti.edits)) {
      for (const e of ti.edits) {
        if (e && typeof e.new_string === "string") parts.push(e.new_string);
      }
    }

    const { matched, type } = scanForSecrets(parts.join("\n"), filePath);
    if (matched) {
      process.stderr.write(
        `BLOCK: possible hardcoded secret (${type}) in ${filePath || "this edit"}. ` +
          `Never commit live secrets — use environment variables or a secret manager.\n`
      );
      process.exit(2);
    }
    process.exit(0);
  } catch {
    // Fail open: never block editing because of a hook error.
    process.exit(0);
  }
});
