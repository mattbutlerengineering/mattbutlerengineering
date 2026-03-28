import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "../..");
const generatedFile = path.join(packageRoot, "src/generated-schemas.ts");
const scriptPath = path.join(packageRoot, "scripts/generate-catalog.ts");

/**
 * Run the generator script via tsx (not a shell command — uses execFileSync).
 */
function runGenerator(): void {
  execFileSync(
    "npx",
    ["tsx", scriptPath],
    {
      cwd: packageRoot,
      env: { ...process.env },
      stdio: "pipe",
    }
  );
}

describe("drift-check: catalog generation is deterministic", () => {
  it("running catalog generation twice produces identical output (diff is empty)", () => {
    // Capture the current committed content
    const beforeContent = fs.readFileSync(generatedFile, "utf-8");

    // Run the generator once
    runGenerator();
    const afterFirstRun = fs.readFileSync(generatedFile, "utf-8");

    // Run the generator a second time
    runGenerator();
    const afterSecondRun = fs.readFileSync(generatedFile, "utf-8");

    // All three should be identical
    expect(afterFirstRun).toBe(beforeContent);
    expect(afterSecondRun).toBe(beforeContent);
  });

  it("detects drift when generated-schemas.ts is manually modified", () => {
    const originalContent = fs.readFileSync(generatedFile, "utf-8");

    try {
      // Write a modified (drifted) version
      const driftedContent = originalContent + "\n// intentional drift\n";
      fs.writeFileSync(generatedFile, driftedContent, "utf-8");

      // Run the generator — should restore the original content
      runGenerator();
      const regeneratedContent = fs.readFileSync(generatedFile, "utf-8");

      // The regenerated content should NOT match the drifted version
      expect(regeneratedContent).not.toBe(driftedContent);

      // The regenerated content should match the original
      expect(regeneratedContent).toBe(originalContent);
    } finally {
      // Always restore original content after test
      fs.writeFileSync(generatedFile, originalContent, "utf-8");
    }
  });
});
