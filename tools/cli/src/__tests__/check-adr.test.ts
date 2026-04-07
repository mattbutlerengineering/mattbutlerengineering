import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { glob } from "glob";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("glob", () => ({
  glob: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockGlob = vi.mocked(glob);

describe("check-adr command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // findMonorepoRoot: pnpm-workspace.yaml exists
    mockExistsSync.mockReturnValue(true);
  });

  async function runCheckAdr(args: string[] = []): Promise<void> {
    const { checkAdrCommand } = await import("../commands/adr.js");
    await checkAdrCommand.parseAsync(["check-adr", ...args], { from: "user" });
  }

  it("exits gracefully when no ADR directory exists", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes("pnpm-workspace.yaml")) return true;
      return false; // docs/adr does not exist
    });

    await runCheckAdr();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("No ADRs found");
  });

  it("skips ADRs with non-active status", async () => {
    mockReaddirSync.mockReturnValue(["001-deprecated.md"] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      `---\nid: ADR-001\ntitle: Old Decision\nstatus: deprecated\nprohibited_patterns:\n  - 'console\\.log'\n---\nContent here`
    );
    mockGlob.mockResolvedValue([] as never);

    await runCheckAdr();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("No active ADRs with prohibited patterns found");
  });

  it("detects prohibited pattern violations", async () => {
    mockReaddirSync.mockReturnValue(["001-no-console.md"] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.endsWith("001-no-console.md")) {
        return `---\nid: ADR-001\ntitle: No Console Logs\nstatus: active\nprohibited_patterns:\n  - 'console\\.log'\n---\nWe prohibit console.log in production.`;
      }
      return `import { foo } from './bar';\nconsole.log("bad");\nconsole.log("also bad");\n`;
    });

    mockGlob.mockResolvedValue(["src/app.ts"] as never);

    await runCheckAdr();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join(" ");
    expect(errorOutput).toContain("Violation");
    expect(errorOutput).toContain("ADR-001");
  });

  it("passes when no violations are found", async () => {
    mockReaddirSync.mockReturnValue(["001-no-eval.md"] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.endsWith("001-no-eval.md")) {
        return `---\nid: ADR-001\ntitle: No Eval\nstatus: active\nprohibited_patterns:\n  - '\\beval\\b'\n---\nDon't use eval.`;
      }
      return `const x = 1;\nconst y = 2;\n`;
    });

    mockGlob.mockResolvedValue(["src/clean.ts"] as never);

    await runCheckAdr();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("No architectural violations detected");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("skips ADRs without prohibited_patterns", async () => {
    mockReaddirSync.mockReturnValue(["001-info-only.md"] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      `---\nid: ADR-001\ntitle: Info Only\nstatus: active\n---\nJust an informational ADR.`
    );
    mockGlob.mockResolvedValue([] as never);

    await runCheckAdr();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("No active ADRs with prohibited patterns found");
  });

  it("handles malformed YAML frontmatter gracefully", async () => {
    mockReaddirSync.mockReturnValue(["001-bad.md"] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      `---\n  bad: yaml: [broken\n---\nContent`
    );
    mockGlob.mockResolvedValue([] as never);

    await runCheckAdr();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("No active ADRs with prohibited patterns found");
  });
});
