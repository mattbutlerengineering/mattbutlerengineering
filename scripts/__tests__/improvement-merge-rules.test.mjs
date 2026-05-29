import { describe, it, expect } from "vitest";
import {
  classifyFiles,
  shouldAutoMerge,
  LOW_RISK_PATTERNS,
  HIGH_RISK_PATTERNS,
} from "../improvement-merge-rules.mjs";

describe("classifyFiles", () => {
  it("classifies test-only changes as low risk", () => {
    const files = ["src/__tests__/foo.test.ts", "src/__tests__/bar.test.tsx"];
    expect(classifyFiles(files)).toBe("low");
  });

  it("classifies docs changes as low risk", () => {
    const files = ["docs/guide.md", "README.md", "CHANGELOG.md"];
    expect(classifyFiles(files)).toBe("low");
  });

  it("classifies metrics/config changes as low risk", () => {
    const files = ["metrics/process-metrics.jsonl", ".github/auto-qa-tuning.json"];
    expect(classifyFiles(files)).toBe("low");
  });

  it("classifies a11y-only fixes as low risk", () => {
    const files = ["src/components/Button.tsx"];
    const diffs = [{ path: "src/components/Button.tsx", patch: '+  aria-label="Close"' }];
    expect(classifyFiles(files, diffs)).toBe("low");
  });

  it("classifies layout changes as high risk", () => {
    const files = ["src/pages/HomePage.tsx"];
    expect(classifyFiles(files)).toBe("high");
  });

  it("classifies route changes as high risk", () => {
    const files = ["src/routes/index.ts", "src/app.ts"];
    expect(classifyFiles(files)).toBe("high");
  });

  it("classifies auth file changes as high risk", () => {
    const files = ["src/middleware/auth.ts", "packages/auth/src/index.ts"];
    expect(classifyFiles(files)).toBe("high");
  });

  it("classifies mixed low+high as high risk", () => {
    const files = ["docs/README.md", "src/pages/Dashboard.tsx"];
    expect(classifyFiles(files)).toBe("high");
  });

  it("classifies style-only changes as low risk", () => {
    const files = ["src/styles/theme.css", "src/components/Button.module.css"];
    expect(classifyFiles(files)).toBe("low");
  });

  it("classifies empty file list as low risk", () => {
    expect(classifyFiles([])).toBe("low");
  });
});

describe("shouldAutoMerge", () => {
  it("returns true for improvement label + low risk + CI green", () => {
    const pr = {
      labels: ["improvement", "ready"],
      files: ["docs/guide.md"],
      ciPassed: true,
    };
    expect(shouldAutoMerge(pr)).toBe(true);
  });

  it("returns false without improvement label", () => {
    const pr = {
      labels: ["bug"],
      files: ["docs/guide.md"],
      ciPassed: true,
    };
    expect(shouldAutoMerge(pr)).toBe(false);
  });

  it("returns false for high risk files even with improvement label", () => {
    const pr = {
      labels: ["improvement"],
      files: ["src/pages/HomePage.tsx"],
      ciPassed: true,
    };
    expect(shouldAutoMerge(pr)).toBe(false);
  });

  it("returns false when CI not passed", () => {
    const pr = {
      labels: ["improvement"],
      files: ["docs/guide.md"],
      ciPassed: false,
    };
    expect(shouldAutoMerge(pr)).toBe(false);
  });
});
