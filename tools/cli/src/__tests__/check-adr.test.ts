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

// ── Fixture builders ─────────────────────────────────────────────────────

interface AdrFixture {
  file: string;
  id: string;
  title: string;
  status: string;
  date?: string;
  patterns?: string[];
  omitFields?: string[];
}

function adrContent(f: AdrFixture): string {
  const omit = new Set(f.omitFields ?? []);
  const lines = ["---"];
  if (!omit.has("id")) lines.push(`id: ${f.id}`);
  if (!omit.has("title")) lines.push(`title: ${f.title}`);
  if (!omit.has("status")) lines.push(`status: ${f.status}`);
  if (!omit.has("date") && f.date) lines.push(`date: ${f.date}`);
  if (f.patterns) {
    lines.push("prohibited_patterns:");
    for (const p of f.patterns) lines.push(`  - '${p}'`);
  }
  lines.push("---", "", `# ${f.id}: ${f.title}`);
  return lines.join("\n");
}

function readmeContent(rows: AdrFixture[]): string {
  const header =
    "# ADRs\n\n## Index\n\n| ADR | Title | Status | Date |\n| --- | --- | --- | --- |\n";
  const body = rows
    .map((r) => `| [${r.id}](${r.file}) | ${r.title} | ${r.status} | ${r.date} |`)
    .join("\n");
  return `${header}${body}\n`;
}

/** Wires readdirSync/readFileSync mocks for a corpus of ADR fixtures + a matching README index. */
function setupCorpus(fixtures: AdrFixture[], readmeOverride?: string): void {
  mockReaddirSync.mockReturnValue([
    ...fixtures.map((f) => f.file),
    "README.md",
  ] as unknown as ReturnType<typeof readdirSync>);

  mockReadFileSync.mockImplementation((filePath: unknown) => {
    const path = String(filePath);
    if (path.endsWith("README.md")) {
      return readmeOverride ?? readmeContent(fixtures);
    }
    const fixture = fixtures.find((f) => path.endsWith(f.file));
    return fixture ? adrContent(fixture) : "";
  });
}

const CLEAN_CORPUS: AdrFixture[] = [
  {
    file: "ADR-001-first.md",
    id: "ADR-001",
    title: "First Decision",
    status: "active",
    date: "2026-01-01",
    patterns: ["console\\.log"],
  },
  {
    file: "ADR-002-second.md",
    id: "ADR-002",
    title: "Second Decision",
    status: "superseded",
    date: "2026-02-01",
  },
];

describe("check-adr command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // findMonorepoRoot: return true for root and ADR dir
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith("pnpm-workspace.yaml") || path.includes("docs/adr");
    });
    mockGlob.mockResolvedValue([] as never);
  });

  async function runCheckAdr(args: string[] = []): Promise<void> {
    const { checkAdrCommand } = await import("../commands/adr.js");
    await checkAdrCommand.parseAsync(args, { from: "user" });
  }

  function errorOutput(): string {
    return errorSpy.mock.calls.flat().join(" ");
  }

  function logOutput(): string {
    return logSpy.mock.calls.flat().join(" ");
  }

  // ── Pre-existing behavior (unchanged) ────────────────────────────────

  it("exits gracefully when no ADR directory exists", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes("pnpm-workspace.yaml")) return true;
      return false; // docs/adr does not exist
    });

    await runCheckAdr();
    expect(logOutput()).toContain("No ADRs found");
  });

  it("skips ADRs with non-active status", async () => {
    setupCorpus([
      {
        file: "ADR-001-deprecated.md",
        id: "ADR-001",
        title: "Old Decision",
        status: "deprecated",
        date: "2026-01-01",
        patterns: ["console\\.log"],
      },
    ]);

    await runCheckAdr();
    expect(logOutput()).toContain("No active ADRs with prohibited patterns found");
  });

  it("detects prohibited pattern violations", async () => {
    setupCorpus([
      {
        file: "ADR-001-no-console.md",
        id: "ADR-001",
        title: "No Console Logs",
        status: "active",
        date: "2026-01-01",
        patterns: ["console\\.log"],
      },
    ]);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.endsWith("README.md")) {
        return readmeContent([
          {
            file: "ADR-001-no-console.md",
            id: "ADR-001",
            title: "No Console Logs",
            status: "active",
            date: "2026-01-01",
          },
        ]);
      }
      if (path.endsWith("ADR-001-no-console.md")) {
        return adrContent({
          file: "ADR-001-no-console.md",
          id: "ADR-001",
          title: "No Console Logs",
          status: "active",
          date: "2026-01-01",
          patterns: ["console\\.log"],
        });
      }
      return `import { foo } from './bar';\nconsole.log("bad");\nconsole.log("also bad");\n`;
    });

    mockGlob.mockResolvedValue(["src/app.ts"] as never);

    await expect(runCheckAdr()).rejects.toThrow("Found 2 architectural violations.");
    expect(errorOutput()).toContain("Violation");
    expect(errorOutput()).toContain("ADR-001");
  });

  it("passes when no violations are found", async () => {
    setupCorpus([
      {
        file: "ADR-001-no-eval.md",
        id: "ADR-001",
        title: "No Eval",
        status: "active",
        date: "2026-01-01",
        patterns: ["\\beval\\b"],
      },
    ]);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.endsWith("README.md")) {
        return readmeContent([
          {
            file: "ADR-001-no-eval.md",
            id: "ADR-001",
            title: "No Eval",
            status: "active",
            date: "2026-01-01",
          },
        ]);
      }
      if (path.endsWith("ADR-001-no-eval.md")) {
        return adrContent({
          file: "ADR-001-no-eval.md",
          id: "ADR-001",
          title: "No Eval",
          status: "active",
          date: "2026-01-01",
          patterns: ["\\beval\\b"],
        });
      }
      return `const x = 1;\nconst y = 2;\n`;
    });

    mockGlob.mockResolvedValue(["src/clean.ts"] as never);

    await expect(runCheckAdr()).resolves.not.toThrow();
    expect(logOutput()).toContain("No architectural violations detected");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("skips ADRs without prohibited_patterns", async () => {
    setupCorpus([
      {
        file: "ADR-001-info-only.md",
        id: "ADR-001",
        title: "Info Only",
        status: "active",
        date: "2026-01-01",
      },
    ]);

    await runCheckAdr();
    expect(logOutput()).toContain("No active ADRs with prohibited patterns found");
  });

  it("reports malformed YAML frontmatter as a structural violation instead of crashing", async () => {
    mockReaddirSync.mockReturnValue(["ADR-001-bad.md", "README.md"] as unknown as ReturnType<
      typeof readdirSync
    >);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.endsWith("README.md")) return "";
      return `---\n  bad: yaml: [broken\n---\nContent`;
    });
    mockGlob.mockResolvedValue([] as never);

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    expect(errorOutput()).toContain("ADR-001-bad.md");
    expect(errorOutput()).toContain("frontmatter-invalid");
  });

  // ── New structural validation rules ──────────────────────────────────

  it("passes a clean corpus with no structural violations", async () => {
    setupCorpus(CLEAN_CORPUS);

    await expect(runCheckAdr()).resolves.not.toThrow();
    expect(errorOutput()).not.toContain("Structural violation");
  });

  it("reports a missing frontmatter field", async () => {
    setupCorpus([
      {
        file: "ADR-001-first.md",
        id: "ADR-001",
        title: "First Decision",
        status: "active",
        omitFields: ["date"],
      },
    ]);

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("ADR-001-first.md");
    expect(out).toContain("frontmatter-field-missing");
    expect(out).toContain('"date"');
  });

  it("reports an invalid status", async () => {
    setupCorpus([
      {
        file: "ADR-001-first.md",
        id: "ADR-001",
        title: "First Decision",
        status: "draft",
        date: "2026-01-01",
      },
    ]);

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("status-invalid");
    expect(out).toContain("draft");
  });

  it("reports a duplicate ID", async () => {
    setupCorpus([
      {
        file: "ADR-001-first.md",
        id: "ADR-001",
        title: "First Decision",
        status: "active",
        date: "2026-01-01",
      },
      {
        file: "ADR-001-duplicate.md",
        id: "ADR-001",
        title: "Duplicate Decision",
        status: "active",
        date: "2026-01-02",
      },
    ]);

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("id-duplicate");
    expect(out).toContain("ADR-001-first.md");
    expect(out).toContain("ADR-001-duplicate.md");
  });

  it("reports a non-sequential ID gap", async () => {
    setupCorpus([
      {
        file: "ADR-001-first.md",
        id: "ADR-001",
        title: "First Decision",
        status: "active",
        date: "2026-01-01",
      },
      {
        file: "ADR-003-third.md",
        id: "ADR-003",
        title: "Third Decision",
        status: "active",
        date: "2026-01-03",
      },
    ]);

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("id-non-sequential");
    expect(out).toContain("ADR-002");
  });

  it("reports an orphaned index row", async () => {
    setupCorpus(
      [
        {
          file: "ADR-001-first.md",
          id: "ADR-001",
          title: "First Decision",
          status: "active",
          date: "2026-01-01",
        },
      ],
      readmeContent([
        {
          file: "ADR-001-first.md",
          id: "ADR-001",
          title: "First Decision",
          status: "active",
          date: "2026-01-01",
        },
        {
          file: "ADR-999-ghost.md",
          id: "ADR-999",
          title: "Ghost Decision",
          status: "active",
          date: "2026-01-09",
        },
      ])
    );

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("index-orphaned");
    expect(out).toContain("ADR-999-ghost.md");
  });

  it("reports an unindexed file", async () => {
    setupCorpus(
      [
        {
          file: "ADR-001-first.md",
          id: "ADR-001",
          title: "First Decision",
          status: "active",
          date: "2026-01-01",
        },
      ],
      "# ADRs\n\n## Index\n\n| ADR | Title | Status | Date |\n| --- | --- | --- | --- |\n"
    );

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("index-unindexed");
    expect(out).toContain("ADR-001-first.md");
  });

  it("reports an uncompilable regex pattern as a validation failure, not a crash", async () => {
    setupCorpus([
      {
        file: "ADR-001-first.md",
        id: "ADR-001",
        title: "First Decision",
        status: "active",
        date: "2026-01-01",
        patterns: ["(unclosed"],
      },
    ]);

    await expect(runCheckAdr()).rejects.toThrow(/ADR structural violation/);
    const out = errorOutput();
    expect(out).toContain("regex-uncompilable");
    expect(out).toContain("(unclosed");
  });
});
