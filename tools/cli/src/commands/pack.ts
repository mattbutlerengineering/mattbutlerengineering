import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Project, Node } from "ts-morph";
import { glob } from "glob";

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
  // Functions, methods, constructors
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
        // For large objects (like schemas), we might want to keep them or stub them.
        // For now, let's keep the whole declaration if it's an object/array, 
        // as they are often schemas or configs that agents NEED.
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

export const packCommand = new Command("pack")
  .description("Generate AI context (llms.txt) for a service or package")
  .argument("<path>", "Path to the service or package (relative to monorepo root)")
  .action(async (targetPath: string) => {
    const root = findMonorepoRoot(process.cwd());
    const fullPath = resolve(root, targetPath);

    if (!existsSync(fullPath)) {
      console.error(`Error: Path not found: ${fullPath}`);
      process.exit(1);
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
  });
