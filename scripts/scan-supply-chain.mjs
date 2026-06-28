#!/usr/bin/env node
/**
 * Supply-Chain Risk Scanner
 *
 * Inspects skill/MCP/plugin definition files for supply-chain risk signatures:
 *   1. prompt-injection — phrasing that hijacks LLM instruction following
 *   2. data-exfiltration — sending file/env data to external URLs
 *   3. malicious-command — shell commands that delete, exfiltrate, or execute downloaded code
 *
 * This is a DETECTION-ONLY tool — it reports findings, it does not modify or block.
 * Exits non-zero when high-severity findings are present so it can be wired into CI later.
 *
 * Usage:
 *   node scripts/scan-supply-chain.mjs [glob-or-file ...]
 *   node scripts/scan-supply-chain.mjs --json          # emit JSON report only
 *   node scripts/scan-supply-chain.mjs --summary       # emit human summary only (default)
 *
 * When no paths are provided, scans .claude/**\/*.md and .claude/**\/*.json by default.
 */

import fs, { globSync } from "node:fs";
import path from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ file: string; rule: string; severity: "high" | "medium" | "low"; line: number; snippet: string }} Finding
 * @typedef {{ rule: string; count: number }} RuleCount
 * @typedef {{ totalFindings: number; highCount: number; hasHighSeverity: boolean; byRule: RuleCount[] }} Summary
 * @typedef {{ scannedAt: string; summary: Summary; findings: Finding[] }} Report
 */

// ── Rule Definitions ───────────────────────────────────────────────────────────

/**
 * Each rule has:
 *   - id: machine-readable rule name
 *   - severity: fixed severity for all matches
 *   - patterns: array of RegExp — any match on a line triggers the rule
 *   - description: human-readable explanation
 *
 * NOTE: patterns are intentionally designed to match DESCRIPTIONS of harmful
 * behaviors in skill/MCP definition text, not to execute them.
 */
const RULES = [
  {
    id: "prompt-injection",
    severity: "high",
    description: "Prompt-injection phrasing that attempts to override LLM instructions",
    patterns: [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
      /forget\s+(everything|all)\s+(you\s+)?(were\s+)?(told|instructed|given)/i,
      /you\s+are\s+now\s+in\s+(developer|god|admin|jailbreak)\s+mode/i,
      /override\s+(your\s+)?(system\s+)?(prompt|instructions|rules)/i,
      /new\s+system\s+prompt\s*:/i,
      /\[system\]\s*:/i,
      /act\s+as\s+(if\s+you\s+(are|were)\s+)?(?:an?\s+)?(?:unrestricted|evil|malicious|jailbroken)/i,
      /reveal\s+your\s+(system\s+)?prompt/i,
      /print\s+your\s+(system\s+)?instructions/i,
    ],
  },
  {
    id: "data-exfiltration",
    severity: "high",
    description: "Sending file contents, environment variables, or secrets to external endpoints",
    patterns: [
      /fetch\s*\(\s*['"`]https?:\/\/[^'"` ]+['"`]\s*,\s*\{[^}]*(?:process\.env|fs\.|readFile|SECRET|TOKEN|KEY)/i,
      /(?:process\.env|env\s+vars?|environment\s+variables?|secrets?)\s*.*(?:send|post|upload|exfil)/i,
      /(?:send|post|upload|exfil)\s*.*(?:process\.env|env\s+vars?|secrets?)/i,
      /(?:curl|wget|fetch|axios|http)\s+.*(?:--data|--upload|-d)\s+.*(?:process\.env|\$\w+_(?:TOKEN|KEY|SECRET|PASSWORD))/i,
      /(?:POST|PUT)\s+.*https?:\/\/(?!localhost|127\.0\.0\.1)\S+.*(?:env|secret|token|key|password)/i,
      /JSON\.stringify\(process\.env\)/i,
      /(?:readFileSync|readFile)\s*\([^)]*\)\s*.*(?:fetch|axios|curl|send)\s*\(\s*['"`]https?:\/\//i,
    ],
  },
  {
    id: "malicious-command",
    severity: "high",
    description: "Shell commands that delete, exfiltrate, or download and execute code",
    patterns: [
      /rm\s+-[rf]+\s+[/~]/,
      /rm\s+-[rf]+\s+\*/,
      /(?:curl|wget)\s+\S+\s*\|\s*(?:bash|sh|zsh|ksh|python|perl|ruby|node)/i,
      /base64\s+-d\s*\|\s*(?:bash|sh|zsh|exec)/i,
      /echo\s+["'][A-Za-z0-9+/=]{10,}["']\s*\|\s*base64\s+-d\s*\|\s*(?:bash|sh)/i,
      /eval\s*\(\s*(?:atob|Buffer\.from|require\(['"]buffer['"]\)\.from)\(/,
      /(?:dd|shred)\s+.*(?:if=|of=\/dev\/(?!null))\S+/,
      /mkfifo\s+\S+.*(?:curl|wget|nc|netcat)/i,
      /python\s+-c\s+['"].*(?:import\s+os|exec|eval|subprocess)/i,
      /perl\s+-e\s+['"].*(?:exec|system|backtick)/i,
    ],
  },
];

// ── Core Scanner ───────────────────────────────────────────────────────────────

/**
 * Scan a single file and return all findings.
 *
 * @param {string} filePath - Absolute or relative file path
 * @returns {Finding[]}
 */
export function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const findings = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(line)) {
          findings.push({
            file: filePath,
            rule: rule.id,
            severity: rule.severity,
            line: lineIdx + 1,
            snippet: line.trim().slice(0, 200),
          });
          // One finding per rule per line — move to next rule after first match
          break;
        }
      }
    }
  }

  return findings;
}

/**
 * Scan multiple files and aggregate findings.
 *
 * @param {string[]} filePaths
 * @returns {Finding[]}
 */
export function scanFiles(filePaths) {
  return filePaths.flatMap((f) => scanFile(f));
}

// ── Summary + Report ───────────────────────────────────────────────────────────

/**
 * Build an aggregated summary from a list of findings.
 *
 * @param {Finding[]} findings
 * @returns {Summary}
 */
export function buildSummary(findings) {
  const highCount = findings.filter((f) => f.severity === "high").length;
  const ruleCounts = /** @type {Map<string, number>} */ (new Map());
  for (const f of findings) {
    ruleCounts.set(f.rule, (ruleCounts.get(f.rule) ?? 0) + 1);
  }
  const byRule = Array.from(ruleCounts.entries()).map(([rule, count]) => ({ rule, count }));

  return {
    totalFindings: findings.length,
    highCount,
    hasHighSeverity: highCount > 0,
    byRule,
  };
}

/**
 * Build a structured report suitable for JSON serialization.
 *
 * @param {Finding[]} findings
 * @returns {Report}
 */
export function buildReport(findings) {
  return {
    scannedAt: new Date().toISOString(),
    summary: buildSummary(findings),
    findings,
  };
}

// ── Human-Readable Output ──────────────────────────────────────────────────────

/**
 * Print a human-readable summary to stdout.
 *
 * @param {Report} report
 */
function printHumanSummary(report) {
  const { summary, findings } = report;

  console.log("\nSupply-Chain Risk Scanner");
  console.log("=".repeat(50));
  console.log(`Scanned at: ${report.scannedAt}`);
  console.log(`Total findings: ${summary.totalFindings}`);
  console.log(`High-severity:  ${summary.highCount}`);

  if (summary.byRule.length > 0) {
    console.log("\nFindings by rule:");
    for (const { rule, count } of summary.byRule) {
      const ruleInfo = RULES.find((r) => r.id === rule);
      console.log(`  ${rule}: ${count} (${ruleInfo?.description ?? ""})`);
    }
  }

  if (findings.length > 0) {
    console.log("\nDetailed findings:");
    for (const f of findings) {
      console.log(
        `  [${f.severity.toUpperCase()}] ${f.rule} @ ${f.file}:${f.line}\n    ${f.snippet}`
      );
    }
    console.log();
  } else {
    console.log("\nNo supply-chain risk patterns detected.");
  }
}

// ── Default Glob Targets ───────────────────────────────────────────────────────

/**
 * Returns default files to scan when no explicit targets are provided.
 * Scans .claude skill/plugin/MCP definition files.
 *
 * @param {string} root - Repository root
 * @returns {string[]}
 */
function defaultTargets(root) {
  const patterns = [
    ".claude/**/*.md",
    ".claude/**/*.json",
    ".claude/**/*.yaml",
    ".claude/**/*.yml",
  ];
  const files = [];
  for (const pattern of patterns) {
    try {
      const matched = globSync(pattern, {
        cwd: root,
        absolute: true,
        ignore: ["**/node_modules/**"],
      });
      files.push(...matched);
    } catch {
      // globSync not available in older Node — fall back silently
    }
  }
  return files;
}

// ── CLI Entry Point ────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.basename(process.argv[1]) === "scan-supply-chain.mjs";

if (isMain) {
  const args = process.argv.slice(2);
  const emitJson = args.includes("--json");
  const emitSummary = !emitJson || args.includes("--summary");

  const filePaths = args.filter((a) => !a.startsWith("--"));

  const root = path.resolve(process.cwd());
  const targets =
    filePaths.length > 0 ? filePaths.map((f) => path.resolve(root, f)) : defaultTargets(root);

  if (targets.length === 0) {
    console.error("No files to scan. Provide file paths or ensure .claude/ directory exists.");
    process.exit(0);
  }

  const existingTargets = targets.filter((t) => {
    try {
      return fs.statSync(t).isFile();
    } catch {
      return false;
    }
  });

  const findings = scanFiles(existingTargets);
  const report = buildReport(findings);

  if (emitJson) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (emitSummary) {
    printHumanSummary(report);
  }

  // Non-zero exit when high-severity findings present (enables CI wiring later)
  process.exit(report.summary.hasHighSeverity ? 1 : 0);
}
