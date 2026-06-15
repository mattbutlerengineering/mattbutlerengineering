/**
 * Tests for the migrated users command using the defineCommand seam.
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

const mockRequest = vi.fn();

vi.mock("../cli-api-client.js", () => ({
  createCliApiClient: vi.fn(() => ({ request: mockRequest })),
  createAgentApiClient: vi.fn(() => ({ request: vi.fn() })),
}));

vi.mock("../config.js", () => ({
  isAuthenticated: vi.fn(() => false),
  getApiUrl: vi.fn(() => "http://localhost:3001"),
  getAccessToken: vi.fn(() => undefined),
}));

describe("users list run (value-asserted via seam)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequest.mockReset();
  });

  async function runListRun(authenticated: boolean, apiResult?: unknown, apiError?: Error) {
    const { isAuthenticated } = await import("../config.js");
    vi.mocked(isAuthenticated).mockReturnValue(authenticated);

    if (apiError) {
      mockRequest.mockRejectedValue(apiError);
    } else if (apiResult !== undefined) {
      mockRequest.mockResolvedValue(apiResult as never);
    }

    const { usersListRun } = await import("../commands/users.js");
    return usersListRun({ page: "1", limit: "10" });
  }

  it("returns error when not authenticated", async () => {
    const result = await runListRun(false);

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("Not logged in");
    expect(err.exitCode).toBe(1);
  });

  it("returns rows with user data when authenticated", async () => {
    const result = await runListRun(true, {
      data: [
        { id: "u1", email: "alice@example.com", name: "Alice" },
        { id: "u2", email: "bob@example.com", name: null },
      ],
      pagination: { page: 1, totalPages: 1, total: 2 },
    });

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain("alice@example.com");
    expect(flat).toContain("bob@example.com");
  });

  it("returns rows with empty message when no users found", async () => {
    const result = await runListRun(true, {
      data: [],
      pagination: { page: 1, totalPages: 0, total: 0 },
    });

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    expect(rows.rows).toHaveLength(0);
  });

  it("returns error result when API fails", async () => {
    const result = await runListRun(true, undefined, new Error("Network error"));

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("Network error");
    expect(err.exitCode).toBe(1);
  });
});

describe("users get run (value-asserted via seam)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequest.mockReset();
  });

  async function runGetRun(
    authenticated: boolean,
    id: string,
    apiResult?: unknown,
    apiError?: Error
  ) {
    const { isAuthenticated } = await import("../config.js");
    vi.mocked(isAuthenticated).mockReturnValue(authenticated);

    if (apiError) {
      mockRequest.mockRejectedValue(apiError);
    } else if (apiResult !== undefined) {
      mockRequest.mockResolvedValue(apiResult as never);
    }

    const { usersGetRun } = await import("../commands/users.js");
    return usersGetRun({ id });
  }

  it("returns error when not authenticated", async () => {
    const result = await runGetRun(false, "user-123");

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("Not logged in");
  });

  it("returns rows with user detail when authenticated", async () => {
    const result = await runGetRun(true, "user-123", {
      data: {
        id: "user-123",
        email: "alice@example.com",
        name: "Alice",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    });

    expect(result.kind).toBe("rows");
    const rows = result as Extract<typeof result, { kind: "rows" }>;
    const flat = JSON.stringify(rows.rows);
    expect(flat).toContain("user-123");
    expect(flat).toContain("alice@example.com");
    expect(flat).toContain("Yes"); // emailVerified
  });

  it("returns error result when API fails", async () => {
    const result = await runGetRun(true, "bad-id", undefined, new Error("Not found"));

    expect(result.kind).toBe("error");
    const err = result as Extract<typeof result, { kind: "error" }>;
    expect(err.message).toContain("Not found");
  });
});
