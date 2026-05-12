#!/usr/bin/env node

/**
 * Chaos Agent — Seeds detectable non-breaking bugs (#1191).
 * 
 * This script injects synthetic bugs into the codebase to verify that
 * site-audit and lint loops are functioning correctly.
 * 
 * Bug Types:
 * 1. console-error: Adds a console.error in a useEffect (caught by site-audit Playwright)
 * 2. lighthouse-perf: Adds a large invisible image (caught by Lighthouse)
 * 3. accessibility: Removes an aria-label (caught by Lighthouse a11y)
 * 4. scout-todo: Adds a FIXME comment (caught by site-audit scout)
 * 
 * Usage:
 *   node scripts/chaos-agent.mjs --type <type> [--file <path>]
 *   node scripts/chaos-agent.mjs --random
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BUG_TYPES = {
  "console-error": {
    description: "Injects a console error into a React component",
    pattern: /export (default )?function (\w+)/,
    injection: (name) => `\n  React.useEffect(() => { console.error("CHAOS-ERROR: Synthetic bug for #${name}"); }, []);\n`,
    imports: 'import React from "react";\n'
  },
  "lighthouse-perf": {
    description: "Adds a huge invisible image to trigger a performance regression",
    pattern: /<\/\w+>/, // Find a closing tag
    injection: () => `\n      {/* Synthetic performance regression */} \n      <img src="https://via.placeholder.com/4000x4000.png?text=CHAOS-REGRESSION" style={{ display: 'none' }} alt="" />\n`
  },
  "accessibility": {
    description: "Removes an aria-label or alt tag from a button, link, or image",
    pattern: /(aria-label|alt)="[^"]+"/,
    replacement: ""
  },
  "scout-todo": {
    description: "Adds a FIXME comment for scout mode to find",
    pattern: /^/,
    injection: () => `// FIXME: Chaos Agent synthetic issue. This should be detected by scout mode.\n`
  }
};

const TARGET_APPS = ["apps/marketing", "apps/hospitality", "apps/rialto-web"];

function gh(...args) {
  try {
    return execFileSync("gh", args, { encoding: "utf-8" }).trim();
  } catch (e) {
    console.error(`gh command failed: ${e.message}`);
    return null;
  }
}

function findTargetFile(type) {
  const app = TARGET_APPS[Math.floor(Math.random() * TARGET_APPS.length)];
  const files = execFileSync("find", [path.join(ROOT, app, "src"), "-name", "*.tsx"], { encoding: "utf-8" })
    .split("\n")
    .filter(f => f && !f.includes(".test.") && !f.includes("layout.tsx"));
  
  return files[Math.floor(Math.random() * files.length)];
}

function injectBug(type, filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  const bug = BUG_TYPES[type];

  if (type === "accessibility") {
    if (!bug.pattern.test(content)) {
      console.log(`File ${filePath} doesn't have an aria-label, skipping...`);
      return false;
    }
    content = content.replace(bug.pattern, bug.replacement);
  } else if (type === "console-error") {
    const match = content.match(bug.pattern);
    if (!match) return false;
    
    // Check if React is imported
    if (!content.includes('import React')) {
      content = bug.imports + content;
    }
    
    const insertionPoint = content.indexOf("{", match.index) + 1;
    content = content.slice(0, insertionPoint) + bug.injection(match[2]) + content.slice(insertionPoint);
  } else {
    const match = content.match(bug.pattern);
    if (!match) return false;
    
    if (type === "scout-todo") {
      content = bug.injection() + content;
    } else {
      content = content.replace(bug.pattern, (m) => bug.injection() + m);
    }
  }

  fs.writeFileSync(filePath, content);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  let type = args.includes("--type") ? args[args.indexOf("--type") + 1] : null;
  const randomMode = args.includes("--random");

  if (randomMode) {
    const types = Object.keys(BUG_TYPES);
    type = types[Math.floor(Math.random() * types.length)];
  }

  if (!type || !BUG_TYPES[type]) {
    console.error(`Invalid bug type. Available: ${Object.keys(BUG_TYPES).join(", ")}`);
    process.exit(1);
  }

  const fileIdx = args.indexOf("--file");
  const targetFile = fileIdx !== -1 ? args[fileIdx + 1] : findTargetFile(type);
  console.log(`Targeting file: ${targetFile} with bug type: ${type}`);

  if (injectBug(type, targetFile)) {
    const relativePath = path.relative(ROOT, targetFile);
    const branchName = `chaos/synthetic-bug-${Date.now()}`;
    
    console.log(`Bug injected. Creating branch ${branchName}...`);
    
    execFileSync("git", ["checkout", "-b", branchName]);
    execFileSync("git", ["add", targetFile]);
    execFileSync("git", ["commit", "-m", `chore(chaos): seed synthetic ${type} in ${relativePath}`]);
    
    if (args.includes("--push")) {
      console.log("Pushing and creating PR...");
      execFileSync("git", ["push", "origin", branchName]);
      
      const prBody = `## Chaos Agent Synthetic Bug Audit
      
      This PR contains a synthetic **${type}** bug injected by the Chaos Agent.
      
      **File:** ${relativePath}
      **Goal:** Verify that site-audit and lint loops detect this issue and file a corresponding GitHub issue.
      
      This PR is designed to be detectable but non-breaking for the build.
      
      Labels: \`chaos-audit\`, \`ready\`, \`audit\``;
      
      gh("pr", "create", 
        "--title", `chaos: synthetic ${type} bug in ${path.basename(targetFile)}`,
        "--body", prBody,
        "--label", "chaos-audit",
        "--label", "ready",
        "--label", "audit"
      );
    }
  } else {
    console.error("Failed to inject bug.");
    process.exit(1);
  }
}

main();
