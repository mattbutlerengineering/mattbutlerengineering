import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();

vi.mock("conf", () => ({
  default: class MockConf {
    get(key: string) {
      return store.get(key);
    }
    set(key: string, value: unknown) {
      store.set(key, value);
    }
    delete(key: string) {
      store.delete(key);
    }
  },
}));

vi.mock("../api.js", () => ({
  apiRequest: vi.fn(),
}));

describe("users command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    store.clear();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  // ── users list ────────────────────────────────────────────────────────────

  describe("users list", () => {
    async function runUsersList(args: string[] = []): Promise<void> {
      const { usersCommand } = await import("../commands/users.js");
      await usersCommand.commands[0].parseAsync(args, { from: "user" });
    }

    it("exits when not authenticated", async () => {
      await runUsersList();

      expect(exitSpy).toHaveBeenCalledWith(1);
      // Auth error now routed through runCommand → console.error
      const output = errorSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Not logged in");
    });

    it("lists users when authenticated", async () => {
      store.set("accessToken", "valid-token");
      store.set("tokenExpiry", Date.now() + 60_000);

      const { apiRequest } = await import("../api.js");
      vi.mocked(apiRequest).mockResolvedValue({
        data: [
          { id: "u1", email: "alice@example.com", name: "Alice" },
          { id: "u2", email: "bob@example.com", name: null },
        ],
        pagination: { page: 1, totalPages: 1, total: 2 },
      } as never);

      await runUsersList();

      expect(exitSpy).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("alice@example.com");
      expect(output).toContain("bob@example.com");
      expect(output).toContain("Page 1 of 1");
    });

    it("shows 'No users found' when list is empty", async () => {
      store.set("accessToken", "valid-token");
      store.set("tokenExpiry", Date.now() + 60_000);

      const { apiRequest } = await import("../api.js");
      vi.mocked(apiRequest).mockResolvedValue({
        data: [],
        pagination: { page: 1, totalPages: 0, total: 0 },
      } as never);

      await runUsersList();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("No users found");
    });

    it("exits with error when API fails", async () => {
      store.set("accessToken", "valid-token");
      store.set("tokenExpiry", Date.now() + 60_000);

      const { apiRequest } = await import("../api.js");
      vi.mocked(apiRequest).mockRejectedValue(new Error("Network error"));

      await runUsersList();

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("Network error");
    });
  });

  // ── users get ─────────────────────────────────────────────────────────────

  describe("users get", () => {
    async function runUsersGet(id: string): Promise<void> {
      const { usersCommand } = await import("../commands/users.js");
      await usersCommand.commands[1].parseAsync([id], { from: "user" });
    }

    it("exits when not authenticated", async () => {
      await runUsersGet("user-123");

      expect(exitSpy).toHaveBeenCalledWith(1);
      // Auth error now routed through runCommand → console.error
      const output = errorSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Not logged in");
    });

    it("displays user details when authenticated", async () => {
      store.set("accessToken", "valid-token");
      store.set("tokenExpiry", Date.now() + 60_000);

      const { apiRequest } = await import("../api.js");
      vi.mocked(apiRequest).mockResolvedValue({
        data: {
          id: "user-123",
          email: "alice@example.com",
          name: "Alice",
          emailVerified: true,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        },
      } as never);

      await runUsersGet("user-123");

      expect(exitSpy).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("user-123");
      expect(output).toContain("alice@example.com");
      expect(output).toContain("Yes"); // emailVerified
    });

    it("exits with error when API fails", async () => {
      store.set("accessToken", "valid-token");
      store.set("tokenExpiry", Date.now() + 60_000);

      const { apiRequest } = await import("../api.js");
      vi.mocked(apiRequest).mockRejectedValue(new Error("Not found"));

      await runUsersGet("bad-id");

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
