# Architecture Research

**Domain:** React design system — a11y audit, example pages, component registry, llms.txt, CLI scaffold
**Researched:** 2026-03-22
**Confidence:** HIGH (existing codebase examined directly; patterns confirmed against official sources)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    packages/rialto  (source of truth)                        │
│                                                                               │
│  src/components/                ← 55 component directories                   │
│  src/components/accessibility.test.tsx  ← axe-core suite (EXISTS)            │
│  src/components/components.test.tsx     ← render/prop tests (EXISTS)         │
│  scripts/generate-manifest.ts           ← TypeScript→JSON parser (EXISTS)    │
│  dist/manifest.json                     ← build artifact, consumed downstream│
│  llms.txt                               ← AI reference markdown (EXISTS)     │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │  workspace:*  (build-time dependency)
    ┌──────────▼──────────────────────────────────────────┐
    │           apps/rialto-web  (showcase + examples)     │
    │                                                       │
    │  src/pages/              ← section pages (EXISTS)    │
    │  src/showcase/           ← per-component demos       │
    │  src/pages/examples/     ← NEW: realistic page demos │
    └──────────────────────────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────────────┐
    │         tools/cli  (mbe CLI)                         │
    │                                                       │
    │  src/commands/agent.ts    ← existing commands        │
    │  src/commands/init.ts     ← NEW: rialto scaffold cmd │
    └──────────────────────────────────────────────────────┘
```

**Data flow: registry feeds llms.txt feeds AI tools**

```
packages/rialto/src/components/index.ts
        │
        │  pnpm manifest  (tsx scripts/generate-manifest.ts)
        ▼
  dist/manifest.json     (names, props, types, defaults, char limits)
        │
        ├──▶  llms.txt           (markdown; references manifest for completeness)
        │          │
        │          └──▶  Cursor / Claude / Copilot read llms.txt as context
        │
        └──▶  tools/cli init     (reads manifest to verify rialto is built)
                   │
                   └──▶  new app scaffolded with RialtoProvider wiring
```

---

## Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `packages/rialto/src/components/accessibility.test.tsx` | axe-core WCAG AA checks for all 55 components | EXISTS — coverage gaps to audit |
| `packages/rialto/src/test/setup.ts` | Vitest globals: vitest-axe matchers, jsdom stubs, framer-motion mock | EXISTS — no changes needed |
| `packages/rialto/scripts/generate-manifest.ts` | TypeScript Compiler API → `dist/manifest.json` | EXISTS — extend if more metadata needed |
| `packages/rialto/dist/manifest.json` | Structured component catalog (names, props, types, char limits) | BUILD ARTIFACT |
| `packages/rialto/llms.txt` | AI-readable markdown: catalog, tokens, patterns, common mistakes | EXISTS — gaps to fill |
| `apps/rialto-web/src/pages/` | Section showcase pages (forms, overlays, navigation, etc.) | EXISTS |
| `apps/rialto-web/src/pages/examples/` | NEW: realistic full-page demos (dashboard, settings, data table) | TO BUILD |
| `tools/cli/src/commands/init.ts` | NEW: `mbe init` scaffold command for new Rialto apps in monorepo | TO BUILD |

---

## Recommended Monorepo Layout (new vs. modified)

```
mattbutlerengineering/
├── packages/
│   └── rialto/
│       ├── src/
│       │   └── components/
│       │       └── accessibility.test.tsx     # MODIFY: audit + fix each component
│       ├── scripts/
│       │   └── generate-manifest.ts           # MODIFY: extend prop metadata if needed
│       └── llms.txt                           # MODIFY: expand with example patterns
│
├── apps/
│   └── rialto-web/
│       └── src/
│           ├── routes.tsx                     # MODIFY: add example routes
│           └── pages/
│               └── examples/                  # NEW directory
│                   ├── DashboardPage.tsx       # NEW: metrics + table + sidebar layout
│                   ├── SettingsPage.tsx        # NEW: forms + toggles + sections
│                   ├── DataTablePage.tsx       # NEW: Table + Pagination + filters
│                   └── OnboardingPage.tsx      # NEW: Steps + multi-step form
│
└── tools/
    └── cli/
        └── src/
            └── commands/
                └── init.ts                    # NEW: mbe init <name> scaffold command
```

### Structure Rationale

- **`accessibility.test.tsx` (modify, not new):** The axe-core infrastructure already exists (`vitest-axe`, `setup.ts`, canvas stub, framer-motion mock). Work here is audit-driven — run the suite, fix violations in component source, extend test fixtures for missing states (error, disabled, open overlays). No new test infrastructure is required.

- **`apps/rialto-web/src/pages/examples/` (new subdirectory):** Example pages live in the showcase app, not in the library. They consume Rialto components the same way real apps do — this is intentional and provides living proof that the components compose correctly. They serve two purposes: visual reference for developers and composition examples in `llms.txt` for AI context.

- **`packages/rialto/llms.txt` (modify in-place):** The file already exists and covers component catalog, tokens, motion, and common mistakes. Gaps: no realistic multi-component composition pages, no error state examples, no links to the new example pages, no coverage of the `vibe` prop patterns. These are additive changes, not restructuring.

- **`tools/cli/src/commands/init.ts` (new file):** CLI commands follow an established pattern (`users.ts`, `agent.ts`, `login.ts`). A new `init.ts` command reads `@mbe/rialto/manifest` at scaffold time to verify the package is built, then generates a new app skeleton following CLAUDE.md conventions: `base: "/<name>/"` in vite config, `RialtoProvider` in `main.tsx`, assigned dev port.

---

## Architectural Patterns

### Pattern 1: Single-File Axe Suite

**What:** All axe-core accessibility tests live in one file (`accessibility.test.tsx`) rather than co-located per component. One `describe` block, one `it()` per component state.

**When to use:** When the test shape is always identical (`render → axe → toHaveNoViolations`) and only the fixture varies. Co-locating would scatter identical boilerplate across 55 directories.

**Trade-offs:** The file grows long (~600 lines at full coverage) but is easy to scan. Coverage gaps are immediately visible — if a component is not listed, it has no a11y test. This pattern is already established in the codebase; stay consistent with it.

**Example:**
```typescript
it("Input", async () => {
  const { container } = render(
    <Input label="Email address" type="email" hint="We will never share your email" />
  );
  expect(await axe(container)).toHaveNoViolations();
});

// Error state — separate it() because aria-invalid changes axe rule set
it("Input — error state", async () => {
  const { container } = render(
    <Input label="Email address" error="Please enter a valid email" />
  );
  expect(await axe(container)).toHaveNoViolations();
});
```

### Pattern 2: Build-Time Manifest, Static llms.txt

**What:** `manifest.json` is generated at build time from TypeScript source via the Compiler API. `llms.txt` is a static markdown file committed to the repo, manually authored and updated.

**When to use:** Always. The manifest provides prop exhaustiveness that prose cannot; llms.txt provides narrative, decision rationale, and composition guidance that TypeScript types cannot express.

**Trade-offs:** Two artifacts require manual sync discipline. Mitigation: a lightweight lint script that verifies every component in `manifest.json` has a row in `llms.txt`. This is a ~20-line check.

**Do not generate llms.txt from manifest.json.** Generated llms.txt files contain only type information — they lack the "which overlay?", "common mistakes", and composition examples that make llms.txt useful for AI context.

**Data flow:**
```
dist/manifest.json  →  machine-structured: { name, props[], characterLimits[] }
llms.txt            →  human+AI narrative: decision guides, composition patterns, mistakes
AI tool             →  reads llms.txt as context; uses it to produce correct component usage
```

### Pattern 3: Registry-Informed CLI Scaffold

**What:** The `mbe init` command does not embed hardcoded component lists. It reads `@mbe/rialto/manifest` at scaffold time to verify the package is built, then generates a minimal app skeleton.

**When to use:** Always. Embedding component lists in the CLI creates drift. The manifest is the single source of truth for what components exist.

**Trade-offs:** Requires `dist/manifest.json` to exist (rialto must be built before scaffolding). In the monorepo this is a Turborepo dependency, not a manual concern.

**What the scaffold produces:**
```
apps/<name>/
├── src/
│   ├── main.tsx       (RialtoProvider + import "@mbe/rialto/styles")
│   └── App.tsx        (minimal shell with placeholder)
├── package.json       (name: "@mbe/<name>", vite, react deps)
└── vite.config.ts     (base: "/<name>/", port: <chosen>)
```

**Example sketch:**
```typescript
// tools/cli/src/commands/init.ts
import manifest from "@mbe/rialto/manifest";

export async function init(name: string, port: number) {
  // verifying manifest resolves confirms rialto is built
  const componentCount = manifest.components.length;
  console.log(`Scaffolding app with ${componentCount} components available`);
  await scaffoldApp(name, port);
}
```

---

## Data Flow

### A11y Audit Flow

```
Developer runs: pnpm test (from packages/rialto or monorepo root)
    │
    ▼
Vitest picks up accessibility.test.tsx
    │
    ▼
Each it() renders component fixture in jsdom
    │
    ▼
axe(container) scans rendered DOM with WCAG 2.1 AA ruleset
    │
    ├─ PASS → next test
    └─ FAIL → violation: { id, impact, description, nodes[] }
                  │
                  └─ Fix in component: add aria-label, fix contrast token,
                     add role attribute, correct heading hierarchy, etc.
```

### Registry → AI Tool Flow

```
pnpm build (packages/rialto)
    │
    ├─ Vite lib build → dist/lib/rialto.js, dist/lib/styles.css
    └─ pnpm manifest → dist/manifest.json
            │
            └─ llms.txt references manifest: "Run pnpm manifest to get full prop catalog"
                    │
                    └─ AI IDE (Cursor/Claude/Copilot) reads llms.txt as context window
                            │
                            └─ Generates code using correct component names, props,
                               composition patterns, and character limit constraints
```

### CLI Scaffold Flow

```
Developer runs: mbe init my-feature-app
    │
    ▼
tools/cli resolves @mbe/rialto/manifest (fails fast if not built)
    │
    ▼
Prompts: confirm app name, port (default: next available from 3005+)
    │
    ▼
Writes: apps/my-feature-app/
    ├── src/main.tsx       (RialtoProvider + style import)
    ├── src/App.tsx        (shell)
    └── vite.config.ts     (base: "/my-feature-app/", server.port: <chosen>)
    │
    ▼
Prints: "Add to Turborepo pipeline and edge-router.js manually"
```

---

## Integration Points

### A11y Suite ↔ Existing Test Infrastructure

| Integration | Mechanism | Notes |
|-------------|-----------|-------|
| `vitest-axe` matchers | `src/test/setup.ts` already calls `expect.extend(matchers)` | No new setup needed |
| jsdom canvas stub | `setup.ts` stubs `getContext` — axe uses canvas for contrast checks | No change needed |
| framer-motion mock | `setup.ts` mocks `useReducedMotion` → `true` | Prevents animation interference during axe scan |
| CI pipeline | `pnpm test` in Turborepo pipeline for `@mbe/rialto` | Already wired; no new CI config needed |

### manifest.json ↔ Build Pipeline

| Integration | Mechanism | Notes |
|-------------|-----------|-------|
| Generation trigger | `package.json` `"build"` script: `vite build … && pnpm manifest` | Manifest always generated after JS bundle |
| Turborepo cache | `dist/manifest.json` is a build output — cached per source hash | No change needed |
| CLI consumption | `import manifest from "@mbe/rialto/manifest"` via `"./manifest": "./dist/manifest.json"` export | Requires rialto to be built first; Turborepo dependency handles ordering |
| llms.txt sync | Manual — add lint script to verify all `manifest.json` components appear in `llms.txt` | Lightweight check, not a blocking build step |

### llms.txt ↔ Example Pages

| Integration | Mechanism | Notes |
|-------------|-----------|-------|
| Link from llms.txt | Add `## Example Pages` section linking to rialto-web routes | Static links — no build step |
| Consistency | Example pages must use the same composition patterns documented in llms.txt | Manual discipline; examples are the canonical source for AI composition guidance |
| AI consumption | AI tools fetch llms.txt and use example code as few-shot demonstrations | The richer the examples, the better the AI output quality |

### CLI ↔ Monorepo Conventions

| Integration | Mechanism | Notes |
|-------------|-----------|-------|
| Port assignment | CLAUDE.md documents ports 3000–3004; CLI assigns 3005+ or prompts | No magic; convention enforced via prompt/docs |
| Path prefix | CLI writes `base: "/<name>/"` to `vite.config.ts` per CLAUDE.md convention | New app is immediately routable with edge-router wiring |
| Turborepo pipeline | New apps auto-discovered via pnpm workspace glob `apps/*` | New `package.json` with `"name": "@mbe/<name>"` is all that's required |
| Edge router | CLI does NOT modify `infrastructure/worker/edge-router.js` — prints instructions instead | Avoids CLI touching infrastructure files; developer adds route manually |

---

## Build Order (Dependency Graph)

```
Phase 1: A11y fixes
  packages/rialto/src/components/**  (fix violations in component source)
      ↓ depends on nothing
  pnpm test  (passes green) → CI gate

Phase 2: Example pages
  apps/rialto-web/src/pages/examples/**  (new page components)
  apps/rialto-web/src/routes.tsx         (add example routes)
      ↓ depends on Phase 1 (examples use fixed, correct components)
  pnpm build --filter=@mbe/rialto-web  (verifies examples build)

Phase 3: llms.txt expansion
  packages/rialto/llms.txt  (add example patterns, link to new pages)
      ↓ depends on Phase 2 (links to example page routes that now exist)
  (no build step — static file committed to repo)

Phase 4: CLI scaffold
  tools/cli/src/commands/init.ts
      ↓ depends on packages/rialto build (reads dist/manifest.json)
  pnpm build --filter=@mbe/cli  (verifies command compiles)
```

**Why this order:**
- A11y first: example pages are meant to demonstrate correct, accessible patterns — components must pass axe before they appear in canonical examples
- Examples before llms.txt: llms.txt links to example page routes; routes must exist before links are added
- llms.txt before CLI: the scaffold produces apps that import from Rialto; llms.txt is what AI tools read to understand that scaffold — they are better paired when llms.txt reflects the full component surface
- `dist/manifest.json` is produced by the Phase 1 build; the CLI in Phase 4 inherits it automatically via Turborepo

---

## Anti-Patterns

### Anti-Pattern 1: Co-locating Axe Tests Per Component

**What people do:** Add `ComponentName.a11y.test.tsx` inside each component directory alongside `ComponentName.tsx`.

**Why it's wrong:** Identical boilerplate scattered across 55 directories. Gap detection requires grepping rather than scanning one file. The single-file pattern already established in this codebase (`accessibility.test.tsx`) is correct — stay consistent with it.

**Do this instead:** Keep one `accessibility.test.tsx`. Add separate `it()` per meaningful state variant (error, disabled, open) only when those states have distinct ARIA semantics that axe checks differently.

### Anti-Pattern 2: Generating llms.txt from manifest.json

**What people do:** Script that renders `manifest.json` → `llms.txt` as a build step, treating llms.txt as a generated artifact.

**Why it's wrong:** The manifest contains types and prop shapes. It cannot generate the decision guidance ("which overlay?"), composition examples, common mistakes, or token rationale that makes llms.txt useful for AI context. Generated llms.txt files produce worse AI output than hand-authored ones because they lack narrative.

**Do this instead:** Hand-author `llms.txt`. Use the manifest as a cross-check: a lint script flags components present in `manifest.json` but absent from `llms.txt`. Keep the two artifacts in deliberate sync.

### Anti-Pattern 3: CLI Scaffold as a Separate Package

**What people do:** Create `packages/create-rialto-app` as a standalone NPM-publishable package mirroring `create-react-app`.

**Why it's wrong:** The monorepo convention is `tools/cli` with `mbe` as the unified command (`mbe agent`, `mbe users`). A second CLI binary adds friction and breaks the convention. CLAUDE.md says npm publishing is out of scope.

**Do this instead:** Add `init.ts` to `tools/cli/src/commands/` following the existing command pattern. The command is `mbe init <name>`, consistent with the established CLI interface.

### Anti-Pattern 4: Hosting llms.txt as a Vite Route

**What people do:** Serve `llms.txt` as a dynamic route in the rialto-web SPA at `/rialto/llms.txt`.

**Why it's wrong:** The llms.txt spec (llmstxt.org) requires the file at `/llms.txt` at the root. An SPA route returns HTML (the app shell), not plain text. AI tools that fetch `llms.txt` by URL will receive unusable HTML.

**Do this instead:** `llms.txt` stays as a committed file in `packages/rialto/`. AI tools in the monorepo (Cursor, Claude Code) read it directly via the file system. For public hosting (a future milestone), serve it as a static file from the Cloudflare edge, not from the SPA.

### Anti-Pattern 5: Axe Tests on Empty or Trivial Fixtures

**What people do:** Write `render(<Button />)` without required props, or render components in states that never appear in real use.

**Why it's wrong:** axe-core finds violations in content that doesn't reflect real usage (e.g., an `<input>` with no label because the label prop was omitted). False positives obscure real issues; trivial fixtures miss real ones.

**Do this instead:** Render each component with realistic, representative props — the same props you would use in a real application. Test error states separately. Consult `llms.txt` character limits and `manifest.json` prop descriptions to build accurate fixtures.

---

## Scaling Considerations

This is an internal design system in a personal engineering portfolio. Scaling is not a concern for this milestone. The architecture is sized correctly for the problem.

| Scale | Architecture |
|-------|-------------|
| Current (1 developer, 3 apps, 55 components) | Single `accessibility.test.tsx`, static `llms.txt`, `dist/manifest.json` via build script |
| If npm-published (future) | llms.txt moves to a public URL; manifest becomes a versioned API; CLI gains `npx @mbe/create-rialto-app` entrypoint alongside `mbe init` |

---

## Sources

- Existing codebase: `packages/rialto/src/test/setup.ts`, `accessibility.test.tsx`, `scripts/generate-manifest.ts`, `llms.txt`, `package.json` — examined directly (HIGH confidence)
- [vitest-axe API reference — toHaveNoViolations matcher](https://deepwiki.com/chaance/vitest-axe/3.3-tohavenoviolations-matcher) (MEDIUM confidence)
- [llms.txt specification — file format, root path requirement](https://llmstxt.org/) (HIGH confidence)
- [shadcn component registry JSON schema](https://ui.shadcn.com/docs/registry/registry-json) — monorepo CLI integration pattern reference (MEDIUM confidence — more complex than needed; used as reference only)
- [Nord Design System llms.txt](https://nordhealth.design/ai/llms-txt/) — production design system llms.txt structure reference (MEDIUM confidence)
- [axe-core React testing guide](https://oneuptime.com/blog/post/2026-01-15-test-react-accessibility-axe-core/view) — render → axe → assert pattern (MEDIUM confidence, consistent with existing codebase)
- [Supercharge your design system with LLMs and Storybook MCP](https://tympanus.net/codrops/2025/12/09/supercharge-your-design-system-with-llms-and-storybook-mcp/) — component manifest + AI context pattern (MEDIUM confidence)

---

*Architecture research for: Rialto a11y, examples, and AI DX (v1.1 milestone)*
*Researched: 2026-03-22*
