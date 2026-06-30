export type { Category, Severity, Verdict, Finding, ScanResult, SourceFile } from "./types.js";
export { scanPackage, computeVerdict } from "./scan-package.js";
export { collectFiles } from "./collect-files.js";
export { run } from "./run-cli.js";
export type { CliIo } from "./run-cli.js";
export { detectPromptInjection } from "./heuristics/prompt-injection.js";
export { detectDataExfiltration } from "./heuristics/data-exfiltration.js";
export { detectMaliciousCommands } from "./heuristics/malicious-commands.js";
