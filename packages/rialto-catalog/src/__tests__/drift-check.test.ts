import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "../..");
const generatedFile = path.join(packageRoot, "src/generated-schemas.ts");

/**
 * Run the generator script via tsx (not a shell command — uses execFileSync).
 */
function runGenerator(): void {
  execFileSync("npx", ["tsx", "./scripts/generate-catalog.ts"], {
    cwd: packageRoot,
    env: { ...process.env },
    stdio: "pipe",
  });
}

describe("drift-check: catalog generation is deterministic", () => {
  it(
    "running catalog generation twice produces identical output (diff is empty)",
    { timeout: 30_000 },
    () => {
      const beforeContent = fs.readFileSync(generatedFile, "utf-8");
      const tmpFile = `${generatedFile}.test-tmp`;

      try {
        // Run once into a temporary file
        execFileSync("npx", ["tsx", "./scripts/generate-catalog.ts"], {
          cwd: packageRoot,
          env: { ...process.env, OUTPUT_FILE: tmpFile },
          stdio: "pipe",
        });

        const afterFirstRun = fs.readFileSync(tmpFile, "utf-8");

        // Run again into the same temporary file
        execFileSync("npx", ["tsx", "./scripts/generate-catalog.ts"], {
          cwd: packageRoot,
          env: { ...process.env, OUTPUT_FILE: tmpFile },
          stdio: "pipe",
        });

        const afterSecondRun = fs.readFileSync(tmpFile, "utf-8");

        // All three should be identical
        expect(afterFirstRun.trim()).toBe(beforeContent.trim());
        expect(afterSecondRun.trim()).toBe(beforeContent.trim());
      } finally {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      }
    }
  );

  it("detects drift when generated-schemas.ts is manually modified", { timeout: 30_000 }, () => {
    const originalContent = fs.readFileSync(generatedFile, "utf-8");

    try {
      // Write a modified (drifted) version
      const driftedContent = originalContent + "\n// intentional drift\n";
      fs.writeFileSync(generatedFile, driftedContent, "utf-8");

      // Run the generator — should restore the original content
      runGenerator();
      const regeneratedContent = fs.readFileSync(generatedFile, "utf-8");

      // The regenerated content should NOT match the drifted version
      expect(regeneratedContent.trim()).not.toBe(driftedContent.trim());

      // The regenerated content should match the original
      expect(regeneratedContent.trim()).toBe(originalContent.trim());
    } finally {
      // Always restore original content after test
      fs.writeFileSync(generatedFile, originalContent, "utf-8");
    }
  });
});
