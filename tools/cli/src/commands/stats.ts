import { Command } from "commander";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Helpers ───────────────────────────────────────────────────────────────

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

interface AgentSessionRecord {
  timestamp: string;
  sessionId: string;
  milestone?: string;
  modelId: string;
  researchTurns: number;
  executionTurns: number;
  totalTurns: number;
  firstPassSuccess: boolean;
  humanInterventions: number;
  costUsd: number;
}

// ── Commands ──────────────────────────────────────────────────────────────

export const logSessionCommand = new Command("log-session")
  .description("Log agent session performance metrics")
  .requiredOption("--id <string>", "Unique session/task ID")
  .option("--milestone <string>", "Current milestone (e.g. v1.3)")
  .option("--model <string>", "Model ID used", "unknown")
  .requiredOption("--research <number>", "Number of research turns", parseInt)
  .requiredOption("--execution <number>", "Number of execution turns", parseInt)
  .option("--success", "Whether it passed on first attempt", false)
  .option("--interventions <number>", "Number of human interventions", parseInt, 0)
  .option("--cost <number>", "Estimated cost in USD", parseFloat, 0)
  .action(async (options) => {
    const root = findMonorepoRoot(process.cwd());
    const logDir = join(root, "docs/logs");
    const logFile = join(logDir, "agent-perf.jsonl");

    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const record: AgentSessionRecord = {
      timestamp: new Date().toISOString(),
      sessionId: options.id,
      milestone: options.milestone,
      modelId: options.model,
      researchTurns: options.research,
      executionTurns: options.execution,
      totalTurns: options.research + options.execution,
      firstPassSuccess: !!options.success,
      humanInterventions: options.interventions,
      costUsd: options.cost,
    };

    appendFileSync(logFile, JSON.stringify(record) + "\n");
    console.log(`✅ Session ${options.id} logged to ${logFile}`);
  });

export const statsCommand = new Command("stats")
  .description("Show agent performance statistics")
  .action(async () => {
    const root = findMonorepoRoot(process.cwd());
    const logFile = join(root, "docs/logs/agent-perf.jsonl");

    if (!existsSync(logFile)) {
      console.log("No performance data found. Run some tasks first!");
      return;
    }

    const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
    const records: AgentSessionRecord[] = lines.map((l) => JSON.parse(l));

    const total = records.length;
    const avgResearch = records.reduce((sum, r) => sum + r.researchTurns, 0) / total;
    const avgExecution = records.reduce((sum, r) => sum + r.executionTurns, 0) / total;
    const successRate = (records.filter((r) => r.firstPassSuccess).length / total) * 100;
    const totalCost = records.reduce((sum, r) => sum + r.costUsd, 0);
    const totalInterventions = records.reduce((sum, r) => sum + r.humanInterventions, 0);

    console.log("\n📊 Agent Performance Scoreboard");
    console.log("===============================");
    console.log(`Total Sessions:         ${total}`);
    console.log(`Avg Research Turns:     ${avgResearch.toFixed(2)}`);
    console.log(`Avg Execution Turns:    ${avgExecution.toFixed(2)}`);
    console.log(`First-Pass Success:     ${successRate.toFixed(1)}%`);
    console.log(`Human Interventions:    ${totalInterventions} (${(totalInterventions/total).toFixed(2)} per session)`);
    console.log(`Total Cost (Est):       $${totalCost.toFixed(2)}`);
    console.log("");
  });

export const auditPerfCommand = new Command("audit-perf")
  .description("Analyze agent performance logs and suggest optimizations")
  .option("--auto-plan", "Automatically generate a GSD plan for the top improvement", false)
  .action(async (options) => {
    const root = findMonorepoRoot(process.cwd());
    const logFile = join(root, "docs/logs/agent-perf.jsonl");
    const lastAuditFile = join(root, "docs/logs/last-audit.json");

    if (!existsSync(logFile)) {
      console.log("No performance data found. Run some tasks first!");
      return;
    }

    const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
    const records: AgentSessionRecord[] = lines.map((l) => JSON.parse(l));

    console.log("\n🕵️  Agent Performance Audit");
    console.log("===========================");

    const improvements: { id: string; msg: string; action: string; priority: number }[] = [];

    // 1. Check for high research turns (Discovery issues)
    const highResearch = records.filter(r => r.researchTurns > 5);
    if (highResearch.length > 0) {
      const avg = highResearch.reduce((sum, r) => sum + r.researchTurns, 0) / highResearch.length;
      improvements.push({
        id: "discovery",
        msg: `High Research Turns detected (Avg: ${avg.toFixed(1)})`,
        action: "Run 'mbe pack <directory>' on frequently touched directories to compress context.",
        priority: avg > 8 ? 1 : 2
      });
    }

    // 2. Check for low first-pass success (Guardrail issues)
    const failures = records.filter(r => !r.firstPassSuccess);
    if (failures.length > 0) {
      const rate = (failures.length / records.length) * 100;
      improvements.push({
        id: "guardrails",
        msg: `${rate.toFixed(1)}% of tasks failed on first pass`,
        action: "Identify the failure pattern and implement a new Custom ESLint Rule (Phase 27).",
        priority: rate > 20 ? 1 : 2
      });
    }

    // 3. Check for human interventions (Guideline issues)
    const interventions = records.filter(r => r.humanInterventions > 0);
    if (interventions.length > 0) {
      improvements.push({
        id: "guidelines",
        msg: `Human interventions detected in ${interventions.length} sessions`,
        action: "Update AGENTS.md with specific naming or architectural guidelines to eliminate ambiguity.",
        priority: 1
      });
    }

    if (improvements.length === 0) {
      console.log("✅ No significant process bottlenecks detected! Your AI velocity is optimized.");
      return;
    }

    // Sort by priority
    improvements.sort((a, b) => a.priority - b.priority);

    console.log("Identified Optimization Opportunities:");
    improvements.forEach((imp, i) => console.log(`${i + 1}. ${imp.msg}. ACTION: ${imp.action}`));

    // Save findings for recursion detection
    writeFileSync(lastAuditFile, JSON.stringify({ timestamp: new Date().toISOString(), improvements }, null, 2));

    // Auto-plan generation
    if (options.autoPlan && improvements.length > 0) {
      const top = improvements[0];
      const quickDir = join(root, ".planning/quick");
      const planPath = join(quickDir, "AUTO-PERF-OPTIMIZATION.md");
      
      if (!existsSync(quickDir)) mkdirSync(quickDir, { recursive: true });

      const planContent = `# Auto-Generated Performance Optimization: ${top.id}\n\n**Source**: mbe audit-perf\n**Detected Issue**: ${top.msg}\n\n## Objective\n${top.action}\n\n## Implementation Steps\n1. Analyze the last 5 sessions in \`docs/logs/agent-perf.jsonl\` to find specific files.\n2. Apply the recommended optimization.\n3. Verify improvement by running \`mbe stats\`.\n`;
      
      writeFileSync(planPath, planContent);
      console.log(`\n🚀 Created autonomous optimization plan at: ${planPath}`);
    }
    
    console.log("");
  });
