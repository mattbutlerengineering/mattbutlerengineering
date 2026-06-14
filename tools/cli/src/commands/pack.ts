import { Command } from "commander";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Project, Node } from "ts-morph";
import { glob } from "glob";
import { execSync } from "node:child_process";

const SIZE_LIMIT_KB = 15;
const AUTO_SPLIT_THRESHOLD_KB = 25;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Byte-order (codepoint) string comparator. Unlike `String.prototype.sort`'s
 * default lexicographic-but-locale-influenced behavior and `localeCompare`,
 * this is deterministic across platforms: macOS (en-US) and Linux CI (C/POSIX)
 * produce identical ordering. Used for every sort that feeds llms.txt output so
 * the committed artifacts match what CI regenerates.
 */
export function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function truncateType(type: string, maxLength = 60): string {
  if (type.length <= maxLength) return type;
  return type.substring(0, maxLength - 3) + "...";
}

/**
 * Strips implementation details from a node but keeps signatures.
 */
function getSkeleton(node: Node): string {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isConstructorDeclaration(node)
  ) {
    const body = node.getBody();
    if (body) {
      const text = node.getText();
      const bodyText = body.getText();
      return text.replace(bodyText, "{ /* ... */ }");
    }
  }

  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    if (body) {
      const text = node.getText();
      const bodyText = body.getText();
      return text.replace(bodyText, "{ /* ... */ }");
    }
  }

  if (Node.isClassDeclaration(node)) {
    const name = node.getName() || "AnonymousClass";
    const members = node
      .getMembers()
      .slice(0, 5)
      .map((m) => {
        if (Node.isMethodDeclaration(m)) {
          return `async ${m.getName() ?? "method"}(): Promise<unknown>;`;
        }
        if (Node.isPropertyDeclaration(m)) {
          return `${m.getName() ?? "prop"}: ${truncateType(m.getTypeNode()?.getText() ?? "unknown")};`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n  ");
    return `class ${name} {\n  ${members}\n}`;
  }

  if (Node.isInterfaceDeclaration(node)) {
    const name = node.getName() || "Anonymous";
    const props = node
      .getProperties()
      .slice(0, 5)
      .map((p) => {
        return `${p.getName()}${p.hasQuestionToken() ? "?" : ""}: ${truncateType(p.getTypeNode()?.getText() ?? "unknown")};`;
      })
      .join("\n  ");
    return `interface ${name} {\n  ${props}\n}`;
  }

  if (Node.isTypeAliasDeclaration(node)) {
    const name = node.getName() || "Anonymous";
    const type = node.getTypeNode();
    if (type && Node.isUnionTypeNode(type)) {
      const types = type
        .getTypeNodes()
        .map((t) => t.getText().substring(0, 30))
        .join(" | ");
      return `type ${name} = ${types};`;
    }
    return `type ${name} = ${truncateType(type?.getText() || "unknown")};`;
  }

  if (Node.isEnumDeclaration(node)) {
    const name = node.getName() || "Anonymous";
    const members = node
      .getMembers()
      .slice(0, 10)
      .map((m) => `${m.getName()}${m.getValue() !== undefined ? " = " + m.getValue() : ""}`)
      .join(", ");
    return `enum ${name} { ${members} }`;
  }

  if (Node.isVariableStatement(node)) {
    if (node.isExported()) {
      const declarations = node.getDeclarations();
      const declsText = declarations
        .map((d) => {
          const name = d.getName();
          const type = truncateType(d.getTypeNode()?.getText() ?? "unknown");
          return `export const ${name}: ${type};`;
        })
        .join("\n");
      return declsText;
    }
  }

  return "";
}

function detectPriority(statement: Node): "high" | "medium" | "low" {
  const text = statement.getText().toLowerCase();

  const highKeywords = [
    "interface",
    "type ",
    "enum ",
    "export function",
    "export const",
    "export class",
    "export async function",
  ];
  const mediumKeywords = ["function ", "const ", "class "];

  if (highKeywords.some((kw) => text.startsWith(kw))) return "high";
  if (mediumKeywords.some((kw) => text.startsWith(kw))) return "medium";
  return "low";
}

function getSectionName(file: string): string {
  const parts = file.replace(/\\/g, "/").split("/");
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return parts[0];
}

export async function packDirectory(
  targetPath: string,
  root: string,
  forceFull = false,
  checkOnly = false
): Promise<void> {
  const fullPath = resolve(root, targetPath);

  if (!existsSync(fullPath)) {
    console.warn(`Warning: Path not found: ${fullPath}`);
    return;
  }

  console.log(`${checkOnly ? "Checking" : "Packing"} context for: ${targetPath}...`);

  const project = new Project();
  const files = (
    await glob("**/*.ts", {
      cwd: fullPath,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/generated/**",
        "**/vitest.config.ts",
      ],
    })
  ).sort(byteOrder);

  let skeletonOutput = `<codebase path="${targetPath}">\n`;
  let fullOutput = `<codebase path="${targetPath}">\n`;

  const sections: Map<string, { skeleton: string; full: string }> = new Map();

  const statementsPerFile = 2;

  for (const file of files) {
    const sourceFile = project.addSourceFileAtPath(join(fullPath, file));
    const sectionName = getSectionName(file);

    let fileSkeleton = "";
    let fileFull = "";
    let itemCount = 0;

    const statements = sourceFile.getStatements();
    for (const statement of statements) {
      if (itemCount >= statementsPerFile) break;

      if (
        Node.isClassDeclaration(statement) ||
        Node.isInterfaceDeclaration(statement) ||
        Node.isTypeAliasDeclaration(statement) ||
        Node.isEnumDeclaration(statement) ||
        Node.isFunctionDeclaration(statement) ||
        (Node.isVariableStatement(statement) && statement.isExported())
      ) {
        const skeleton = getSkeleton(statement);
        const full = statement.getText();
        const priority = detectPriority(statement);

        if (skeleton) {
          fileSkeleton += `    <item priority="${priority}">\n      ${skeleton.replace(/\n/g, "\n      ")}\n    </item>\n`;
          fileFull += `    ${full.replace(/\n/g, "\n    ")}\n`;
          itemCount++;
        }
      }
    }

    if (fileSkeleton || fileFull) {
      fileSkeleton = `  <file path="${file}">\n${fileSkeleton}  </file>\n`;
      fileFull = `  <file path="${file}">\n${fileFull}  </file>\n`;

      if (!sections.has(sectionName)) {
        sections.set(sectionName, { skeleton: "", full: "" });
      }
      sections.get(sectionName)!.skeleton += fileSkeleton;
      sections.get(sectionName)!.full += fileFull;
    }
  }

  for (const [section, content] of [...sections.entries()].sort(([a], [b]) => byteOrder(a, b))) {
    skeletonOutput += `  <section priority="medium" role="${section}">\n${content.skeleton}  </section>\n`;
    fullOutput += `  <section priority="medium" role="${section}">\n${content.full}  </section>\n`;
  }

  skeletonOutput += `</codebase>\n`;
  fullOutput += `</codebase>\n`;

  const skeletonPath = join(fullPath, "llms.txt");
  const fullPathOutput = join(fullPath, "llms-full.txt");

  if (checkOnly) {
    if (!existsSync(skeletonPath)) {
      console.error(`Error: ${skeletonPath} does not exist.`);
      process.exit(1);
    }
    const existing = readFileSync(skeletonPath, "utf-8");
    const expected = forceFull ? fullOutput : skeletonOutput;

    if (existing !== expected) {
      console.error(
        `Error: ${skeletonPath} is out of sync. Run 'mbe pack ${targetPath}' to update.`
      );
      process.exit(1);
    }
    console.log(`  ✓ ${skeletonPath} is in sync.`);
    return;
  }

  const skeletonSizeKB = Buffer.byteLength(skeletonOutput, "utf8") / 1024;
  const fullSizeKB = Buffer.byteLength(fullOutput, "utf8") / 1024;

  if (forceFull) {
    writeFileSync(skeletonPath, fullOutput);
    console.log(
      `Successfully generated full context (${fullSizeKB.toFixed(1)}KB) at: ${skeletonPath}`
    );
  } else {
    writeFileSync(skeletonPath, skeletonOutput);
    writeFileSync(fullPathOutput, fullOutput);

    if (skeletonSizeKB > SIZE_LIMIT_KB) {
      console.warn(
        `  ⚠️  Skeleton exceeds ${SIZE_LIMIT_KB}KB limit: ${skeletonSizeKB.toFixed(1)}KB`
      );
    }

    if (fullSizeKB > AUTO_SPLIT_THRESHOLD_KB) {
      console.warn(
        `  ⚠️  Full context (${fullSizeKB.toFixed(1)}KB) split into llms.txt + llms-full.txt`
      );
    }

    console.log(
      `  ✓ llms.txt (${skeletonSizeKB.toFixed(1)}KB) + llms-full.txt (${fullSizeKB.toFixed(1)}KB)`
    );
  }
}

// ── Commands ──────────────────────────────────────────────────────────────

export const packCommand = new Command("pack")
  .description("Generate AI context (llms.txt) for a service or package")
  .argument("<path>", "Path to the service or package (relative to monorepo root)")
  .option("--full", "Force full output instead of skeleton + full split", false)
  .option("--check", "Check if llms.txt is in sync without writing", false)
  .action(async (targetPath: string, options) => {
    const root = findMonorepoRoot(process.cwd());
    await packDirectory(targetPath, root, options.full, options.check);
  });

export const packChangedCommand = new Command("pack-changed")
  .description("Automatically run mbe pack on changed directories")
  .option("--mode <string>", "Mode: commit (HEAD~1..HEAD) or checkout", "commit")
  .action(async (options) => {
    const root = findMonorepoRoot(process.cwd());
    let diffCmd = "git diff --name-only HEAD~1 HEAD";

    if (options.mode === "checkout") {
      // In checkout, we look for changes between the previous HEAD and current HEAD
      // This is slightly tricky in a generic way, but we'll try @{1}
      diffCmd = "git diff --name-only @{1} HEAD";
    }

    try {
      const diff = execSync(diffCmd, { cwd: root, encoding: "utf8" });
      const changedFiles = diff.trim().split("\n").filter(Boolean);

      const packagesToPack = new Set<string>();
      for (const file of changedFiles) {
        // Only care about .ts changes in relevant root dirs
        if (!file.endsWith(".ts")) continue;

        const parts = file.split("/");
        if (parts.length >= 2) {
          const baseDir = parts[0]; // apps, services, packages
          const pkgName = parts[1];
          if (["apps", "services", "packages"].includes(baseDir)) {
            packagesToPack.add(`${baseDir}/${pkgName}`);
          }
        }
      }

      if (packagesToPack.size === 0) {
        console.log("No relevant code changes detected. Skipping context refresh.");
        return;
      }

      console.log(`Detected changes in ${packagesToPack.size} packages. Refreshing context...`);
      for (const pkg of packagesToPack) {
        await packDirectory(pkg, root);
      }
    } catch (error) {
      console.error(
        "Error detecting changed files:",
        error instanceof Error ? error.message : error
      );
    }
  });
