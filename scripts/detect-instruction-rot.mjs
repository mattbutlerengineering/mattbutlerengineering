import fs from "node:fs";
import path from "node:path";

/**
 * Detects "instruction rot" in key AI instruction files.
 * Checks for:
 * 1. Dead internal file links in Markdown files.
 * 2. References to deleted packages.
 * 3. References to non-existent symbols (future enhancement).
 */

const FILES_TO_CHECK = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "llms.txt",
  "llms-full.txt",
  ".cursorrules",
];

function checkFiles() {
  let errors = 0;
  const root = process.cwd();

  for (const file of FILES_TO_CHECK) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf-8");
    const fileDir = path.dirname(path.resolve(root, file));

    // 1. Detect internal links to non-existent files: [text](link)
    const fileLinks = content.match(/\[.*?\]\((.*?)\)/g) || [];
    for (const linkMatch of fileLinks) {
      const link = linkMatch.match(/\((.*?)\)/)[1];

      // Skip external links, anchors, and mailto
      if (link.startsWith("http") || link.startsWith("#") || link.startsWith("mailto:")) continue;

      const cleanLink = link.split("#")[0];
      if (!cleanLink) continue;

      const targetPath = path.resolve(fileDir, cleanLink);
      if (!fs.existsSync(targetPath)) {
        console.error(`[ROT] ${file}: Dead link to ${cleanLink} (resolved to ${targetPath})`);
        errors++;
      }
    }

    // 2. Detect references to deleted packages: packages/name
    const packageRefs = content.match(/packages\/([a-zA-Z0-9-]+)/g) || [];
    for (const ref of packageRefs) {
      const pkgPath = path.resolve(root, ref);
      if (!fs.existsSync(pkgPath)) {
        console.error(`[ROT] ${file}: Reference to deleted package ${ref}`);
        errors++;
      }
    }

    // 3. Detect references to deleted apps: apps/name
    const appRefs = content.match(/apps\/([a-zA-Z0-9-]+)/g) || [];
    for (const ref of appRefs) {
      const appPath = path.resolve(root, ref);
      if (!fs.existsSync(appPath)) {
        console.error(`[ROT] ${file}: Reference to deleted app ${ref}`);
        errors++;
      }
    }
  }
  return errors;
}

console.log("Checking for instruction rot...");
const errorCount = checkFiles();

if (errorCount > 0) {
  console.error(`\nFound ${errorCount} instances of instruction rot.`);
  process.exit(1);
}

console.log("✓ No instruction rot detected.");
