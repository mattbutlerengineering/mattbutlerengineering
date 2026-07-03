import type { AgentSession } from "@mbe/types";

// ── Formatting helpers shared across agent subcommands ──────────────────────

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function formatStatus(status: string): string {
  const icons: Record<string, string> = {
    pending: "○ pending",
    running: "◉ running",
    succeeded: "✓ succeeded",
    failed: "✗ failed",
    cancelled: "⊘ cancelled",
  };
  return icons[status] ?? status;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function printSession(session: AgentSession, verbose = false): void {
  console.log(`ID:         ${session.id}`);
  console.log(`Status:     ${formatStatus(session.status)}`);
  console.log(`Task:       ${session.taskDescription}`);
  console.log(`Model:      ${session.model}`);
  console.log(`Budget:     ${formatCost(session.maxBudgetUsd)}`);
  console.log(`Max turns:  ${session.maxTurns}`);
  console.log(`Branch:     ${session.branchName ?? "(not yet created)"}`);

  if (session.prUrl) {
    console.log(`PR:         ${session.prUrl}`);
  }

  if (session.costUsd !== null) {
    console.log(`Cost:       ${formatCost(session.costUsd)}`);
  }

  if (session.numTurns !== null) {
    console.log(`Turns:      ${session.numTurns}`);
  }

  if (session.durationMs !== null) {
    console.log(`Duration:   ${formatDuration(session.durationMs)}`);
  }

  if (session.inputTokens !== null && session.outputTokens !== null) {
    console.log(
      `Tokens:     ${session.inputTokens.toLocaleString()} in / ${session.outputTokens.toLocaleString()} out`
    );
  }

  console.log(`Created:    ${formatTimestamp(session.createdAt)}`);

  if (session.startedAt) {
    console.log(`Started:    ${formatTimestamp(session.startedAt)}`);
  }

  if (session.completedAt) {
    console.log(`Completed:  ${formatTimestamp(session.completedAt)}`);
  }

  if (session.errors.length > 0) {
    console.log("");
    console.log("Errors:");
    for (const error of session.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (verbose && session.resultText) {
    console.log("");
    console.log("Agent output:");
    console.log(session.resultText);
  }
}
