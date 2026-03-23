# Phase 8: AI Developer Experience - Research

**Researched:** 2026-03-22
**Domain:** Machine-readable design system artifacts, CLI scaffolding, static JSON serving
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIDX-01 | Component registry JSON at `packages/rialto/registry.json` with name, description, props, import path, examples | Extend existing `generate-manifest.ts` + TypeScript compiler API infrastructure; output to `registry.json` instead of `dist/manifest.json` |
| AIDX-02 | Two-tier llms.txt at repo root: overview (<20KB) + full (complete component API + patterns) | `packages/rialto/llms.txt` already exists (26KB) — move/symlink to root as `llms-full.txt`, generate lean `llms.txt` from registry |
| AIDX-03 | CLAUDE.md updated with Rialto usage section (imports, tokens, provider setup, top components) | Append section to existing `./CLAUDE.md`; content sourced from existing `packages/rialto/CLAUDE.md` and `llms.txt` |
| AIDX-04 | CLI scaffold command (`mbe new`) creates app skeleton with RialtoProvider, layout, example page | New `new.ts` command in `tools/cli/src/commands/` using `commander`, `fs`, `path`; no new deps needed |
| AIDX-06 | Registry served as static JSON from rialto-web at `/rialto/registry.json` with correct Content-Type | Copy `registry.json` into `apps/rialto-web/public/` at build time; Cloudflare Pages serves with correct Content-Type automatically |
</phase_requirements>

---

## Summary

Phase 8 produces five machine-readable artifacts that make Rialto consumable by AI tools without human mediation: a component registry JSON (`registry.json`), a two-tier llms.txt pair at the repo root, a Rialto usage section in the root CLAUDE.md, a CLI scaffold command (`mbe new`), and the registry served as static JSON from the rialto-web app.

The infrastructure for most of this already exists. The TypeScript Compiler API pipeline in `packages/rialto/scripts/generate-manifest.ts` already extracts component names, props, JSDoc descriptions, and character limits into `dist/manifest.json`. The `registry.json` requirement is essentially a renamed, enriched version of this manifest with added fields (import path, examples). The existing `packages/rialto/llms.txt` (currently 26KB — already over the 20KB limit for `llms.txt`) needs to move to the repo root as `llms-full.txt`, and a new lean `llms.txt` (under 20KB) must be generated. The CLI uses `commander` and already has a clear command pattern to follow for the new `mbe new` subcommand. Static file serving from rialto-web via Cloudflare Pages requires only dropping `registry.json` into `apps/rialto-web/public/`.

**Primary recommendation:** Treat this phase as artifact generation and wiring — not new technology introduction. All core infrastructure (TypeScript compiler API, commander CLI, Vite/CF Pages static serving) is already in place.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` (compiler API) | ^5.9.3 | Parse component source to extract props/JSDoc | Already used in `generate-manifest.ts`; no new dep |
| `commander` | ^12.0.0 | CLI argument parsing for `mbe new` | Already used in all CLI commands |
| `tsx` | ^4.19.0 | Run TypeScript scripts directly | Already used for `generate-manifest.ts` |
| `fs` / `path` (Node built-ins) | — | File I/O for scaffold generation | No deps needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs/promises` | Node built-in | Async file copy/mkdir for scaffold | Preferred over sync API in CLI commands |
| CF Pages `_headers` | CF convention | Set `Content-Type` for static files | Only needed if default headers are wrong (they aren't for `.json`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `generate-manifest.ts` | `react-docgen-typescript` | react-docgen-typescript is an alternative prop extractor but the TypeScript compiler API is already integrated and working; no reason to switch |
| Static file in `public/` | Route handler in rialto-web | Static file is simpler, no JS bundle cost, correct for machine consumption |
| Generating `llms-full.txt` from manifest | Keeping existing `llms.txt` as `llms-full.txt` | Existing file is hand-curated with composition patterns and is correct; move it, don't regenerate it |

**Installation:** No new dependencies required for any AIDX requirement.

---

## Architecture Patterns

### Recommended File Layout

```
packages/rialto/
├── scripts/
│   ├── generate-manifest.ts      # Existing — generates dist/manifest.json
│   └── generate-registry.ts      # NEW — generates registry.json (committed)
├── registry.json                 # NEW — committed artifact (AIDX-01)
└── llms.txt                      # EXISTING — move this to repo root as llms-full.txt

apps/rialto-web/
└── public/
    └── registry.json             # NEW — symlink or copy from packages/rialto/registry.json (AIDX-06)

tools/cli/src/commands/
└── new.ts                        # NEW — mbe new <app-name> scaffold command (AIDX-04)

# Repo root
llms.txt                          # NEW — lean overview <20KB (AIDX-02)
llms-full.txt                     # MOVED from packages/rialto/llms.txt (AIDX-02)
CLAUDE.md                         # AMENDED — add Rialto usage section (AIDX-03)
```

### Pattern 1: Registry JSON Generation Script

**What:** A new `scripts/generate-registry.ts` that extends the existing `generate-manifest.ts` logic. It outputs `packages/rialto/registry.json` (committed to the repo, not in `dist/`).

**When to use:** Run as part of `pnpm build` in the rialto package via a new `build:registry` script. Also runs standalone: `pnpm exec tsx scripts/generate-registry.ts`.

**Key differences from `generate-manifest.ts`:**
- Output path: `packages/rialto/registry.json` (repo root of package, not `dist/`)
- Added fields: `importPath` (always `"@mbe/rialto"` since all components are barrel-exported), `category` (inferred from component name or lookup table)
- The `examples` field: the requirement lists examples but REQUIREMENTS.md notes "Auto-generated prop tables from TypeScript" is out of scope for hand-written examples. Examples should be omitted from the generated registry or populated as an empty array — the existing composition examples live in `llms.txt` and are not mechanically extractable.

```typescript
// Source: pattern derived from packages/rialto/scripts/generate-manifest.ts
interface RegistryComponent {
  name: string;
  description?: string;
  importPath: string;      // always "@mbe/rialto"
  props: PropInfo[];
  slots: string[];
  characterLimits?: CharacterLimitInfo[];
}

interface Registry {
  version: string;
  generatedAt: string;
  components: RegistryComponent[];
}

// Output: packages/rialto/registry.json (committed)
const outPath = path.join(rootDir, "registry.json");
```

### Pattern 2: CI Diff Check for registry.json

**What:** A CI step in `ci.yml` that regenerates `registry.json` and fails if the committed version diverges from the generated output.

**When to use:** Added to the `build` job in `.github/workflows/ci.yml` after `pnpm build`.

```yaml
# Source: derived from existing ci.yml pattern
- name: Check registry.json is up to date
  run: |
    pnpm --filter @mbe/rialto build:registry
    git diff --exit-code packages/rialto/registry.json || \
      (echo "registry.json is out of date. Run 'pnpm --filter @mbe/rialto build:registry' and commit." && exit 1)
```

**Key insight:** `git diff --exit-code` returns non-zero if the file changed after regeneration. This is the standard pattern for generated-file drift checks (same pattern used by Prisma migration status checks in this repo).

### Pattern 3: Two-Tier llms.txt

**What:** `llms.txt` (lean, <20KB) + `llms-full.txt` (complete, no size limit) at the repo root.

**Content strategy:**
- `llms-full.txt`: Move the existing `packages/rialto/llms.txt` to repo root. It is already hand-curated (26KB) and correct. No generation needed.
- `llms.txt`: New lean file manually authored. Should include: package identity, import pattern, RialtoProvider setup, component catalog table (component name + one-line description + key props), token quick-reference (surfaces/text/borders), and a pointer to `llms-full.txt` for complete prop tables and examples. Must stay under 20KB (~20,000 bytes = ~18,000 chars).

**Size budget for `llms.txt`:**
- Header + package info: ~0.2KB
- Component catalog table (57 components, ~100 chars each): ~5.7KB
- Token quick-reference (condensed): ~2KB
- Provider setup + import example: ~0.5KB
- Pointer to `llms-full.txt`: ~0.1KB
- Total estimate: ~8.5KB — well within 20KB budget

### Pattern 4: `mbe new <app-name>` CLI Command

**What:** A new `new.ts` command registered in `tools/cli/src/index.ts` that creates `apps/<name>/` with all required files.

**Files to generate:**
```
apps/<name>/
├── package.json              # deps: @mbe/rialto, react, react-dom, react-router-dom, framer-motion
├── tsconfig.json             # extends ../../packages/config/tsconfig.app.json
├── vite.config.ts            # base: "/<name>/", server.port: <next-available>
├── index.html                # standard Vite entry point
├── public/
│   └── favicon.svg           # copy from marketing or rialto-web
└── src/
    ├── main.tsx              # RialtoProvider + BrowserRouter with basename="/<name>"
    ├── App.tsx               # Shell with placeholder route to ExamplePage
    ├── global.css            # import @mbe/rialto/styles
    └── pages/
        └── ExamplePage.tsx   # Skeleton with Card, Stack, Text, Button using Rialto components
```

**Port assignment:** AUTO-ASSIGN starting from 3005. The `CLAUDE.md` documents that 3000-3004 are reserved. The `mbe new` command should assign `3005` (or check for conflicts by scanning existing `vite.config.ts` files for used ports).

**Implementation approach:** Use template literal strings in `new.ts` (no template engine needed). The command is simple enough that inline string templates are cleaner than adding a dep like `handlebars`.

```typescript
// Source: commander pattern from tools/cli/src/commands/agent.ts
export const newCommand = new Command("new")
  .description("Scaffold a new app with Rialto")
  .argument("<name>", "App name (becomes /name path and apps/name directory)")
  .option("-p, --port <port>", "Dev server port", "3005")
  .action(async (name: string, options: { port: string }) => {
    // Validate name (kebab-case, no spaces)
    // Create apps/<name>/ directory
    // Write all template files
    // Print next steps
  });
```

**Naming constraint:** The requirement spec says `mbe init my-app` but REQUIREMENTS.md says `mbe new`. The CLAUDE.md documentation section also says `mbe init`. Planner must resolve: use `mbe new` (matches AIDX-04 requirement text) and add `mbe init` as an alias, or pick one. Recommendation: implement as `mbe new` with `mbe init` registered as an alias in commander (`.alias("init")`).

### Pattern 5: Serving registry.json from rialto-web

**What:** `apps/rialto-web/public/registry.json` served at `/rialto/registry.json`.

**How:** Cloudflare Pages automatically serves files in `public/` with correct Content-Type based on extension. `.json` files get `application/json`. No `_headers` entry needed for Content-Type (CF Pages sets it automatically). The `public/_headers` file currently only deals with `Cache-Control` headers — the same pattern can optionally add a `Cache-Control` for `registry.json` if desired.

**Build-time copy:** The `registry.json` at `packages/rialto/registry.json` must be copied to `apps/rialto-web/public/registry.json` at build time. Options:

1. **Vite plugin in rialto-web's `vite.config.ts`** that copies the file during build (cleanest, no extra tooling)
2. **`pnpm --filter @mbe/rialto-web build` script** that does `cp ../../packages/rialto/registry.json public/registry.json && vite build`
3. **Turborepo task dependency** — rialto-web build depends on rialto build (already the case), so a postbuild hook can copy

Recommendation: Option 2 (script in `package.json`) is simplest and most explicit. The Turborepo dependency is already correct since rialto-web depends on `@mbe/rialto`.

```json
// apps/rialto-web/package.json scripts
"prebuild": "cp ../../packages/rialto/registry.json public/registry.json",
"build": "tsc -b && vite build"
```

### Anti-Patterns to Avoid

- **Shadcn CLI registry format:** Explicitly out of scope per REQUIREMENTS.md. Do not structure `registry.json` to match shadcn's schema.
- **Auto-generating component examples from TypeScript:** Out of scope (REQUIREMENTS.md: "Auto-generated prop tables from TypeScript... out of scope"). Leave `examples` field empty array or omit entirely.
- **Publishing to npm:** Out of scope (`DIST-F01` is a future requirement). The `importPath` in `registry.json` should use workspace notation.
- **Checking llms.txt into `packages/rialto/`:** The requirement is repo root. The file currently at `packages/rialto/llms.txt` moves to repo root as `llms-full.txt`.
- **Port conflicts in scaffold:** Don't hardcode 3005 — scan existing vite configs to find the next unused port.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript prop extraction | Custom AST walker | `typescript` compiler API (already used in generate-manifest.ts) | Full type resolution, handles generics, intersection types |
| CLI argument parsing | Manual `process.argv` | `commander` (already in CLI) | Already in use, handles help generation, option parsing |
| File template engine | `handlebars`, `mustache` | Template literals in TypeScript | Scaffold templates are small and static; a template engine is overkill |
| JSON diff in CI | Custom comparison script | `git diff --exit-code` | Standard git tooling, already in repo for migration checks |

**Key insight:** Every tool needed for this phase is already installed in the monorepo. Zero new dependencies are required.

---

## Common Pitfalls

### Pitfall 1: registry.json output path vs dist/manifest.json

**What goes wrong:** Putting `registry.json` in `dist/` alongside `manifest.json` — then it's in `.gitignore` (dist artifacts) and can't be committed.

**Why it happens:** `generate-manifest.ts` outputs to `dist/`. Naively copying the script outputs to the same location.

**How to avoid:** The new `generate-registry.ts` script outputs to `packages/rialto/registry.json` (package root, not `dist/`). Confirm `packages/rialto/.gitignore` (if any) does not exclude `registry.json`. The `dist/` directory IS gitignored; `registry.json` at the package root is not.

**Warning signs:** CI diff check passes vacuously because `registry.json` is in `.gitignore`.

### Pitfall 2: llms.txt size exceeds 20KB

**What goes wrong:** Including full prop tables for all 57 components in `llms.txt` (the lean version) pushes it well over 20KB.

**Why it happens:** Copy-paste from the full file without trimming.

**How to avoid:** `llms.txt` should contain only: component catalog table (one row per component), essential token reference, and provider setup. Full prop tables go only in `llms-full.txt`. Verify with `wc -c llms.txt` after writing — must be under 20,480 bytes.

**Warning signs:** `wc -c llms.txt` returns > 20000.

### Pitfall 3: Scaffold generates files that reference non-existent packages

**What goes wrong:** `mbe new my-app` generates a `package.json` referencing `"@mbe/rialto": "workspace:*"` but the generated app isn't added to `pnpm-workspace.yaml`.

**Why it happens:** `pnpm-workspace.yaml` already includes `"apps/*"` — so any directory created under `apps/` is automatically a workspace member. The scaffold just needs to create the directory and `package.json`; pnpm workspace discovery handles the rest.

**How to avoid:** The scaffold output goes to `apps/<name>/`. Since `pnpm-workspace.yaml` has `"apps/*"`, this is automatically included. User must run `pnpm install` after scaffolding to link workspace packages.

**Warning signs:** `pnpm install` fails after `mbe new` because the new package isn't found.

### Pitfall 4: CF Pages Content-Type for registry.json

**What goes wrong:** Assuming CF Pages won't serve `.json` with the correct Content-Type and adding an explicit `_headers` entry.

**Why it happens:** Overcaution. CF Pages DOES serve `.json` files with `application/json; charset=utf-8` automatically.

**How to avoid:** Deploy and verify. If Content-Type is wrong, add to `apps/rialto-web/public/_headers`:
```
/registry.json
  Content-Type: application/json; charset=utf-8
```

**Warning signs:** `curl -I https://mattbutlerengineering.com/rialto/registry.json` shows wrong Content-Type.

### Pitfall 5: `mbe new` command name vs `mbe init` in CLAUDE.md

**What goes wrong:** REQUIREMENTS.md says `mbe new` (AIDX-04 says `mbe new`). The success criteria says `mbe init my-app`. CLAUDE.md documents `mbe init`. Implementing one breaks the other.

**Why it happens:** The requirement spec was written incrementally.

**How to avoid:** Implement as `mbe new` (primary command name) with `.alias("init")` registered in commander. Both `mbe new my-app` and `mbe init my-app` work. Update CLAUDE.md to show both.

---

## Code Examples

### generate-registry.ts skeleton

```typescript
// Source: extends packages/rialto/scripts/generate-manifest.ts
import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

interface RegistryComponent {
  name: string;
  description?: string;
  importPath: string;
  props: PropInfo[];
  slots: string[];
  characterLimits?: CharacterLimitInfo[];
}

// Output to package root, not dist/
const outPath = path.join(rootDir, "registry.json");

const registry = {
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  components: components.map((c) => ({
    ...c,
    importPath: "@mbe/rialto",
  })),
};

fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n");
```

### mbe new command skeleton

```typescript
// Source: pattern from tools/cli/src/commands/agent.ts
import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const newCommand = new Command("new")
  .alias("init")
  .description("Scaffold a new app with Rialto provider and example page")
  .argument("<name>", "App name in kebab-case (creates apps/<name>/)")
  .option("-p, --port <port>", "Dev server port", "3005")
  .action(async (name: string, options: { port: string }) => {
    const appDir = join(process.cwd(), "apps", name);
    await mkdir(join(appDir, "src", "pages"), { recursive: true });
    await mkdir(join(appDir, "public"), { recursive: true });
    // Write each file using template literals...
    console.log(`\nScaffolded apps/${name}/`);
    console.log("Next steps:");
    console.log(`  pnpm install`);
    console.log(`  pnpm --filter @mbe/${name} dev`);
  });
```

### vite.config.ts generated for new app

```typescript
// Source: pattern from apps/hospitality/vite.config.ts and apps/rialto-web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/<name>/",
  plugins: [react()],
  server: {
    port: <port>,
  },
});
```

### main.tsx generated for new app

```typescript
// Source: pattern from apps/hospitality/src/main.tsx
import "@mbe/rialto/styles";
import "./global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RialtoProvider } from "@mbe/rialto";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RialtoProvider theme="system">
      <BrowserRouter basename="/<name>">
        <App />
      </BrowserRouter>
    </RialtoProvider>
  </StrictMode>
);
```

### CI diff check for registry.json

```yaml
# Source: pattern from .github/workflows/ci.yml migration validation step
- name: Check registry.json is up to date
  run: |
    pnpm --filter @mbe/rialto build:registry
    git diff --exit-code packages/rialto/registry.json || \
      (echo "ERROR: registry.json is stale. Run 'pnpm --filter @mbe/rialto build:registry' locally and commit the result." && exit 1)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `llms.txt` inside component package | `llms.txt` at repo root | Standard emerging 2024 | Root placement means AI tools find it automatically; inside the package is non-standard |
| Single monolithic AI context file | Two-tier (overview + full) | Established pattern 2025 | Fits within AI context windows for most queries; detailed file available when needed |
| No machine-readable registry | JSON registry with types/props | Phase 8 introduces this | Enables structured AI code generation without relying on training data |

**Key standard:** The `llms.txt` specification (anthropic/llmstxt.org) specifies the file lives at the repo root (or domain root for websites), not inside a package subdirectory. The existing `packages/rialto/llms.txt` needs to move.

---

## Open Questions

1. **`mbe new` vs `mbe init` command name**
   - What we know: REQUIREMENTS.md AIDX-04 says "mbe new"; success criteria says "mbe init my-app"; CLAUDE.md documents "mbe init"
   - What's unclear: Which should be primary, which alias
   - Recommendation: Implement `mbe new` as primary, `.alias("init")` for backward compat; update CLAUDE.md to show both

2. **`examples` field in registry.json**
   - What we know: AIDX-01 spec lists "examples" in the registry; auto-generated prop tables are explicitly out of scope; composition examples in `llms.txt` are hand-authored
   - What's unclear: Should `examples` be an empty array, omitted, or should hand-authored examples from `llms.txt` be manually encoded
   - Recommendation: Omit `examples` field from generated registry (leave as extension point); existing `llms-full.txt` already serves this purpose for AI tools

3. **Port auto-detection in `mbe new`**
   - What we know: Ports 3000-3004 are assigned (CLAUDE.md); next should be 3005+
   - What's unclear: Whether to hardcode 3005 as default or scan `vite.config.ts` files dynamically
   - Recommendation: Default to 3005 and accept `--port` override; scanning is fragile across different config formats

---

## Sources

### Primary (HIGH confidence)
- `packages/rialto/scripts/generate-manifest.ts` — TypeScript compiler API pattern, output schema, component extraction logic
- `packages/rialto/llms.txt` — Existing content, current size (26KB), location decision
- `tools/cli/src/commands/agent.ts` — Commander command pattern, CLI conventions
- `tools/cli/package.json` — CLI deps (commander, conf, tsx)
- `apps/hospitality/src/main.tsx` — RialtoProvider + BrowserRouter pattern
- `apps/*/vite.config.ts` — base path convention, port assignments
- `.github/workflows/ci.yml` — CI job structure, step patterns

### Secondary (MEDIUM confidence)
- CF Pages `public/_headers` convention — Content-Type for JSON served automatically; verified by CF Pages documentation behavior for static files
- `git diff --exit-code` pattern — Standard generated-file drift check, same pattern as Prisma migration status check already in this repo

### Tertiary (LOW confidence)
- llms.txt specification placement convention — Based on llmstxt.org standard; recommend root placement

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools already in repo, no new deps
- Architecture: HIGH — all patterns derived from existing code in this repo
- Pitfalls: HIGH — discovered from actual file contents (dist/ gitignore, llms.txt size, port conflicts)

**Research date:** 2026-03-22
**Valid until:** 2026-06-22 (stable; commander, CF Pages static serving, TypeScript compiler API are not fast-moving)
