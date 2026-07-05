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
 * Cross-file data-exfiltration correlation.
 *
 * `detectDataExfiltration` only escalates to `high` when a secret read and an
 * outbound call live in the SAME file. A package can split the two — read
 * credentials in `config.js`, POST them out from `transport.js` — leaving only
 * a `low` secret read and a `med` outbound call that never escalate. This phase
 * runs over the AGGREGATED findings, after per-file collection, and rebuilds
 * that split "read credentials, send them out" pattern across file boundaries.
 *
 * Classification follows the data-exfiltration heuristic's severity contract:
 * within the `data-exfiltration` category, outbound-call rules emit `med` and
 * secret-read rules emit `low`. The intra-file combined finding is `high` and
 * is intentionally excluded (its file already pairs with itself).
 */
function correlateCrossFileExfiltration(findings: readonly Finding[]): Finding[] {
  const firstByFile = (predicate: (f: Finding) => boolean): Map<string, Finding> => {
    const map = new Map<string, Finding>();
    for (const f of findings) {
      if (predicate(f) && !map.has(f.file)) map.set(f.file, f);
    }
    return map;
  };

  const outbound = firstByFile((f) => f.category === "data-exfiltration" && f.severity === "med");
  const secrets = firstByFile((f) => f.category === "data-exfiltration" && f.severity === "low");

  const correlated: Finding[] = [];
  for (const [outFile, outFinding] of outbound) {
    for (const [secretFile, secretFinding] of secrets) {
      if (outFile === secretFile) continue; // intra-file: already escalated by the heuristic
      correlated.push({
        category: "data-exfiltration",
        severity: "high",
        file: outFile,
        correlatedWith: secretFile,
        line: outFinding.line,
        evidence:
          `cross-file exfiltration: secret read in ${secretFile} (line ${secretFinding.line}) ` +
          `sent via outbound call in ${outFile} (line ${outFinding.line})`,
      });
    }
  }
  return correlated;
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
  const perFile: Finding[] = files.flatMap((file) => [
    ...detectPromptInjection(file),
    ...detectDataExfiltration(file),
    ...detectMaliciousCommands(file),
  ]);
  const correlatedFindings = correlateCrossFileExfiltration(perFile);
  const findings: Finding[] = [...perFile, ...correlatedFindings];
  return {
    verdict: computeVerdict(findings),
    findings,
    ...(correlatedFindings.length > 0 ? { correlatedFindings } : {}),
  };
}
