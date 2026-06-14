/**
 * Tests for the migrated whoami command using the defineCommand seam.
 * Asserts returned CommandResult values — no console/process.exit spies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("conf", () => ({
  default: class MockConf {
    private store = new Map<string, unknown>();
    get(key: string) {
      return this.store.get(key);
    }
    set(key: string, value: unknown) {
      this.store.set(key, value);
    }
    delete(key: string) {
      this.store.delete(key);
    }
  },
}));

vi.mock("../api.js", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../config.js", () => ({
  isAuthenticated: vi.fn(() => false),
  getApiUrl: vi.fn(() => "http://localhost:3001"),
  getAccessToken: vi.fn(() => undefined),
}));

describe("whoami command (value-asserted via seam)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function runWhoamiRun(authenticated: boolean, apiResult?: unknown, apiError?: Error) {
    const { isAuthenticated } = await import("../config.js");
    vi.mocked(isAuthenticated).mockReturnValue(authenticated);

    const { apiRequest } = await import("../api.js");
    if (apiError) {
      vi.mocked(apiRequest).mockRejectedValue(apiError);
    } else if (apiResult !== undefined) {
      vi.mocked(apiRequest).mockResolvedValue(apiResult as never);
    }

    const { whoamiRun } = await import("../commands/whoami.js");
    return whoamiRun({});
  }

  it("returns error result when not authenticated", async () => {
    const result = await runWhoamiRun(false);

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("Not logged in");
    expect(err.exitCode).toBe(1);
  });

  it("returns rows result with user info when authenticated", async () => {
    const result = await runWhoamiRun(true, {
      data: { id: "user-123", email: "test@example.com", name: "Test User" },
    });

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain("user-123");
    expect(flat).toContain("test@example.com");
    expect(flat).toContain("Test User");
  });

  it("shows (not set) when user name is null", async () => {
    const result = await runWhoamiRun(true, {
      data: { id: "user-456", email: "noname@example.com", name: null },
    });

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain("(not set)");
  });

  it("returns error result when API request fails", async () => {
    const result = await runWhoamiRun(true, undefined, new Error("API unavailable"));

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("API unavailable");
    expect(err.exitCode).toBe(1);
  });
});
