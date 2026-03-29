import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

import { execFile } from "node:child_process";
import {
  verifyDeployment,
  getCloudflareWorkerVersion,
  rollbackCloudflareWorker,
} from "../deploy-verifier.js";
import type { HealthCheck } from "../deploy-verifier.js";

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
);

const TEST_CHECKS: readonly HealthCheck[] = [
  { name: "Site", url: "https://example.com/", type: "http_status" },
  { name: "API", url: "https://example.com/health", type: "json_health" },
];

describe("verifyDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when all checks succeed", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "200" }) // Site HTTP check
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: "ok" }) }); // API health

    const result = await verifyDeployment(TEST_CHECKS, { maxRetries: 1 });

    expect(result.passed).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
    expect(result.checks).toHaveLength(2);
  });

  it("fails when HTTP check returns non-200", async () => {
    mockExecFile
      .mockResolvedValue({ stdout: "503" }); // All attempts return 503

    const singleCheck: readonly HealthCheck[] = [
      { name: "Site", url: "https://example.com/", type: "http_status" },
    ];

    const result = await verifyDeployment(singleCheck, {
      maxRetries: 1,
      retryDelayMs: 0,
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain("Site");
  });

  it("fails when JSON health returns non-ok status", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({ status: "degraded" }),
    });

    const singleCheck: readonly HealthCheck[] = [
      { name: "API", url: "https://example.com/health", type: "json_health" },
    ];

    const result = await verifyDeployment(singleCheck, {
      maxRetries: 1,
      retryDelayMs: 0,
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain("API");
  });

  it("retries and succeeds on second attempt", async () => {
    mockExecFile
      .mockResolvedValueOnce({ stdout: "503" }) // First attempt fails
      .mockResolvedValueOnce({ stdout: "200" }); // Second attempt succeeds

    const singleCheck: readonly HealthCheck[] = [
      { name: "Site", url: "https://example.com/", type: "http_status" },
    ];

    const result = await verifyDeployment(singleCheck, {
      maxRetries: 2,
      retryDelayMs: 0,
    });

    expect(result.passed).toBe(true);
    expect(result.checks[0].attempts).toBe(2);
  });

  it("handles connection failures gracefully", async () => {
    mockExecFile.mockRejectedValue(new Error("Connection refused"));

    const singleCheck: readonly HealthCheck[] = [
      { name: "Site", url: "https://example.com/", type: "http_status" },
    ];

    const result = await verifyDeployment(singleCheck, {
      maxRetries: 1,
      retryDelayMs: 0,
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0].status).toBe("connection_failed");
  });

  it("runs checks in parallel", async () => {
    let callCount = 0;
    mockExecFile.mockImplementation(async () => {
      callCount++;
      return { stdout: callCount <= 2 ? "200" : JSON.stringify({ status: "ok" }) };
    });

    const result = await verifyDeployment(TEST_CHECKS, { maxRetries: 1 });

    // Both checks should have been started (parallel execution)
    expect(result.checks).toHaveLength(2);
  });
});

describe("getCloudflareWorkerVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the latest version ID", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ id: "v1-abc" }, { id: "v0-old" }]),
    });

    const version = await getCloudflareWorkerVersion("my-worker");

    expect(version).toBe("v1-abc");
  });

  it("returns null on error", async () => {
    mockExecFile.mockRejectedValue(new Error("wrangler not found"));

    const version = await getCloudflareWorkerVersion("my-worker");

    expect(version).toBeNull();
  });
});

describe("rollbackCloudflareWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true on successful rollback", async () => {
    mockExecFile.mockResolvedValue({ stdout: "Rolled back" });

    const result = await rollbackCloudflareWorker("my-worker", "v0-old", "health check failed");

    expect(result).toBe(true);
  });

  it("returns false on rollback failure", async () => {
    mockExecFile.mockRejectedValue(new Error("rollback failed"));

    const result = await rollbackCloudflareWorker("my-worker", "v0-old", "reason");

    expect(result).toBe(false);
  });
});
