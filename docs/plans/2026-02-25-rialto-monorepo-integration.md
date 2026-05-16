# Rialto Monorepo Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the Rialto design system from `mattbutlerengineering/rialto` into this monorepo as `packages/rialto` + `apps/rialto-web`, upgrading all shared dependencies (React 19, Vite 7, ESLint 10, TS 5.9).

**Architecture:** Clone the rialto repo, copy `packages/rialto/` and `apps/showcase/` into the monorepo's standard directories, adapt configs to extend `@mbe/config`, upgrade all apps to aligned dependency versions, and add rialto-specific root tooling (changesets, size-limit, Playwright, Lighthouse CI).

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, ESLint 10, Framer Motion, CSS Modules, Vitest, Playwright, Changesets

**Design doc:** `docs/plans/2026-02-25-rialto-monorepo-integration-design.md`

---

### Task 1: Clone Rialto and Copy Files Into Monorepo

**Files:**
- Create: `packages/rialto/` (all contents from rialto's `packages/rialto/`)
- Create: `apps/rialto-web/` (all contents from rialto's `apps/showcase/`)
- Create: `packages/rialto/scripts/` (from rialto's `scripts/`)
- Create: `apps/rialto-web/e2e/` (from rialto's `e2e/`)
- Create: `.changeset/config.json` (from rialto's `.changeset/`)
- Create: `.changeset/README.md` (from rialto's `.changeset/`)
- Create: `lighthouserc.json` (from rialto's root)

**Step 1: Clone rialto into a temp directory**

```bash
git clone --depth 1 https://github.com/mattbutlerengineering/rialto.git /tmp/rialto-import
```

**Step 2: Copy the component library package**

```bash
cp -r /tmp/rialto-import/packages/rialto packages/rialto
```

**Step 3: Copy the showcase app as rialto-web**

```bash
cp -r /tmp/rialto-import/apps/showcase apps/rialto-web
```

**Step 4: Copy scripts into the rialto package**

```bash
cp -r /tmp/rialto-import/scripts packages/rialto/scripts
```

**Step 5: Copy e2e tests into rialto-web**

```bash
mkdir -p apps/rialto-web/e2e
cp -r /tmp/rialto-import/e2e/* apps/rialto-web/e2e/
```

**Step 6: Copy Playwright config into rialto-web**

```bash
cp /tmp/rialto-import/playwright.config.ts apps/rialto-web/playwright.config.ts
```

**Step 7: Copy changeset config**

```bash
mkdir -p .changeset
cp /tmp/rialto-import/.changeset/config.json .changeset/config.json
cp /tmp/rialto-import/.changeset/README.md .changeset/README.md
```

**Step 8: Copy Lighthouse config**

```bash
cp /tmp/rialto-import/lighthouserc.json lighthouserc.json
```

**Step 9: Copy rialto docs**

```bash
cp -r /tmp/rialto-import/docs packages/rialto/docs
```

**Step 10: Clean up temp clone**

```bash
rm -rf /tmp/rialto-import
```

**Step 11: Verify the copy**

```bash
ls packages/rialto/src/components/ | wc -l
# Expected: ~59 entries (56 component dirs + 3 test files + index.ts)
ls apps/rialto-web/src/
# Expected: src directory with showcase app files
ls packages/rialto/scripts/
# Expected: generate-manifest.ts, character-limits.ts
```

**Step 12: Commit**

```bash
git add packages/rialto apps/rialto-web .changeset lighthouserc.json
git commit -m "chore: copy rialto files into monorepo (raw, pre-adaptation)"
```

---

### Task 2: Rename Showcase to rialto-web and Update Package Names

**Files:**
- Modify: `apps/rialto-web/package.json`
- Modify: `.changeset/config.json`
- Modify: `lighthouserc.json`
- Modify: `apps/rialto-web/playwright.config.ts`

**Step 1: Update apps/rialto-web/package.json**

Change `"name": "@mbe/showcase"` to `"name": "@mbe/rialto-web"`. Leave dependencies alone for now (they'll be updated in Task 4).

**Step 2: Update .changeset/config.json**

Change the repo reference from `"mattbutlerengineering/rialto"` to `"mattbutlerengineering/mattbutlerengineering"`.

**Step 3: Update lighthouserc.json**

Change `@mbe/showcase` references to `@mbe/rialto-web`:
- `startServerCommand`: `pnpm --filter @mbe/rialto-web exec vite preview --port 9222`

**Step 4: Update apps/rialto-web/playwright.config.ts**

Change `@mbe/showcase` references to `@mbe/rialto-web`:
- `webServer.command`: `pnpm --filter @mbe/rialto-web dev -- --port 5173 --strictPort`

**Step 5: Update script references in packages/rialto/package.json**

The manifest script references `../../scripts/generate-manifest.ts`. Since we moved scripts into `packages/rialto/scripts/`, update to `./scripts/generate-manifest.ts`:
- Change: `"manifest": "npx tsx ../../scripts/generate-manifest.ts"` → `"manifest": "npx tsx scripts/generate-manifest.ts"`

**Step 6: Commit**

```bash
git add apps/rialto-web/package.json .changeset/config.json lighthouserc.json apps/rialto-web/playwright.config.ts packages/rialto/package.json
git commit -m "chore: rename showcase to rialto-web, update references"
```

---

### Task 3: Upgrade @mbe/config — ESLint 10, jsx-a11y, TypeScript 5.9

**Files:**
- Modify: `packages/config/package.json`
- Modify: `packages/config/eslint/base.js`
- Modify: `packages/config/eslint/react.js`
- Modify: `packages/config/typescript/base.json`

**Step 1: Update packages/config/package.json**

Upgrade these devDependencies:
```json
{
  "@eslint/js": "^10.0.1",
  "eslint": "^10.0.1",
  "eslint-config-prettier": "^10.0.1",
  "eslint-plugin-react": "^7.37.4",
  "eslint-plugin-react-hooks": "^7.0.1",
  "eslint-plugin-jsx-a11y": "^6.10.2",
  "eslint-plugin-react-refresh": "^0.5.2",
  "prettier": "^3.4.2",
  "typescript": "^5.9.3",
  "typescript-eslint": "^8.56.1"
}
```

New additions: `eslint-plugin-jsx-a11y`, `eslint-plugin-react-refresh`.

**Step 2: Add jsx-a11y and react-refresh to packages/config/eslint/react.js**

```javascript
import baseConfig from "./base.js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  ...baseConfig,
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11y,
      "react-refresh": reactRefresh,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
];
```

**Step 3: Verify ESLint 10 compatibility in packages/config/eslint/base.js**

Check that the base config is compatible with ESLint 10. The flat config format should work. If `eslint-config-prettier` needs updating, update it.

**Step 4: Run pnpm install from monorepo root**

```bash
pnpm install
```

Expected: lockfile updates, no errors.

**Step 5: Run lint to verify config works**

```bash
pnpm lint
```

Expected: Lint passes (may have new warnings from jsx-a11y on existing code — address separately).

**Step 6: Commit**

```bash
git add packages/config/ pnpm-lock.yaml
git commit -m "feat(config): upgrade to ESLint 10, add jsx-a11y and react-refresh plugins"
```

---

### Task 4: Upgrade All Apps — React 19, Vite 7, TypeScript 5.9

**Files:**
- Modify: `apps/hospitality/package.json`
- Modify: `apps/marketing/package.json`
- Modify: `apps/hospitality/vite.config.ts` (if Vite 7 API changes)
- Modify: `apps/marketing/vite.config.ts` (if Vite 7 API changes)
- Modify: `packages/auth/package.json` (if it has React peer dep)
- Modify: `packages/ui/package.json` (if it has React peer dep)
- Modify: `packages/shared-layout/package.json` (if it has React peer dep)

**Step 1: Update apps/hospitality/package.json dependencies**

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.9.3",
    "vite": "^7.0.0"
  }
}
```

Note: `react-konva` may need a React 19-compatible version. Check and update as needed. If `react-konva` doesn't support React 19, it may need `--legacy-peer-deps` or a version bump.

**Step 2: Update apps/marketing/package.json dependencies**

Same React/Vite/TS upgrades as dashboard.

**Step 3: Check and update shared packages for React 19 compatibility**

Read `packages/auth/package.json`, `packages/ui/package.json`, and `packages/shared-layout/package.json`. If any have React as a dependency or peerDependency, update to `^19.0.0`.

**Step 4: Run pnpm install**

```bash
pnpm install
```

Expected: lockfile updates. Watch for peer dependency warnings.

**Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: Pass. React 19 types are mostly backward-compatible, but watch for:
- `React.FC` no longer includes `children` prop implicitly
- `useRef` returns `RefObject` instead of `MutableRefObject`
- Removed deprecated APIs

**Step 6: Fix any type errors from React 19 migration**

Common fixes:
- Add explicit `children: React.ReactNode` to component props where needed
- Update `useRef` calls if needed

**Step 7: Run build**

```bash
pnpm build
```

Expected: All apps build successfully with Vite 7.

**Step 8: Run tests**

```bash
pnpm test
```

Expected: All existing tests pass.

**Step 9: Commit**

```bash
git add apps/ packages/ pnpm-lock.yaml
git commit -m "feat: upgrade to React 19, Vite 7, TypeScript 5.9"
```

---

### Task 5: Adapt Rialto Package Config — tsconfig, ESLint, Vitest

**Files:**
- Modify: `packages/rialto/tsconfig.json`
- Modify: `packages/rialto/tsconfig.lib.json`
- Modify: `packages/rialto/package.json` (adjust scripts, add lint script if missing)
- Create: `packages/rialto/eslint.config.js` (or verify it can use root config)

**Step 1: Update packages/rialto/tsconfig.json to extend @mbe/config**

```json
{
  "extends": "@mbe/config/typescript/react",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noUncheckedIndexedAccess": true,
    "useDefineForClassFields": true,
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

**Step 2: Update packages/rialto/tsconfig.lib.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "allowImportingTsExtensions": false,
    "types": []
  },
  "include": [
    "src/components",
    "src/providers",
    "src/tokens",
    "src/styles",
    "src/hooks",
    "src/lib-entry.ts",
    "src/vite-env.d.ts"
  ],
  "exclude": ["src/**/*.test.*", "src/test"]
}
```

**Step 3: Add vitest config to packages/rialto/package.json**

The root vitest.config.ts from rialto should become a local config. Create or verify `packages/rialto/vitest.config.ts` exists. If rialto doesn't have its own, create one based on the root config from the rialto repo:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
```

**Step 4: Run typecheck for rialto package**

```bash
cd packages/rialto && pnpm typecheck
```

Expected: Pass with the new tsconfig.

**Step 5: Run rialto tests**

```bash
cd packages/rialto && pnpm test
```

Expected: All tests pass.

**Step 6: Run rialto build**

```bash
cd packages/rialto && pnpm build
```

Expected: Library builds to `dist/lib/` with types.

**Step 7: Commit**

```bash
git add packages/rialto/
git commit -m "chore(rialto): adapt tsconfig and vitest config for monorepo"
```

---

### Task 6: Adapt rialto-web App Config — tsconfig, Vite

**Files:**
- Modify: `apps/rialto-web/tsconfig.json`
- Modify: `apps/rialto-web/vite.config.ts`
- Modify: `apps/rialto-web/package.json`

**Step 1: Update apps/rialto-web/tsconfig.json to extend @mbe/config**

```json
{
  "extends": "@mbe/config/typescript/react",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noUncheckedIndexedAccess": true,
    "useDefineForClassFields": true,
    "moduleDetection": "force",
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
```

**Step 2: Verify vite.config.ts works**

The showcase vite.config.ts should work as-is. It uses `base: '/rialto/'` which is fine for now. No structural changes needed.

**Step 3: Update apps/rialto-web/package.json name and dependency reference**

Verify that `@mattbutlerengineering/rialto` dependency points to `workspace:*`:
```json
{
  "name": "@mbe/rialto-web",
  "dependencies": {
    "@mattbutlerengineering/rialto": "workspace:*"
  }
}
```

**Step 4: Run pnpm install**

```bash
pnpm install
```

**Step 5: Run rialto-web dev server to verify**

```bash
pnpm --filter @mbe/rialto-web dev
```

Expected: Dev server starts, showcase app loads at `http://localhost:5173/rialto/`.

**Step 6: Commit**

```bash
git add apps/rialto-web/
git commit -m "chore(rialto-web): adapt config for monorepo"
```

---

### Task 7: Update Root package.json, turbo.json, .gitignore

**Files:**
- Modify: `package.json` (root)
- Modify: `turbo.json`
- Modify: `.gitignore`

**Step 1: Add root devDependencies**

Add to root `package.json` devDependencies:

```json
{
  "@changesets/cli": "^2.29.8",
  "@changesets/changelog-github": "^0.5.2",
  "@size-limit/file": "^12.0.0",
  "size-limit": "^12.0.0",
  "@playwright/test": "^1.58.2",
  "@lhci/cli": "^0.15.1"
}
```

**Step 2: Add root scripts**

Add to root `package.json` scripts:

```json
{
  "changeset": "changeset",
  "version-packages": "changeset version",
  "release": "pnpm --filter @mattbutlerengineering/rialto build && changeset publish",
  "test:visual": "playwright test --config apps/rialto-web/playwright.config.ts",
  "lighthouse": "lhci autorun",
  "size": "pnpm --filter @mattbutlerengineering/rialto exec size-limit",
  "size:check": "pnpm --filter @mattbutlerengineering/rialto exec size-limit --limit"
}
```

**Step 3: Add size-limit config to packages/rialto/package.json**

Move the `size-limit` configuration from the rialto root `package.json` into `packages/rialto/package.json`:

```json
{
  "size-limit": [
    {
      "name": "JS (all components)",
      "path": "dist/lib/rialto.js",
      "limit": "150 kB"
    },
    {
      "name": "CSS (all styles)",
      "path": "dist/lib/styles.css",
      "limit": "120 kB"
    },
    {
      "name": "Motion tokens",
      "path": "dist/lib/motion.js",
      "limit": "1 kB"
    }
  ]
}
```

**Step 4: Update turbo.json**

Add `test:visual` task:

```json
{
  "test:visual": {
    "cache": false,
    "dependsOn": ["build"]
  }
}
```

**Step 5: Update .gitignore**

Add these lines:

```
# Playwright
e2e/test-results/

# Lighthouse CI
.lighthouseci/
```

**Step 6: Run pnpm install**

```bash
pnpm install
```

**Step 7: Commit**

```bash
git add package.json turbo.json .gitignore pnpm-lock.yaml packages/rialto/package.json
git commit -m "chore: add rialto root tooling (changesets, size-limit, playwright, lighthouse)"
```

---

### Task 8: Run Prettier on All Rialto Files

**Files:**
- Modify: All files in `packages/rialto/` and `apps/rialto-web/` (formatting only)

**Step 1: Run prettier on rialto package**

```bash
npx prettier --write "packages/rialto/**/*.{ts,tsx,css,json,md}"
```

Expected: Files reformatted from single quotes to double quotes, 80→100 char width.

**Step 2: Run prettier on rialto-web app**

```bash
npx prettier --write "apps/rialto-web/**/*.{ts,tsx,css,json,md,html}"
```

**Step 3: Verify lint passes**

```bash
pnpm lint
```

Expected: Pass (possibly with some new warnings — fix if any are errors).

**Step 4: Commit**

```bash
git add packages/rialto/ apps/rialto-web/
git commit -m "style: reformat rialto files to monorepo prettier config"
```

---

### Task 9: Full Integration Smoke Test

**Files:** None (verification only)

**Step 1: Clean install**

```bash
rm -rf node_modules && pnpm install
```

**Step 2: Build all**

```bash
pnpm build
```

Expected: All packages and apps build successfully, including rialto library build.

**Step 3: Typecheck all**

```bash
pnpm typecheck
```

Expected: Pass across all packages.

**Step 4: Lint all**

```bash
pnpm lint
```

Expected: Pass (or only warnings, no errors).

**Step 5: Test all**

```bash
pnpm test
```

Expected: All tests pass, including rialto's unit tests.

**Step 6: Start dev servers**

```bash
pnpm --filter @mbe/rialto-web dev &
pnpm --filter @mbe/hospitality dev &
pnpm --filter @mbe/marketing dev &
```

Verify each starts without errors:
- rialto-web: `http://localhost:5173/rialto/`
- hospitality: `http://localhost:3002/hospitality`
- web: `http://localhost:3000`

**Step 7: Fix any remaining issues**

Address any errors found during the smoke test. Common issues:
- Missing peer dependencies
- Import path issues from the move
- CSS module resolution differences
- Vite 7 API changes in config files

**Step 8: Commit fixes if any**

```bash
git add .
git commit -m "fix: resolve integration issues from rialto migration"
```

---

### Task 10: Update AGENTS.md and Clean Up

**Files:**
- Modify: `AGENTS.md`
- Delete: Any rialto-specific files that shouldn't be in the monorepo

**Step 1: Update AGENTS.md directory layout**

Add rialto to the directory layout section:

```
├── packages/
│   ├── rialto/            # Rialto design system (React component library)
│   ├── types/             # Shared TypeScript types
│   ├── auth/              # Auth utilities (React + Fastify)
│   ├── ui/                # Shared UI components (being replaced by rialto)
│   └── config/            # ESLint/TypeScript/Prettier configs
```

Add rialto-web to apps:

```
├── apps/
│   ├── web/                # Public marketing site (React + Vite)
│   ├── dashboard/          # Authenticated dashboard (React + Vite)
│   └── rialto-web/         # Design system showcase (React + Vite)
```

**Step 2: Add rialto-specific build commands to AGENTS.md**

```markdown
### Rialto Design System
```bash
cd packages/rialto

pnpm build        # Build library (Vite lib mode + types)
pnpm test         # Run component tests
pnpm typecheck    # TypeScript type checking

# From root:
pnpm size         # Check bundle size
pnpm size:check   # Enforce bundle size limits
pnpm test:visual  # Run Playwright visual regression tests
```

**Step 3: Remove any leftover rialto-specific root files**

Check for and remove any files that were accidentally copied and shouldn't be here (e.g., rialto's `.github/workflows/` if copied).

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with rialto package and commands"
```

---

### Task 11: Final Commit — Clean State

**Step 1: Run full verification suite one more time**

```bash
pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Expected: All pass.

**Step 2: Review git log**

```bash
git log --oneline -10
```

Verify the commit history tells a clear story of the migration.

**Step 3: Done**

The rialto design system is now integrated into the monorepo. Follow-up work (tracked separately):
- Wire dashboard/web to consume `@mattbutlerengineering/rialto`
- Migrate components from `@mbe/ui` to `@mattbutlerengineering/rialto`
- Update CI/CD pipelines
- Set up Playwright visual test baseline in CI
