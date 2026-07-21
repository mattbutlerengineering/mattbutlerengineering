import type { Finding, SourceFile } from "../types.js";
import { applyRules, type Rule } from "../rule-engine.js";

/** Outbound network calls — medium on their own. */
const OUTBOUND_RULES: readonly Rule[] = [
  {
    pattern: /\b(fetch|axios|got|superagent)\s*\(/,
    category: "data-exfiltration",
    severity: "med",
  },
  {
    pattern: /\bhttps?\.request\s*\(/,
    category: "data-exfiltration",
    severity: "med",
  },
  {
    pattern: /\bnavigator\.sendBeacon\s*\(/,
    category: "data-exfiltration",
    severity: "med",
  },
  {
    pattern: /\b(curl|wget)\b/,
    category: "data-exfiltration",
    severity: "med",
  },
];

/** Reads of secrets / credentials — low on their own. */
const SECRET_RULES: readonly Rule[] = [
  {
    pattern: /\bprocess\.env\b/,
    category: "data-exfiltration",
    severity: "low",
  },
  {
    pattern: /\bos\.homedir\s*\(/,
    category: "data-exfiltration",
    severity: "low",
  },
  {
    pattern: /(~|\$HOME)\/\.(ssh|aws|gnupg)\b/,
    category: "data-exfiltration",
    severity: "low",
  },
  {
    pattern: /\.npmrc\b|\bAWS_SECRET|\bGITHUB_TOKEN\b/,
    category: "data-exfiltration",
    severity: "low",
  },
];

/**
 * Detect data-exfiltration risk. An outbound call OR a secret read alone is
 * low/medium; a file that does BOTH is escalated to a single high finding
 * (the classic "read credentials, POST them out" pattern).
 */
export function detectDataExfiltration(file: SourceFile): Finding[] {
  const outbound = applyRules(file.relPath, file.content, OUTBOUND_RULES);
  const secrets = applyRules(file.relPath, file.content, SECRET_RULES);
  const findings: Finding[] = [...outbound, ...secrets];

  const firstOutbound = outbound[0];
  const firstSecret = secrets[0];
  if (firstOutbound && firstSecret) {
    findings.push({
      category: "data-exfiltration",
      severity: "high",
      file: file.relPath,
      line: firstOutbound.line,
      evidence: `outbound call (line ${firstOutbound.line}) combined with secret read (line ${firstSecret.line})`,
    });
  }

  return findings;
}
