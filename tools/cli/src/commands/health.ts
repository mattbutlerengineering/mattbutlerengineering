import { Command } from "commander";
import { defineCommand } from "../command-seam.js";
import type { CommandResult } from "../command-seam.js";

const HEALTH_URL = "https://mattbutlerengineering.com/health/system";

interface ServiceHealth {
  status: string;
  version?: string;
  latency?: number;
  checks?: Array<{ name: string; status: string; latency?: number }>;
}

interface SystemHealth {
  status: string;
  timestamp: string;
  services?: Record<string, ServiceHealth>;
  staticSites?: Record<string, { status: string }>;
  ci?: { status: string };
  deploy?: { status: string };
}

// ── Formatting helpers (human output only) ────────────────────────────────────

function colorize(text: string, status: string): string {
  const colors: Record<string, string> = {
    healthy: "\x1b[32m",
    ok: "\x1b[32m",
    degraded: "\x1b[33m",
    unhealthy: "\x1b[31m",
    error: "\x1b[31m",
    unknown: "\x1b[90m",
  };
  const reset = "\x1b[0m";
  const color = colors[status] ?? colors.unknown;
  return `${color}${text}${reset}`;
}

function statusIcon(status: string): string {
  switch (status) {
    case "healthy":
    case "ok":
      return "\x1b[32m●\x1b[0m";
    case "degraded":
      return "\x1b[33m●\x1b[0m";
    case "unhealthy":
    case "error":
      return "\x1b[31m●\x1b[0m";
    default:
      return "\x1b[90m●\x1b[0m";
  }
}

function padRight(str: string, len: number): string {
  return str + " ".repeat(Math.max(0, len - str.length));
}

function formatOutput(data: SystemHealth): void {
  console.log();
  console.log(`  System: ${colorize(data.status.toUpperCase(), data.status)}`);
  console.log(`  Checked: ${data.timestamp}`);
  console.log();

  if (data.services) {
    console.log("  \x1b[1mAPI Services\x1b[0m");
    for (const [name, svc] of Object.entries(data.services)) {
      const latency = svc.latency != null ? `${svc.latency}ms` : "";
      const version = svc.version ? `v${svc.version}` : "";
      console.log(
        `    ${statusIcon(svc.status)} ${padRight(name, 16)} ${padRight(latency, 8)} ${version}`
      );
    }
    console.log();
  }

  if (data.staticSites) {
    console.log("  \x1b[1mStatic Sites\x1b[0m");
    for (const [name, site] of Object.entries(data.staticSites)) {
      console.log(`    ${statusIcon(site.status)} ${name}`);
    }
    console.log();
  }

  if (data.ci) {
    console.log(`  \x1b[1mCI:\x1b[0m ${statusIcon(data.ci.status)} ${data.ci.status}`);
  }
  if (data.deploy) {
    console.log(`  \x1b[1mDeploy:\x1b[0m ${statusIcon(data.deploy.status)} ${data.deploy.status}`);
  }
  console.log();
}

async function fetchHealth(): Promise<SystemHealth> {
  const response = await fetch(HEALTH_URL, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Health endpoint returned ${response.status}`);
  }
  return response.json() as Promise<SystemHealth>;
}

// ── Pure run function (returns CommandResult) ─────────────────────────────────

/**
 * Fetches health data and returns a CommandResult.
 * No auth required; no console/process.exit calls.
 */
export const healthRun = defineCommand({
  async run(): Promise<CommandResult> {
    const data = await fetchHealth();
    return { kind: "json", data };
  },
});

// ── Commander wiring ──────────────────────────────────────────────────────────

export const healthCommand = new Command("health")
  .description("Show system health status")
  .option("--json", "Output raw JSON")
  .option("--watch", "Refresh every 10 seconds")
  .action(async (options: { json?: boolean; watch?: boolean }) => {
    const run = async () => {
      const result = await healthRun({});

      if (result.kind === "error") {
        console.error(
          `\x1b[31mError:\x1b[0m ${(result as Extract<typeof result, { kind: "error" }>).message}`
        );
        if (!options.watch) process.exit(1);
        return;
      }

      if (result.kind === "json") {
        const data = (result as Extract<typeof result, { kind: "json" }>).data as SystemHealth;
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          if (options.watch) {
            process.stdout.write("\x1b[2J\x1b[H");
          }
          formatOutput(data);
        }
      }
    };

    await run();

    if (options.watch) {
      setInterval(run, 10_000);
    }
  });
