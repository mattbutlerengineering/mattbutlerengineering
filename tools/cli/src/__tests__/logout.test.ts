import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();

vi.mock("conf", () => ({
  default: class MockConf {
    get(key: string) { return store.get(key); }
    set(key: string, value: unknown) { store.set(key, value); }
    delete(key: string) { store.delete(key); }
  },
}));

describe("logout command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    store.clear();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  async function runLogout(): Promise<void> {
    const { logoutCommand } = await import("../commands/logout.js");
    await logoutCommand.parseAsync([], { from: "user" });
  }

  it("clears tokens and logs success message", async () => {
    store.set("accessToken", "some-token");
    store.set("refreshToken", "some-refresh");
    store.set("tokenExpiry", Date.now() + 60_000);

    await runLogout();

    expect(store.has("accessToken")).toBe(false);
    expect(store.has("refreshToken")).toBe(false);
    expect(store.has("tokenExpiry")).toBe(false);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Logged out successfully");
  });

  it("works even when no tokens are stored", async () => {
    await runLogout();
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Logged out successfully");
  });
});
