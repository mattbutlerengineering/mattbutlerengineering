import { collectFiles } from "./collect-files.js";
import { detectPromptInjection } from "./heuristics/prompt-injection.js";
import { detectDataExfiltration } from "./heuristics/data-exfiltration.js";
import { detectMaliciousCommands } from "./heuristics/malicious-commands.js";
import type { Finding, ScanResult, Verdict } from "./types.js";

/** Derive the overall verdict from the highest-severity finding present. */
export function computeVerdict(findings: readonly Finding[]): Verdict {
  if (findings.some((f) => f.severity === "high")) return "block";
  if (findings.some((f) => f.severity === "med")) return "flag";
  return "pass";
}

/**
 * Statically scan a third-party skill / MCP package directory.
 *
 * SAFETY: this only reads files as text and runs regexes over them. It never
 * imports, requires, evaluates, or spawns the scanned package. It is safe to
 * run against fully untrusted code.
 */
export function scanPackage(dir: string): ScanResult {
  const files = collectFiles(dir);
  const findings: Finding[] = files.flatMap((file) => [
    ...detectPromptInjection(file),
    ...detectDataExfiltration(file),
    ...detectMaliciousCommands(file),
  ]);
  return { verdict: computeVerdict(findings), findings };
}
