import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Types ───────────────────────────────────────────────────────────

export interface HealthCheck {
  readonly name: string;
  readonly url: string;
  readonly type: "http_status" | "json_health";
}

export interface HealthCheckResult {
  readonly name: string;
  readonly url: string;
  readonly passed: boolean;
  readonly status: string;
  readonly attempts: number;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly checks: readonly HealthCheckResult[];
  readonly failedChecks: readonly string[];
}

export interface VerificationConfig {
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly timeoutMs: number;
}

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  maxRetries: 5,
  retryDelayMs: 3000,
  timeoutMs: 10000,
};

// ── Default health checks for mattbutlerengineering ─────────────────

export const DEFAULT_HEALTH_CHECKS: readonly HealthCheck[] = [
  { name: "Marketing", url: "https://mattbutlerengineering.com/", type: "http_status" },
  {
    name: "Hospitality",
    url: "https://mattbutlerengineering.com/hospitality",
    type: "http_status",
  },
  { name: "Rialto Web", url: "https://mattbutlerengineering.com/rialto", type: "http_status" },
  {
    name: "Users API",
    url: "https://mattbutlerengineering.com/api/v1/users/health",
    type: "json_health",
  },
  {
    name: "Reservations API",
    url: "https://mattbutlerengineering.com/api/health",
    type: "json_health",
  },
];

// ── Health check execution ──────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHttpStatus(
  url: string,
  timeoutMs: number
): Promise<{ passed: boolean; status: string }> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-sf",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--max-time",
      String(timeoutMs / 1000),
      url,
    ]);
    const code = stdout.trim();
    return { passed: code === "200", status: `HTTP ${code}` };
  } catch {
    return { passed: false, status: "connection_failed" };
  }
}

async function checkJsonHealth(
  url: string,
  timeoutMs: number
): Promise<{ passed: boolean; status: string }> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-sf",
      "--max-time",
      String(timeoutMs / 1000),
      url,
    ]);
    const response = JSON.parse(stdout) as { status?: string };
    const status = response.status ?? "unknown";
    return { passed: status === "ok", status };
  } catch {
    return { passed: false, status: "connection_failed" };
  }
}

async function runSingleCheck(
  check: HealthCheck,
  config: VerificationConfig
): Promise<HealthCheckResult> {
  const checkFn = check.type === "json_health" ? checkJsonHealth : checkHttpStatus;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    const result = await checkFn(check.url, config.timeoutMs);
    if (result.passed) {
      return {
        name: check.name,
        url: check.url,
        passed: true,
        status: result.status,
        attempts: attempt,
      };
    }

    if (attempt < config.maxRetries) {
      await sleep(config.retryDelayMs);
    }
  }

  const finalResult = await checkFn(check.url, config.timeoutMs);
  return {
    name: check.name,
    url: check.url,
    passed: finalResult.passed,
    status: finalResult.status,
    attempts: config.maxRetries,
  };
}

// ── Main verification ───────────────────────────────────────────────

/**
 * Run health checks against deployed endpoints.
 * Each check retries up to maxRetries times with retryDelayMs between attempts.
 */
export async function verifyDeployment(
  checks: readonly HealthCheck[] = DEFAULT_HEALTH_CHECKS,
  configOverrides?: Partial<VerificationConfig>
): Promise<VerificationResult> {
  const config = { ...DEFAULT_VERIFICATION_CONFIG, ...configOverrides };

  const results = await Promise.all(checks.map((check) => runSingleCheck(check, config)));

  const failedChecks = results.filter((r) => !r.passed).map((r) => r.name);

  return {
    passed: failedChecks.length === 0,
    checks: results,
    failedChecks,
  };
}

// ── Rollback helpers ────────────────────────────────────────────────

/**
 * Rollback a Cloudflare Worker to a previous version.
 */
export async function rollbackCloudflareWorker(
  workerName: string,
  versionId: string,
  reason: string
): Promise<boolean> {
  try {
    await execFileAsync("npx", [
      "wrangler",
      "rollback",
      versionId,
      "--name",
      workerName,
      "--message",
      reason,
      "--yes",
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current version ID of a Cloudflare Worker (for pre-deploy snapshot).
 */
export async function getCloudflareWorkerVersion(workerName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("npx", [
      "wrangler",
      "versions",
      "list",
      "--name",
      workerName,
      "--json",
    ]);
    const versions = JSON.parse(stdout) as readonly { id: string }[];
    return versions.length > 0 ? versions[0].id : null;
  } catch {
    return null;
  }
}
