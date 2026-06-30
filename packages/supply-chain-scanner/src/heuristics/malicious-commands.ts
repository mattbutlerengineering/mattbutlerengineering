import type { Finding, SourceFile } from "../types.js";
import { applyRules, type Rule } from "../rule-engine.js";

/**
 * Detect malicious command execution: piped remote shells, destructive removes,
 * eval, dynamic (non-literal) require/import, and writes to MCP/shell config.
 */
const RULES: readonly Rule[] = [
  // `curl ... | sh` / `wget ... | bash` — remote code execution. High → block.
  {
    pattern: /\b(curl|wget)\b[^|\n]*\|\s*(sh|bash|zsh)\b/i,
    category: "malicious-command",
    severity: "high",
  },
  // Destructive recursive remove of a real path. High → block.
  {
    pattern: /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME|\.)/,
    category: "malicious-command",
    severity: "high",
  },
  // eval of arbitrary input. High → block.
  {
    pattern: /\beval\s*\(/,
    category: "malicious-command",
    severity: "high",
  },
  // Dynamic require/import where the argument is NOT a plain string literal.
  {
    pattern: /\b(require|import)\s*\(\s*[^'"`)\s]/,
    category: "malicious-command",
    severity: "high",
  },
  // Writes targeting MCP config or shell rc files — config-injection vector.
  {
    pattern:
      /(writeFile|appendFile|writeFileSync|appendFileSync|>>?)\b[^\n]*\.(mcp\.json|bashrc|zshrc|profile|bash_profile)\b/,
    category: "malicious-command",
    severity: "high",
  },
  // Raw child_process / spawn / exec — medium (legit tools use these too).
  {
    pattern: /\bchild_process\b/,
    category: "malicious-command",
    severity: "med",
  },
  {
    pattern: /\b(execSync|exec|spawnSync|spawn|execFile|execFileSync)\s*\(/,
    category: "malicious-command",
    severity: "med",
  },
];

export function detectMaliciousCommands(file: SourceFile): Finding[] {
  return applyRules(file.relPath, file.content, RULES);
}
