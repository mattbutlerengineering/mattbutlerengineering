import type { Finding, SourceFile } from "../types.js";
import { applyRules, isProseFile, type Rule } from "../rule-engine.js";

/**
 * Detect prompt-injection attempts in skill markdown / tool descriptions:
 * instruction-override phrases, hidden unicode, and base64 blobs buried in prose.
 */
const RULES: readonly Rule[] = [
  // Instruction-override phrasing — the classic injection. High severity → block.
  {
    pattern:
      /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all)\b[^.\n]{0,40}\b(instruction|prompt|direction|rule|context)/i,
    category: "prompt-injection",
    severity: "high",
  },
  {
    pattern:
      /\bdisregard\b[^.\n]{0,20}\b(your|the|any|all)\b[^.\n]{0,20}\bsystem\b[^.\n]{0,20}\bprompt\b/i,
    category: "prompt-injection",
    severity: "high",
  },
  // Role-reassignment — common in legit prose too, so only medium.
  {
    pattern: /\byou are now\b/i,
    category: "prompt-injection",
    severity: "med",
  },
  // Hidden / zero-width characters used to smuggle instructions past human review.
  {
    pattern: /[\u200B-\u200D\u2060\uFEFF]/,
    category: "prompt-injection",
    severity: "med",
  },
];

// A long base64 run hidden inside prose (not code) — possible encoded payload.
const BASE64_BLOB = /[A-Za-z0-9+/]{80,}={0,2}/;

export function detectPromptInjection(file: SourceFile): Finding[] {
  const findings = applyRules(file.relPath, file.content, RULES);

  if (isProseFile(file.relPath)) {
    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (BASE64_BLOB.test(lines[i])) {
        findings.push({
          category: "prompt-injection",
          severity: "med",
          file: file.relPath,
          line: i + 1,
          evidence: `base64-like blob (${lines[i].trim().length} chars) embedded in prose`,
        });
      }
    }
  }

  return findings;
}
