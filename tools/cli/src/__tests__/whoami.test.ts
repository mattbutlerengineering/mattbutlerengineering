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

describe("whoami command", () => {
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

  async function runWhoami(): Promise<void> {
    const { whoamiCommand } = await import("../commands/whoami.js");
    await whoamiCommand.parseAsync([], { from: "user" });
  }

  it("exits with error message when not authenticated", async () => {
    // No token in store -> not authenticated
    await runWhoami();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Not logged in");
  });

  it("displays user info when authenticated", async () => {
    // Set valid token
    store.set("accessToken", "valid-token");
    store.set("tokenExpiry", Date.now() + 60_000);

    const { apiRequest } = await import("../api.js");
    vi.mocked(apiRequest).mockResolvedValue({
      data: {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      },
    } as never);

    await runWhoami();

    expect(exitSpy).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("user-123");
    expect(output).toContain("test@example.com");
    expect(output).toContain("Test User");
  });

  it("shows (not set) when user name is null", async () => {
    store.set("accessToken", "valid-token");
    store.set("tokenExpiry", Date.now() + 60_000);

    const { apiRequest } = await import("../api.js");
    vi.mocked(apiRequest).mockResolvedValue({
      data: {
        id: "user-456",
        email: "noname@example.com",
        name: null,
      },
    } as never);

    await runWhoami();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("(not set)");
  });

  it("exits with error when API request fails", async () => {
    store.set("accessToken", "valid-token");
    store.set("tokenExpiry", Date.now() + 60_000);

    const { apiRequest } = await import("../api.js");
    vi.mocked(apiRequest).mockRejectedValue(new Error("API unavailable"));

    await runWhoami();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("API unavailable");
  });
});
