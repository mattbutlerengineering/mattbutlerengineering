import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

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

function toTitleCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function detectNextPort(appsDir: string): number {
  const KNOWN_PORTS = [3000, 3001, 3002, 3003, 3004];
  const usedPorts = new Set<number>(KNOWN_PORTS);

  if (existsSync(appsDir)) {
    const appDirs = readdirSync(appsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const appDir of appDirs) {
      const viteConfigPath = join(appsDir, appDir, "vite.config.ts");
      if (existsSync(viteConfigPath)) {
        const content = readFileSync(viteConfigPath, "utf8");
        const match = /port:\s*(\d+)/.exec(content);
        if (match) {
          usedPorts.add(parseInt(match[1], 10));
        }
      }
    }
  }

  let port = 3005;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
}

function generatePackageJson(name: string): string {
  return JSON.stringify(
    {
      name: `@mbe/${name}`,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
        lint: "eslint .",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        "@mattbutlerengineering/rialto": "workspace:*",
        "framer-motion": "^12.34.0",
        "lucide-react": "^0.575.0",
        react: "^19.2.4",
        "react-dom": "^19.2.4",
        "react-router-dom": "^7.13.0",
      },
      devDependencies: {
        "@mbe/config": "workspace:*",
        "@types/react": "^19.2.14",
        "@types/react-dom": "^19.2.3",
        "@vitejs/plugin-react": "^5.1.4",
        typescript: "^5.9.3",
        vite: "^7.3.1",
      },
    },
    null,
    2
  );
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      extends: "../../packages/config/tsconfig.app.json",
      compilerOptions: {
        outDir: "./dist",
      },
      include: ["src"],
    },
    null,
    2
  );
}

function generateViteConfig(name: string, port: number): string {
  return [
    'import { defineConfig } from "vite";',
    'import react from "@vitejs/plugin-react";',
    "",
    "export default defineConfig({",
    `  base: "/${name}/",`,
    "  plugins: [react()],",
    "  server: {",
    `    port: ${port},`,
    "  },",
    "});",
    "",
  ].join("\n");
}

function generateIndexHtml(name: string): string {
  const titleName = toTitleCase(name);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${titleName} | MBE</title>`,
    '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    '    <script type="module" src="/src/main.tsx"></script>',
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}

function generateMainTsx(name: string): string {
  return [
    'import "@mattbutlerengineering/rialto/styles";',
    'import "./global.css";',
    'import { StrictMode } from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { BrowserRouter } from "react-router-dom";',
    'import { RialtoProvider } from "@mattbutlerengineering/rialto";',
    'import { App } from "./App";',
    "",
    'createRoot(document.getElementById("root")!).render(',
    "  <StrictMode>",
    '    <RialtoProvider theme="system">',
    `      <BrowserRouter basename="/${name}">`,
    "        <App />",
    "      </BrowserRouter>",
    "    </RialtoProvider>",
    "  </StrictMode>",
    ");",
    "",
  ].join("\n");
}

function generateAppTsx(): string {
  return [
    'import { Routes, Route } from "react-router-dom";',
    'import { ExamplePage } from "./pages/ExamplePage";',
    "",
    "export function App() {",
    "  return (",
    "    <Routes>",
    '      <Route path="/" element={<ExamplePage />} />',
    "    </Routes>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function generateGlobalCss(name: string): string {
  return `/* Global styles for ${name} app */\n`;
}

function generateExamplePage(): string {
  return [
    'import { Card, Stack, Text, Button } from "@mattbutlerengineering/rialto";',
    "",
    "export function ExamplePage() {",
    "  return (",
    "    <Stack",
    '      direction="column"',
    '      gap="lg"',
    '      style={{ padding: "var(--rialto-space-xl)", maxWidth: "800px", margin: "0 auto" }}',
    "    >",
    '      <Text variant="display" size="2xl">',
    "        Welcome",
    "      </Text>",
    '      <Text variant="body" size="md">',
    "        This app is powered by Rialto.",
    "      </Text>",
    "      <Card>",
    '        <Stack direction="column" gap="md">',
    '          <Text variant="heading" size="lg">',
    "            Getting Started",
    "          </Text>",
    '          <Text variant="body">Edit src/pages/ExamplePage.tsx to start building.</Text>',
    '          <Button variant="primary">Learn More</Button>',
    "        </Stack>",
    "      </Card>",
    "    </Stack>",
    "  );",
    "}",
    "",
  ].join("\n");
}

function generateFaviconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '  <rect width="512" height="512" rx="96" fill="#f8f6f3"/>',
    "  <text",
    '    x="256" y="372"',
    '    font-family="system-ui, -apple-system, sans-serif"',
    '    font-size="360"',
    '    font-weight="500"',
    '    fill="#c4922a"',
    '    text-anchor="middle"',
    "  >R</text>",
    "</svg>",
    "",
  ].join("\n");
}

function writeFile(filePath: string, content: string): void {
  const dir = resolve(filePath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

// ── Command ───────────────────────────────────────────────────────────────

export const newCommand = new Command("new")
  .alias("init")
  .description("Scaffold a new app with Rialto provider and example page")
  .argument("<name>", "App name in kebab-case (creates apps/<name>/)")
  .option("-p, --port <port>", "Dev server port (default: auto-detect next available)")
  .action(async (name: string, options: { port?: string }) => {
    // Validate name format
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      console.error(
        `Error: App name "${name}" is invalid. Use kebab-case (lowercase letters, numbers, hyphens only, must start with a letter).`
      );
      process.exit(1);
    }

    const repoRoot = findMonorepoRoot(process.cwd());
    const appsDir = join(repoRoot, "apps");
    const appDir = join(appsDir, name);

    // Check for existing directory
    if (existsSync(appDir)) {
      console.error(`Error: apps/${name}/ already exists.`);
      process.exit(1);
    }

    // Determine port
    const port = options.port ? parseInt(options.port, 10) : detectNextPort(appsDir);

    if (options.port && (isNaN(port) || port < 1 || port > 65535)) {
      console.error(`Error: Invalid port "${options.port}". Must be a number between 1 and 65535.`);
      process.exit(1);
    }

    // Generate all files
    writeFile(join(appDir, "package.json"), generatePackageJson(name));
    writeFile(join(appDir, "tsconfig.json"), generateTsConfig());
    writeFile(join(appDir, "vite.config.ts"), generateViteConfig(name, port));
    writeFile(join(appDir, "index.html"), generateIndexHtml(name));
    writeFile(join(appDir, "public", "favicon.svg"), generateFaviconSvg());
    writeFile(join(appDir, "src", "main.tsx"), generateMainTsx(name));
    writeFile(join(appDir, "src", "App.tsx"), generateAppTsx());
    writeFile(join(appDir, "src", "global.css"), generateGlobalCss(name));
    writeFile(join(appDir, "src", "pages", "ExamplePage.tsx"), generateExamplePage());

    console.log(`Scaffolded apps/${name}/`);
    console.log("");
    console.log("Next steps:");
    console.log("  pnpm install");
    console.log(`  pnpm --filter @mbe/${name} dev`);
    console.log(`  Open http://localhost:${port}/${name}/`);
  });
