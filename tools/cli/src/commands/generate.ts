import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findMonorepoRoot } from "../monorepo-root.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function writeFile(filePath: string, content: string): void {
  const dir = resolve(filePath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

// ── Templates ─────────────────────────────────────────────────────────────

function componentTemplate(name: string): string {
  return `import styles from "./${name}.module.css";

export interface ${name}Props {
  children?: React.ReactNode;
  className?: string;
}

/**
 * ${name} component
 */
export function ${name}({ children, className }: ${name}Props) {
  return (
    <div className={\`\${styles.root} \${className || ""}\`}>
      {children}
    </div>
  );
}
`;
}

function componentStyleTemplate(): string {
  return `.root {
  display: block;
}
`;
}

function componentTestTemplate(name: string): string {
  return `import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ${name} } from "./${name}";

describe("${name}", () => {
  it("renders children correctly", () => {
    render(<${name}>Test Content</${name}>);
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });
});
`;
}

function componentIndexTemplate(name: string): string {
  return `export * from "./${name}";
`;
}

function routeTemplate(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `import type { FastifyInstance } from "fastify";
import { z } from "zod";

export async function ${name}Routes(fastify: FastifyInstance) {
  fastify.get("/${slug}", {
    schema: {
      description: "Example generated route",
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
    handler: async (request, reply) => {
      return { message: "Hello from ${name}" };
    },
  });
}
`;
}

// ── Command ───────────────────────────────────────────────────────────────

export const generateCommand = new Command("generate")
  .alias("g")
  .description("Generate monorepo entities (components, routes)");

generateCommand
  .command("component <name>")
  .description("Scaffold a new React component")
  .option(
    "-t, --target <path>",
    "Target directory relative to root (e.g., packages/rialto/src/components)"
  )
  .action(async (name: string, options: { target?: string }) => {
    if (!options.target) {
      console.error("Error: --target path is required.");
      process.exit(1);
    }

    const root = findMonorepoRoot(process.cwd());
    const targetDir = resolve(root, options.target, name);

    if (existsSync(targetDir)) {
      console.error(`Error: Component directory already exists: ${targetDir}`);
      process.exit(1);
    }

    console.log(`Generating component ${name} in ${options.target}...`);

    writeFile(join(targetDir, `${name}.tsx`), componentTemplate(name));
    writeFile(join(targetDir, `${name}.module.css`), componentStyleTemplate());
    writeFile(join(targetDir, `${name}.test.tsx`), componentTestTemplate(name));
    writeFile(join(targetDir, "index.ts"), componentIndexTemplate(name));

    console.log("✅ Component generated successfully.");
  });

generateCommand
  .command("route <name>")
  .description("Scaffold a new API route")
  .option("-s, --service <name>", "Service name (e.g., users, agent)")
  .action(async (name: string, options: { service?: string }) => {
    if (!options.service) {
      console.error("Error: --service name is required.");
      process.exit(1);
    }

    const root = findMonorepoRoot(process.cwd());
    const serviceDir = join(root, "services", options.service, "src", "routes");

    if (!existsSync(serviceDir)) {
      console.error(`Error: Service routes directory not found: ${serviceDir}`);
      process.exit(1);
    }

    const fileName = `${name.toLowerCase()}.ts`;
    const filePath = join(serviceDir, fileName);

    if (existsSync(filePath)) {
      console.error(`Error: Route file already exists: ${filePath}`);
      process.exit(1);
    }

    console.log(`Generating route ${name} in service ${options.service}...`);

    writeFile(filePath, routeTemplate(name));

    console.log(`✅ Route generated at: ${filePath}`);
    console.log(`⚠️  Remember to register the route in ${options.service}/src/app.ts`);
  });
