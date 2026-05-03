# Monorepo Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the mattinay repo from a single npm package into a pnpm workspaces monorepo with `packages/rialto/` (library) and `apps/showcase/` (demo app).

**Architecture:** pnpm workspaces with `apps/` and `packages/` directories. Rialto stays as a single `@mattbutlerengineering/rialto` package. The showcase app extracts into `apps/showcase/` and imports from `@mattbutlerengineering/rialto` via workspace protocol, becoming the first real consumer of the library.

**Tech Stack:** pnpm, pnpm-workspace.yaml, Vite, TypeScript, Changesets

---

### Task 1: Install pnpm and create workspace config

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Modify: `package.json` (root)

**Step 1: Install pnpm globally**

Run: `npm install -g pnpm`
Expected: pnpm available on PATH

**Step 2: Create pnpm-workspace.yaml**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

**Step 3: Create .npmrc**

Create `.npmrc`:

```
shamefully-hoist=true
```

Note: `shamefully-hoist` ensures compatibility with tools that expect flat node_modules (Vite, eslint plugins, etc.). Can be removed later once all packages declare their own deps properly.

**Step 4: Commit**

```bash
git add pnpm-workspace.yaml .npmrc
git commit -m "chore: add pnpm workspace config"
```

---

### Task 2: Create directory structure and move Rialto library files

**Step 1: Create the packages/rialto directory structure**

```bash
mkdir -p packages/rialto/src
```

**Step 2: Move library source files into packages/rialto/src/**

Move these directories (the library):

```bash
mv src/components packages/rialto/src/
mv src/tokens packages/rialto/src/
mv src/styles packages/rialto/src/
mv src/hooks packages/rialto/src/
mv src/providers packages/rialto/src/
mv src/test packages/rialto/src/
mv src/lib-entry.ts packages/rialto/src/
mv src/vite-env.d.ts packages/rialto/src/
```

**Step 3: Move library build config into packages/rialto/**

```bash
mv vite.config.lib.ts packages/rialto/
mv tsconfig.lib.json packages/rialto/
cp tsconfig.json packages/rialto/tsconfig.json
```

Note: Copy (not move) tsconfig.json — root keeps one, rialto gets its own.

**Step 4: Move library docs into packages/rialto/**

```bash
mv llms.txt packages/rialto/
cp CLAUDE.md packages/rialto/CLAUDE.md
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: move library files to packages/rialto/"
```

---

### Task 3: Create the showcase app directory and move showcase files

**Step 1: Create the apps/showcase directory structure**

```bash
mkdir -p apps/showcase/src
```

**Step 2: Move showcase source files**

```bash
mv src/showcase apps/showcase/src/
mv src/pages apps/showcase/src/
mv src/layouts apps/showcase/src/
mv src/main.tsx apps/showcase/src/
mv index.html apps/showcase/
```

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: move showcase files to apps/showcase/"
```

---

### Task 4: Create packages/rialto/package.json

**Files:**

- Create: `packages/rialto/package.json`

**Step 1: Write the rialto package.json**

Create `packages/rialto/package.json`:

```json
{
  "name": "@mattbutlerengineering/rialto",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/lib/rialto.js",
  "module": "./dist/lib/rialto.js",
  "types": "./dist/lib/lib-entry.d.ts",
  "exports": {
    ".": {
      "types": "./dist/lib/lib-entry.d.ts",
      "import": "./dist/lib/rialto.js"
    },
    "./motion": {
      "types": "./dist/lib/tokens/motion.d.ts",
      "import": "./dist/lib/motion.js"
    },
    "./styles": "./dist/lib/styles.css",
    "./manifest": "./dist/manifest.json"
  },
  "files": ["dist/lib", "dist/manifest.json"],
  "sideEffects": ["*.css"],
  "scripts": {
    "build": "vite build --config vite.config.lib.ts && pnpm manifest",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "manifest": "npx tsx ../../scripts/generate-manifest.ts"
  },
  "peerDependencies": {
    "framer-motion": "^12.0.0",
    "lucide-react": ">=0.400.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.1.4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "axe-core": "^4.11.1",
    "framer-motion": "^12.34.0",
    "jsdom": "^28.1.0",
    "lucide-react": "^0.564.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "typescript": "^5.9.3",
    "vite": "^7.3.1",
    "vite-plugin-dts": "^4.5.4",
    "vitest": "^4.0.18",
    "vitest-axe": "^0.1.0"
  }
}
```

**Step 2: Commit**

```bash
git add packages/rialto/package.json
git commit -m "chore: add @mattbutlerengineering/rialto package.json"
```

---

### Task 5: Create apps/showcase/package.json and vite config

**Files:**

- Create: `apps/showcase/package.json`
- Create: `apps/showcase/vite.config.ts`
- Create: `apps/showcase/tsconfig.json`

**Step 1: Write the showcase package.json**

Create `apps/showcase/package.json`:

```json
{
  "name": "@mbe/showcase",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mattbutlerengineering/rialto": "workspace:*",
    "framer-motion": "^12.34.0",
    "lucide-react": "^0.564.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.13.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.1.4",
    "typescript": "^5.9.3",
    "vite": "^7.3.1"
  }
}
```

**Step 2: Write the showcase vite.config.ts**

Create `apps/showcase/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/rialto/",
  plugins: [react()],
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
});
```

**Step 3: Write the showcase tsconfig.json**

Create `apps/showcase/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
```

**Step 4: Commit**

```bash
git add apps/showcase/package.json apps/showcase/vite.config.ts apps/showcase/tsconfig.json
git commit -m "chore: add @mbe/showcase package config"
```

---

### Task 6: Update packages/rialto tsconfig and vite config paths

**Files:**

- Modify: `packages/rialto/tsconfig.json`
- Modify: `packages/rialto/tsconfig.lib.json`
- Modify: `packages/rialto/vite.config.lib.ts`

**Step 1: Update packages/rialto/tsconfig.json**

The existing tsconfig has path aliases (`@/tokens/*` etc.) and `"include": ["src"]`. Update paths to remove the `@/` aliases (they were only used by the showcase, not the library itself — library code uses relative imports). Keep `"include": ["src"]`.

Also remove `"types": ["vitest/globals"]` — add it to a vitest config instead, or keep it if vitest is a devDep.

Write `packages/rialto/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

**Step 2: Update packages/rialto/tsconfig.lib.json**

Write `packages/rialto/tsconfig.lib.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "allowImportingTsExtensions": false
  },
  "include": [
    "src/components",
    "src/providers",
    "src/tokens",
    "src/styles",
    "src/lib-entry.ts",
    "src/vite-env.d.ts"
  ],
  "exclude": ["src/**/*.test.*", "src/test"]
}
```

**Step 3: Update packages/rialto/vite.config.lib.ts**

The `__dirname` paths need to point to the right places. Remove the `@` alias (not needed).

Write `packages/rialto/vite.config.lib.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import path from "path";

export default defineConfig({
  plugins: [react(), dts({ tsconfigPath: "./tsconfig.lib.json" })],
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  build: {
    outDir: "dist/lib",
    lib: {
      entry: {
        rialto: path.resolve(__dirname, "src/lib-entry.ts"),
        motion: path.resolve(__dirname, "src/tokens/motion.ts"),
      },
      formats: ["es"],
      cssFileName: "styles",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "framer-motion", "lucide-react"],
    },
  },
});
```

**Step 4: Commit**

```bash
git add packages/rialto/tsconfig.json packages/rialto/tsconfig.lib.json packages/rialto/vite.config.lib.ts
git commit -m "chore: update rialto build configs for monorepo paths"
```

---

### Task 7: Update showcase imports to use @mattbutlerengineering/rialto

This is the largest single task. Every file in `apps/showcase/src/` that imports from the library needs to switch from relative paths to package imports.

**Files to modify:** All `.tsx` files in `apps/showcase/src/`

**Import mapping:**

| Old pattern                               | New pattern                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `from '../components/X/X'`                | `from '@mattbutlerengineering/rialto'`                                    |
| `from '../../components/X/X'`             | `from '@mattbutlerengineering/rialto'`                                    |
| `from '../../components'`                 | `from '@mattbutlerengineering/rialto'`                                    |
| `from '../components/Toast/ToastContext'` | `from '@mattbutlerengineering/rialto'` (export useToast from barrel)      |
| `from '../tokens/motion'`                 | `from '@mattbutlerengineering/rialto/motion'`                             |
| `from '../tokens/icons'`                  | `from '@mattbutlerengineering/rialto'` (export from barrel)               |
| `from '../providers'`                     | `from '@mattbutlerengineering/rialto'` (already exported from barrel)     |
| `from '../../providers'`                  | `from '@mattbutlerengineering/rialto'`                                    |
| `from '../styles/surfaces.module.css'`    | Remove composes, use local styles or className                            |
| `import './tokens/index.css'`             | `import '@mattbutlerengineering/rialto/styles'`                           |
| `import './styles/reset.css'`             | `import '@mattbutlerengineering/rialto/styles'` (bundled into styles.css) |
| `import './styles/global.css'`            | Keep — move global.css to showcase since it's app-level                   |

**Step 1: Ensure barrel exports include everything the showcase needs**

Check that `packages/rialto/src/components/index.ts` exports:

- All components
- `useToast` from Toast/ToastContext
- Icon utilities from tokens/icons

Check that `packages/rialto/src/lib-entry.ts` exports:

- `* from './components'`
- `* from './tokens/icons'`
- `* from './providers'`

If `useToast` or `iconCategories`/`getIconsByCategory` are not in the barrel, add them.

**Step 2: Update main.tsx**

In `apps/showcase/src/main.tsx`, change:

```ts
// Old
import "./tokens/index.css";
import "./styles/reset.css";
import "./styles/global.css";
import { ToastProvider } from "./components/Toast/Toast";
import { Spinner } from "./components/Progress/Progress";

// New
import "@mattbutlerengineering/rialto/styles";
import "./global.css"; // move global.css to apps/showcase/src/
import { ToastProvider, Spinner } from "@mattbutlerengineering/rialto";
```

Move `src/styles/global.css` to `apps/showcase/src/global.css` (it's app-level: body font, selection colors, reduced-motion). The font `@import` URLs stay with it since they're loaded by the app.

Wait — actually `global.css` contains the Google Fonts imports and body styles. These should stay with the showcase since different apps may want different font loading strategies. The token CSS (`colors.css`, `typography.css`, etc.) is already bundled into `@mattbutlerengineering/rialto/styles`.

**Step 3: Update all showcase .tsx file imports**

Use a search-and-replace approach. For each file in `apps/showcase/src/`:

Replace all component imports from relative paths with `@mattbutlerengineering/rialto`:

- `from '../components/ComponentName/ComponentName'` → `from '@mattbutlerengineering/rialto'`
- `from '../../components/ComponentName/ComponentName'` → `from '@mattbutlerengineering/rialto'`
- `from '../../components'` → `from '@mattbutlerengineering/rialto'`
- `from '../components/Toast/ToastContext'` → `from '@mattbutlerengineering/rialto'`
- `from '../../components/Toast/ToastContext'` → `from '@mattbutlerengineering/rialto'`
- `from '../tokens/motion'` → `from '@mattbutlerengineering/rialto/motion'`
- `from '../../tokens/motion'` → `from '@mattbutlerengineering/rialto/motion'`
- `from '../tokens/icons'` → `from '@mattbutlerengineering/rialto'`
- `from '../../tokens/icons'` → `from '@mattbutlerengineering/rialto'`
- `from '../providers'` → `from '@mattbutlerengineering/rialto'`
- `from '../../providers'` → `from '@mattbutlerengineering/rialto'`

Then consolidate: each file should have at most one `from '@mattbutlerengineering/rialto'` import (merge all named imports into a single import statement).

**Step 4: Handle App.module.css composes**

`apps/showcase/src/showcase/App.module.css` has `composes` from `../styles/surfaces.module.css`. This cross-package composes won't work.

Replace the 5 composes blocks with local CSS that replicates the surface styles, or remove them and apply surface classes via className in the JSX (the components already have the surfaces applied via their own CSS modules).

Review what these composed classes are used for in App.tsx — they're likely demo swatches showing the surface recipes. Replace with inline background/border styles or local classes that reference the CSS custom properties directly.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: update showcase imports to use @mattbutlerengineering/rialto package"
```

---

### Task 8: Update root package.json and cleanup old files

**Files:**

- Modify: `package.json` (root)
- Delete: old root configs that moved

**Step 1: Rewrite root package.json**

```json
{
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @mbe/showcase dev",
    "build": "pnpm --filter @mattbutlerengineering/rialto build && pnpm --filter @mbe/showcase build",
    "build:lib": "pnpm --filter @mattbutlerengineering/rialto build",
    "test": "pnpm -r test",
    "test:visual": "playwright test",
    "test:visual:update": "playwright test --update-snapshots",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "format": "prettier --write .",
    "size": "pnpm --filter @mattbutlerengineering/rialto exec size-limit",
    "size:check": "pnpm --filter @mattbutlerengineering/rialto exec size-limit --limit",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm --filter @mattbutlerengineering/rialto build && changeset publish",
    "lighthouse": "lhci autorun",
    "prepare": "git config core.hooksPath .githooks"
  },
  "devDependencies": {
    "@changesets/changelog-github": "^0.5.2",
    "@changesets/cli": "^2.29.8",
    "@eslint/js": "^9.0.0",
    "@lhci/cli": "^0.14.0",
    "@playwright/test": "^1.58.2",
    "@size-limit/file": "^12.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "lint-staged": "^16.2.7",
    "prettier": "^3.0.0",
    "size-limit": "^12.0.0",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.0.0"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --max-warnings 0"],
    "*.{ts,tsx,css,json,md}": ["prettier --write"]
  }
}
```

**Step 2: Clean up old root-level configs that moved**

Remove files that moved to packages/rialto:

```bash
rm -f vite.config.lib.ts tsconfig.lib.json
```

Keep at root: `tsconfig.json` (for IDE), `vite.config.ts` (delete — no longer needed at root), `eslint.config.js`, `playwright.config.ts`, `lighthouserc.json`.

Actually delete root `vite.config.ts` — it was the showcase vite config, now at `apps/showcase/vite.config.ts`.

```bash
rm -f vite.config.ts
```

**Step 3: Update root tsconfig.json**

The root tsconfig.json should be a project-references style config or just a basic one for IDE resolution. Simplify it:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "references": [{ "path": "./packages/rialto" }, { "path": "./apps/showcase" }],
  "include": []
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: update root config for monorepo workspace"
```

---

### Task 9: Update CI workflows for pnpm

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

**Step 1: Update ci.yml**

Replace `npm ci` with `pnpm install`, `npm run X` with `pnpm X`, and add pnpm setup step. Update paths for library verify step.

```yaml
name: CI

on:
  push:
    branches: [main, next]
  pull_request:
    branches: [main, next]

jobs:
  typecheck-and-build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - run: pnpm install

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Typecheck
        run: pnpm typecheck

      - name: Build library
        run: pnpm build:lib

      - name: Verify library output
        working-directory: packages/rialto
        run: |
          node --input-type=module -e "
            import { existsSync } from 'fs';
            const expected = [
              'dist/lib/rialto.js',
              'dist/lib/motion.js',
              'dist/lib/styles.css',
              'dist/lib/lib-entry.d.ts',
              'dist/lib/tokens/motion.d.ts',
              'dist/lib/components/index.d.ts',
              'dist/manifest.json',
            ];
            const missing = expected.filter(f => !existsSync(f));
            if (missing.length) {
              console.error('Missing lib output files:', missing);
              process.exit(1);
            }
            console.log('All expected library files present');
          "

      - name: Check bundle size
        run: pnpm size:check

      - name: Verify package exports
        working-directory: packages/rialto
        run: |
          node --input-type=module -e "
            import { createRequire } from 'module';
            import { resolve } from 'path';
            const pkg = createRequire(resolve('package.json'))('./package.json');
            for (const [key, value] of Object.entries(pkg.exports)) {
              const paths = typeof value === 'string' ? [value] : Object.values(value);
              for (const p of paths) {
                const { existsSync } = await import('fs');
                if (!existsSync(p.replace('./', ''))) {
                  console.error('Export ' + key + ' references missing file: ' + p);
                  process.exit(1);
                }
              }
            }
            console.log('All package exports resolve correctly');
          "

      - name: Build showcase
        run: pnpm --filter @mbe/showcase build

      - name: Lighthouse CI
        run: pnpm lighthouse

      - name: Upload artifact
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/showcase/dist

  visual-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - run: pnpm install

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run visual regression tests
        run: pnpm test:visual

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-test-results
          path: e2e/test-results/
          retention-days: 7

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: [typecheck-and-build, visual-tests]
    runs-on: ubuntu-latest

    permissions:
      pages: write
      id-token: write

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Update release.yml**

Same pattern — replace npm with pnpm, add pnpm setup:

```yaml
name: Release

on:
  push:
    branches: [main, next]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    permissions:
      contents: write
      pull-requests: write
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
          registry-url: "https://registry.npmjs.org"

      - run: pnpm install

      - name: Build library
        run: pnpm build:lib

      - name: Create Release PR or Version
        id: changesets
        uses: changesets/action@v1
        with:
          version: npx changeset version
          title: "chore: version packages"
          commit: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Create GitHub Release
        if: steps.changesets.outputs.published == 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PUBLISHED_PACKAGES: ${{ steps.changesets.outputs.publishedPackages }}
        run: |
          echo "$PUBLISHED_PACKAGES" | jq -r '.[].version' | while read -r version; do
            gh release create "v${version}" \
              --title "v${version}" \
              --generate-notes
          done

  snapshot:
    if: github.ref == 'refs/heads/next'
    runs-on: ubuntu-latest

    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
          registry-url: "https://registry.npmjs.org"

      - run: pnpm install

      - name: Build library
        run: pnpm build:lib

      - name: Verify library builds
        run: echo "Snapshot build verified. npm publish skipped (no NPM_TOKEN)."
```

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: update workflows for pnpm workspaces"
```

---

### Task 10: Update Playwright and Lighthouse configs

**Files:**

- Modify: `playwright.config.ts`
- Modify: `lighthouserc.json`

**Step 1: Update playwright.config.ts**

Change the webServer command to run the showcase:

```ts
webServer: {
  command: 'pnpm --filter @mbe/showcase dev -- --port 5173 --strictPort',
  url: 'http://localhost:5173/rialto/',
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
},
```

**Step 2: Update lighthouserc.json**

Change the server command:

```json
"startServerCommand": "pnpm --filter @mbe/showcase preview -- --port 9222"
```

But this requires the showcase to be built first. The CI pipeline already builds before running lighthouse, so this is fine.

**Step 3: Commit**

```bash
git add playwright.config.ts lighthouserc.json
git commit -m "chore: update Playwright and Lighthouse for monorepo paths"
```

---

### Task 11: Update .githooks and eslint config

**Files:**

- Modify: `.githooks/pre-commit`
- Modify: `eslint.config.js`

**Step 1: Update pre-commit hook**

Change `npx lint-staged` to `pnpm exec lint-staged`:

```sh
#!/bin/sh
pnpm exec lint-staged
```

**Step 2: eslint.config.js**

Update ignores to include both package dist directories:

```js
{
  ignores: ["dist", "packages/*/dist", "apps/*/dist"];
}
```

**Step 3: Commit**

```bash
git add .githooks/pre-commit eslint.config.js
git commit -m "chore: update eslint and git hooks for monorepo"
```

---

### Task 12: Delete old node_modules, install with pnpm, verify

**Step 1: Delete old node_modules and lockfile**

```bash
rm -rf node_modules package-lock.json
```

**Step 2: Install with pnpm**

```bash
pnpm install
```

Expected: Creates `pnpm-lock.yaml`, installs into all workspaces.

**Step 3: Build the library**

```bash
pnpm build:lib
```

Expected: `packages/rialto/dist/lib/` contains `rialto.js`, `motion.js`, `styles.css`, `lib-entry.d.ts`.

**Step 4: Build the showcase**

```bash
pnpm --filter @mbe/showcase build
```

Expected: `apps/showcase/dist/` contains the built showcase app.

**Step 5: Run tests**

```bash
pnpm test
```

Expected: All unit tests pass in `packages/rialto`.

**Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors in either package.

**Step 7: Run dev server**

```bash
pnpm dev
```

Expected: Showcase starts on localhost:5173/rialto/ and renders correctly.

**Step 8: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: add pnpm lockfile"
```

---

### Task 13: Final cleanup and squash commit

**Step 1: Remove stale files**

Check for any leftover files in `src/` that should have been moved:

```bash
ls src/
```

If `src/` is empty or only has remnants, delete it:

```bash
rm -rf src/
```

Also remove `package-lock.json` from git if it's still tracked.

**Step 2: Update .changeset/config.json**

The package name changed from `rialto` to `@mattbutlerengineering/rialto`. Verify changesets config still works — the `"access": "public"` is important for scoped packages.

**Step 3: Update root CLAUDE.md**

Update file paths in CLAUDE.md to reflect new locations:

- `src/components/` → `packages/rialto/src/components/`
- `src/tokens/` → `packages/rialto/src/tokens/`
- `src/styles/` → `packages/rialto/src/styles/`
- `src/showcase/` → `apps/showcase/src/showcase/`
- Add note about workspace structure

**Step 4: Update TODO.md**

Mark monorepo as complete.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finalize monorepo conversion cleanup"
```
