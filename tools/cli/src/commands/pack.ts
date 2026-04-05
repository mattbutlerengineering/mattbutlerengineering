import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Project, Node } from "ts-morph";
import { glob } from "glob";
import { execSync } from "node:child_process";

// ── Helpers ───────────────────────────────────────────────────────────────

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

/**
 * Strips implementation details from a node but keeps signatures.
 */
function getSkeleton(node: Node): string {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node) || Node.isConstructorDeclaration(node)) {
    const body = node.getBody();
    if (body) {
      const text = node.getText();
      const bodyText = body.getText();
      return text.replace(bodyText, "{ /* implementation omitted */ }");
    }
  }

  if (Node.isArrowFunction(node)) {
    const body = node.getBody();
    if (body) {
      const text = node.getText();
      const bodyText = body.getText();
      return text.replace(bodyText, "{ /* implementation omitted */ }");
    }
  }

  if (Node.isClassDeclaration(node)) {
    const name = node.getName() || "AnonymousClass";
    const members = node.getMembers().map(m => getSkeleton(m)).filter(Boolean).join("\n  ");
    return `class ${name} {\n  ${members}\n}`;
  }

  if (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node) || Node.isEnumDeclaration(node)) {
    return node.getText();
  }

  if (Node.isVariableStatement(node)) {
    if (node.isExported()) {
      const declarations = node.getDeclarations();
      const declsText = declarations.map(d => {
        const name = d.getName();
        const type = d.getType().getText();
        const initializer = d.getInitializer();
        if (initializer && (Node.isObjectLiteralExpression(initializer) || Node.isArrayLiteralExpression(initializer))) {
             return d.getText();
        }
        return `export const ${name}: ${type};`;
      }).join("\n");
      return declsText;
    }
  }

  return "";
}

async function packDirectory(targetPath: string, root: string): Promise<void> {
    const fullPath = resolve(root, targetPath);

    if (!existsSync(fullPath)) {
      console.warn(`Warning: Path not found: ${fullPath}`);
      return;
    }

    console.log(`Packing context for: ${targetPath}...`);

    const project = new Project();
    const files = await glob("**/*.ts", {
      cwd: fullPath,
      ignore: ["**/node_modules/**", "**/dist/**", "**/*.test.ts", "**/*.spec.ts", "**/generated/**", "**/vitest.config.ts"],
    });

    let output = `<codebase path="${targetPath}">\n`;

    for (const file of files) {
      const sourceFile = project.addSourceFileAtPath(join(fullPath, file));
      output += `  <file path="${file}">\n`;
      
      const statements = sourceFile.getStatements();
      for (const statement of statements) {
        if (
            Node.isClassDeclaration(statement) || 
            Node.isInterfaceDeclaration(statement) || 
            Node.isTypeAliasDeclaration(statement) || 
            Node.isEnumDeclaration(statement) ||
            Node.isFunctionDeclaration(statement) ||
            (Node.isVariableStatement(statement) && statement.isExported())
        ) {
          const skeleton = getSkeleton(statement);
          if (skeleton) {
            output += `    ${skeleton.replace(/\n/g, "\n    ")}\n`;
          }
        }
      }
      output += `  </file>\n`;
    }

    output += `</codebase>\n`;

    const outputPath = join(fullPath, "llms.txt");
    writeFileSync(outputPath, output);
    console.log(`Successfully generated context at: ${outputPath}`);
}

// ── Commands ──────────────────────────────────────────────────────────────

export const packCommand = new Command("pack")
  .description("Generate AI context (llms.txt) for a service or package")
  .argument("<path>", "Path to the service or package (relative to monorepo root)")
  .action(async (targetPath: string) => {
    const root = findMonorepoRoot(process.cwd());
    await packDirectory(targetPath, root);
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
        console.error("Error detecting changed files:", error instanceof Error ? error.message : error);
    }
  });
