import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();

vi.mock("conf", () => ({
  default: class MockConf {
    get(key: string) { return store.get(key); }
    set(key: string, value: unknown) { store.set(key, value); }
    delete(key: string) { store.delete(key); }
  },
}));

describe("login command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    store.clear();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  async function runLogin(args: string[]): Promise<void> {
    const { loginCommand } = await import("../commands/login.js");
    await loginCommand.parseAsync(args, { from: "user" });
  }

  it("logs in with --token flag and stores token", async () => {
    await runLogin(["--token", "my-access-token"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Logged in successfully");
    // Token should be stored in config
    expect(store.get("accessToken")).toBe("my-access-token");
  });

  it("sets api URL when --api-url is provided", async () => {
    await runLogin(["--api-url", "https://api.example.com", "--token", "t"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("API URL set to: https://api.example.com");
    expect(store.get("apiUrl")).toBe("https://api.example.com");
  });

  it("shows device flow instructions when no token provided", async () => {
    await runLogin([]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Device Authorization Flow");
    expect(output).toContain("mbe login --token");
  });
});
