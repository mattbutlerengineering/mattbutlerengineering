# Monorepo Tooling Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Package manager** | pnpm 9.15.4 with workspaces |
| **Build orchestrator** | Turborepo ^2.3.3 (latest: 2.8.10) |
| **Version management** | Changesets (`@changesets/cli` ^2.29.8), not automated in CI |
| **Remote cache** | None (local `.turbo/` only, 2.2 MB) |
| **Workspace packages** | 14 (3 apps, 2 services, 6 packages, 1 tool, 1 infrastructure) |
| **Workspace paths** | `apps/*`, `services/*`, `packages/*`, `tools/*`, `infrastructure/pulumi` |
| **Package prefix** | `@mbe/` |
| **Module system** | ES modules (`"type": "module"`) |
| **Lockfile** | 12,961 lines |
| **node_modules** | 611 MB |
| **CI setup** | pnpm install + prisma generate repeated in all 4 CI jobs, no artifact sharing |
| **Pre-commit hooks** | None |
| **Monthly cost** | $0 |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  pnpm workspaces (pnpm-workspace.yaml)                             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Turborepo (turbo.json) — task graph, local caching           │  │
│  │                                                               │  │
│  │  @mbe/config ◄── @mbe/types ◄── @mbe/auth                    │  │
│  │       ▲               ▲              ▲                        │  │
│  │       │               │              │                        │  │
│  │  @mbe/ui    @mbe/api-client   @mbe/rialto                    │  │
│  │       ▲          ▲                   ▲                        │  │
│  │       │          │                   │                        │  │
│  │  @mbe/shared-layout              @mbe/rialto-web              │  │
│  │       ▲                                                       │  │
│  │       │                                                       │  │
│  │  @mbe/hospitality @mbe/marketing   @mbe/users-service              │  │
│  │                               @mbe/reservations-service       │  │
│  │                               @mbe/cli                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Changesets (.changeset/) — version management (manual, not in CI)  │
└─────────────────────────────────────────────────────────────────────┘
```

### What's Working Well

- **pnpm workspaces** — fast installs, disk-efficient, strict dependency resolution (no phantom dependencies), workspace protocol (`workspace:*`) for internal packages
- **Turborepo task graph** — correct dependency ordering (`^build` for topological, `build` for same-package), parallel execution, local caching for repeated builds
- **Clean package boundaries** — `@mbe/config` as the root dependency, clear layering (config → types → auth → services/apps)
- **Simple configuration** — `turbo.json` is 33 lines; easy to understand and maintain
- **Zero cost** — no paid services

### Pain Points

- **No remote cache** — every CI run rebuilds all 14 packages from scratch. Build + test + lint-typecheck jobs each independently install dependencies and generate Prisma client. No cache sharing between CI runs or between CI and local development.
- **Turborepo outdated** — running ^2.3.3, now 5 minor versions behind (2.8.10). Missing: Boundaries, composable configuration, devtools visualization, git worktree cache sharing, agent skills.
- **Changesets not automated** — `changeset` and `release` scripts exist but no CI workflow creates release PRs or publishes versions. Version management is entirely manual.
- **No pre-commit hooks** — lint/typecheck errors caught only in CI, not at commit time. Developer feedback loop is slow.
- **Redundant CI setup** — `pnpm install --frozen-lockfile` + `pnpm --filter @mbe/users-service db:generate` runs in every CI job (lint-typecheck, build, test, migrations). No shared setup step or artifact caching.
- **No pnpm catalogs** — dependency versions are duplicated across package.json files. Updating a shared dependency (e.g., React) requires editing multiple files.
- **No Turborepo Boundaries** — no enforced architectural constraints. Package dependencies are convention-based, not validated.

---

## Evaluation Criteria

| Criterion | Why It Matters |
|-----------|---------------|
| **Setup simplicity** | Solo developer; minimal configuration overhead is essential |
| **Build speed** | Fast CI feedback loop; Turborepo local cache helps locally but CI starts cold |
| **Remote caching** | The single biggest CI optimization opportunity for this project |
| **Dependency management** | Strict resolution, no phantom deps, efficient disk usage |
| **Task orchestration** | Dependency-aware parallel execution across 14 packages |
| **Architectural enforcement** | As the monorepo grows, preventing circular deps and wrong-layer imports |
| **Version management** | Publish @mbe/rialto to npm; manage internal package versions |
| **Ecosystem fit** | TypeScript, Vite, Fastify, Prisma, React — must integrate cleanly |
| **Pricing** | Solo developer; $0 is the target |
| **Migration cost** | From current pnpm + Turborepo + Changesets stack |

---

## Component Evaluations

This evaluation covers three distinct layers of monorepo tooling:

1. **Package Manager** — dependency installation and workspace management
2. **Build Orchestrator** — task running, caching, and dependency graph
3. **Version Management** — changelogs, version bumps, and publishing

---

## Layer 1: Package Manager

### 1. pnpm (Current)

The fastest, most disk-efficient, and most monorepo-capable package manager. Industry standard for TypeScript monorepos in 2026.

| Criterion | Details |
|-----------|---------|
| **Version** | 9.15.4 (current in project); latest 9.x stable |
| **Install speed** | Fastest overall; content-addressable store avoids re-downloading |
| **Disk efficiency** | Hard links from global store; up to 70-80% savings vs npm |
| **Workspace support** | Best-in-class; `workspace:*` protocol, `--filter`, scoped commands |
| **Strict deps** | No phantom dependencies; each package sees only its declared deps |
| **Catalogs** | `catalog:` protocol for shared dependency versions (pnpm 9.5+) |
| **Lockfile** | `pnpm-lock.yaml`; deterministic, format stable |
| **Publishing** | `pnpm publish --filter`; workspace protocol handled correctly |
| **Turborepo** | First-class support; official `pnpm/action-setup` GitHub Action |
| **License** | MIT |

**Key strength:** Strict dependency resolution prevents "works on my machine" issues. The content-addressable store means installing across 14 packages is fast even without cache — packages are hard-linked from a global store, not copied.

**Recent feature — Catalogs (pnpm 9.5+):** Define dependency versions once in `pnpm-workspace.yaml`, reference them with `catalog:` in package.json files. Reduces merge conflicts and ensures version consistency across the monorepo. This project doesn't use catalogs yet — it's a low-effort improvement.

---

### 2. npm

Node's built-in package manager. npm 10+ supports workspaces.

| Criterion | Details |
|-----------|---------|
| **Install speed** | Slowest of the four; improved in v10 but still behind pnpm/yarn |
| **Disk efficiency** | Flat node_modules; no deduplication across workspaces |
| **Workspace support** | Basic; `--workspace` flag, `--workspaces` for all |
| **Strict deps** | No; hoisted flat structure allows phantom dependencies |
| **Lockfile** | `package-lock.json`; larger, more merge conflicts |
| **License** | Artistic License 2.0 |

**Elimination reason:** Slower installs, no strict dependency resolution, larger disk footprint. npm workspaces are functional but less ergonomic than pnpm's `--filter` and workspace protocol. No compelling reason to switch from pnpm.

---

### 3. Yarn Berry (v4+)

Yarn's modern implementation with Plug'n'Play (PnP), zero-installs, and constraints.

| Criterion | Details |
|-----------|---------|
| **Install speed** | Fast; PnP mode eliminates node_modules entirely |
| **Disk efficiency** | Best with PnP + zero-installs (commit .yarn/cache to git) |
| **Workspace support** | Most mature; constraints engine for dependency rules |
| **Strict deps** | Yes with PnP; strict module resolution |
| **Catalogs** | Supported in Turborepo 2.7+ (Yarn 4 catalogs) |
| **Lockfile** | `yarn.lock`; stable format |
| **License** | BSD 2-Clause |

**Key strength:** Constraints engine allows defining rules like "all packages must use the same React version" — enforced at install time. Zero-installs (committing the dependency cache) eliminates `yarn install` in CI entirely.

**Key weakness for this project:** PnP breaks some tools that assume `node_modules` exists. Prisma, Vite plugins, and some ESLint configurations need PnP-specific configuration. The migration from pnpm to Yarn Berry is non-trivial (lockfile conversion, PnP compatibility testing). For 14 packages, the marginal benefit over pnpm doesn't justify the migration effort.

---

### 4. Bun

JavaScript runtime with built-in package manager. Fastest raw install speed.

| Criterion | Details |
|-----------|---------|
| **Install speed** | Fastest raw install; Zig-based implementation |
| **Disk efficiency** | Standard node_modules; no content-addressable store |
| **Workspace support** | Basic; `--filter` added in 2025, still catching up |
| **Publishing** | `bun publish --filter` not yet supported (open issue) |
| **Turborepo** | Supported but less tested than pnpm/yarn |
| **License** | MIT |

**Elimination reason:** Workspace publishing not supported. `--filter` support is immature compared to pnpm. Some pnpm-specific features (catalogs, workspace protocol, strict deps) have no Bun equivalent. Not ready for a 14-package monorepo that publishes @mbe/rialto to npm.

---

### Package Manager Verdict

**Stay on pnpm.** It's the best monorepo package manager in 2026 — fastest installs, strictest dependency resolution, most ergonomic workspace support, and universal ecosystem compatibility. No migration needed.

**One improvement to adopt:** pnpm catalogs. Define shared dependency versions in `pnpm-workspace.yaml`, reference with `catalog:` in package.json files. Reduces version drift and merge conflicts.

---

## Layer 2: Build Orchestrator

### 1. Turborepo (Current)

Task runner optimized for JavaScript/TypeScript monorepos. Written in Rust. Owned by Vercel.

| Criterion | Details |
|-----------|---------|
| **Version** | ^2.3.3 (project); 2.8.10 (latest, January 2026) |
| **Configuration** | `turbo.json` — 33 lines in this project |
| **Task graph** | Dependency-aware topological ordering; `dependsOn: ["^build"]` |
| **Local cache** | `.turbo/` directory; hash-based; 2.2 MB in this project |
| **Remote cache** | Vercel Remote Cache (free) or self-hosted |
| **Language** | Rust (migrated from Go in 2023-2024) |
| **Boundaries** | Experimental (2.4+); tag-based architectural constraints |
| **Devtools** | Visual package/task graph explorer (2.7+) |
| **Composable config** | Extend package configurations from shared snippets (2.7+) |
| **Git worktree support** | Cache sharing across worktrees (2.8+) |
| **Pricing** | Free (MIT license); remote cache free via Vercel |
| **Setup effort** | Added in minutes; works with existing pnpm workspace |
| **Owner** | Vercel (well-funded, strategic product) |

**Key strength for this project:** Already integrated, working, and simple. 33 lines of `turbo.json` handles all 14 packages correctly. The upgrade from 2.3 to 2.8 is non-breaking and unlocks Boundaries, devtools, composable config, and worktree support.

**Key weakness:** Turborepo is a task runner, not a build system. It doesn't help with code generation, project scaffolding, or architectural governance beyond basic Boundaries. For a solo developer with 14 packages, this is fine — you don't need scaffolding generators for a project you fully understand.

**Remote cache (the big win):** Vercel Remote Cache is free for all plans, even without hosting on Vercel. Adding it requires:
1. `npx turbo login`
2. `npx turbo link`
3. Add `TURBO_TOKEN` and `TURBO_TEAM` secrets to GitHub Actions

This single change would eliminate redundant builds in CI — if a package hasn't changed since the last run, the cached output is downloaded instead of rebuilt. For 14 packages where typically only 1-2 change per PR, this is a significant speedup.

---

### 2. Nx

Build intelligence platform. Task runner + generators + graph visualization + CI distribution.

| Criterion | Details |
|-----------|---------|
| **Version** | 21.x (latest, 2026) |
| **Configuration** | `nx.json` + `project.json` per package (or inferred from `package.json`) |
| **Task graph** | Dependency-aware; more sophisticated analysis than Turborepo |
| **Local cache** | `.nx/cache/`; hash-based |
| **Remote cache** | Nx Cloud (free for ≤5 active contributors); self-hosted also free |
| **Language** | Migrating core from TypeScript to Rust (2025 initiative) |
| **Module boundaries** | Mature; ESLint rule-based enforcement with `@nx/enforce-module-boundaries` |
| **Generators** | Built-in code scaffolding for React, Node, etc. |
| **Graph visualization** | `nx graph` — interactive dependency visualizer |
| **Affected commands** | `nx affected` — run only tasks affected by changes |
| **Pricing** | Free (MIT); Nx Cloud: free ≤5 contributors, $19/contributor after |
| **Setup effort** | 1-4 hours for existing project; more opinionated structure |
| **Owner** | Nrwl/Nx (VC-funded, Nx Cloud is the business model) |

**Key strength:** Most comprehensive monorepo tooling. Module boundary enforcement is mature and battle-tested. `nx affected` is more sophisticated than Turborepo's cache-based approach. Generators reduce boilerplate when creating new packages.

**Key weakness for this project:** Complexity overhead for 14 packages and 1 developer. Benchmarks show Nx is 3x slower than Turborepo on small projects (2-5 packages). Setup takes 1-4 hours vs minutes for Turborepo. Configuration is more verbose (~200 lines vs 33). The features that justify Nx (boundary enforcement, generators, graph visualization) are team-productivity tools — less valuable for a solo developer who knows the entire codebase.

**Migration cost:** The Nx team documents a migration from Turborepo — typically 4-8 hours for a project this size. But the question is: what problem does migration solve that upgrading Turborepo from 2.3 to 2.8 doesn't?

---

### 3. Lerna (Nx-maintained)

The original monorepo tool, now maintained by the Nx team. Lerna 9 (September 2025) removed legacy package management, focusing on versioning/publishing + Nx-powered task running.

| Criterion | Details |
|-----------|---------|
| **Version** | 9.0.4 (February 2026) |
| **Task graph** | Delegated to Nx under the hood |
| **Versioning** | Built-in `lerna version` and `lerna publish` |
| **Publishing** | Best-in-class multi-package npm publishing |
| **Pricing** | Free (MIT); Nx Cloud for remote cache |
| **Owner** | Nx team |

**Key strength:** Package publishing workflow. `lerna version` + `lerna publish` handles cross-package dependency updates, changelog generation, and npm publishing in one command.

**Elimination reason for task running:** Lerna's task execution is just Nx. If you want Nx's task runner, use Nx directly. If you want simplicity, use Turborepo. Lerna's value is in publishing — but Changesets already handles that for this project, and Lerna adds Nx as an implicit dependency.

---

### Build Orchestrator Verdict

**Stay on Turborepo. Upgrade from ^2.3.3 to ^2.8.** The upgrade is non-breaking and unlocks:

| Feature | Value |
|---------|-------|
| Boundaries (experimental) | Architectural constraint enforcement |
| Devtools visualization | Visual package/task graph |
| Composable config | Share turbo.json snippets |
| Git worktree cache sharing | Cache works across Claude Code worktrees |
| Agent skill | Better AI coding assistant integration |

**Enable Vercel Remote Cache.** This is the single highest-impact change for CI performance — free, 10-minute setup, eliminates redundant rebuilds.

**When to reconsider Nx:** If the team grows to 5+ developers, or the monorepo grows to 30+ packages, re-evaluate. Nx's module boundary enforcement and generators become valuable at that scale. At 14 packages and 1 developer, Turborepo's simplicity is the right trade-off.

---

## Layer 3: Version Management

### 1. Changesets (Current)

Monorepo-first version management. Decouples version decisions from commits. Used by React, Astro, Remix, and many open-source monorepos.

| Criterion | Details |
|-----------|---------|
| **Workflow** | Developer creates `.changeset/*.md` describing change; `changeset version` bumps versions; `changeset publish` releases |
| **Monorepo support** | Excellent; handles cross-package dependencies, linked/fixed version groups |
| **Changelog** | Auto-generated from changeset descriptions; supports GitHub-linked changelogs |
| **CI automation** | `@changesets/action` GitHub Action creates "Version Packages" PRs |
| **Commit coupling** | None — version decisions are separate from commits |
| **This project** | Configured (`access: "public"`, GitHub changelog) but not automated in CI |
| **License** | MIT (Atlassian) |

**Key strength:** Explicit version intent. The developer decides whether a change is a patch, minor, or major when creating the changeset, not based on commit message parsing. This is more accurate for library versioning (relevant for @mbe/rialto which is published to npm).

**Key weakness:** Not automated in CI for this project. The `changeset` and `release` scripts exist but there's no GitHub Action workflow to create release PRs or publish to npm. This is a configuration gap, not a tool problem.

---

### 2. semantic-release

Fully automated versioning based on commit message conventions (Conventional Commits). The most hands-off approach.

| Criterion | Details |
|-----------|---------|
| **Workflow** | Commit message format determines version bump; CI handles everything automatically |
| **Monorepo support** | Poor; git tag conflicts, no native multi-package support |
| **Changelog** | Auto-generated from commits |
| **Commit coupling** | Tight — commit messages drive versioning |
| **License** | MIT |

**Elimination reason:** Not designed for monorepos with multiple independently-versioned packages. Would require complex multi-package configuration for 14 packages with independent version histories. Changesets is purpose-built for this use case.

---

### 3. release-please (Google)

Automated release PRs based on Conventional Commits. Middle ground between Changesets and semantic-release.

| Criterion | Details |
|-----------|---------|
| **Workflow** | Conventional Commits parsed automatically; creates release PRs |
| **Monorepo support** | Supported via `release-please-config.json`; handles multiple packages |
| **Changelog** | Auto-generated from commits |
| **Commit coupling** | Moderate — relies on commit messages but batches into release PRs |
| **License** | Apache 2.0 (Google) |

**Trade-off vs Changesets:** release-please requires strict Conventional Commit discipline (every commit message must follow the format). Changesets allow you to describe the change in natural language at any point. For a solo developer, either works — but this project already uses Changesets and there's no compelling reason to switch.

---

### Version Management Verdict

**Stay on Changesets. Automate it in CI.**

The tool is already configured. The gap is CI automation. Adding the `@changesets/action` GitHub Action workflow would:
1. Automatically create "Version Packages" PRs when changesets are merged
2. Publish to npm when the version PR is merged
3. Generate GitHub-linked changelogs

This is a 30-minute CI configuration task, not a tool change.

---

## Comparison Tables

### Build Orchestrator Scoring

| Criterion | Turborepo | Nx | Lerna |
|-----------|-----------|-----|-------|
| **Setup simplicity** | 10/10 | 6/10 | 7/10 |
| **Build speed (14 pkgs)** | 9/10 | 7/10 | 7/10 (Nx under hood) |
| **Remote cache** | 10/10 (free) | 8/10 (free ≤5) | 8/10 (Nx Cloud) |
| **Boundary enforcement** | 6/10 (experimental) | 10/10 (mature) | N/A |
| **Code generators** | 0/10 | 9/10 | 0/10 |
| **Graph visualization** | 7/10 (devtools, 2.7+) | 10/10 | N/A |
| **Configuration burden** | 10/10 (33 lines) | 6/10 (~200 lines) | 7/10 |
| **Ecosystem compatibility** | 10/10 | 8/10 | 9/10 |
| **Solo developer fit** | 10/10 | 5/10 | 6/10 |
| **Pricing** | 10/10 ($0) | 9/10 ($0 for ≤5) | 9/10 |
| **Weighted total** | **8.6** | **7.4** | **6.6** |

### Package Manager Scoring

| Criterion | pnpm | Yarn Berry | npm | Bun |
|-----------|------|-----------|-----|-----|
| **Install speed** | 9/10 | 8/10 | 6/10 | 10/10 |
| **Disk efficiency** | 9/10 | 10/10 (PnP) | 5/10 | 6/10 |
| **Workspace ergonomics** | 10/10 | 9/10 | 6/10 | 6/10 |
| **Strict deps** | 10/10 | 9/10 (PnP) | 3/10 | 5/10 |
| **Ecosystem compatibility** | 10/10 | 7/10 (PnP issues) | 10/10 | 8/10 |
| **Publishing** | 9/10 | 9/10 | 9/10 | 4/10 |
| **Turborepo support** | 10/10 | 9/10 | 10/10 | 7/10 |
| **Solo developer fit** | 10/10 | 7/10 | 8/10 | 6/10 |
| **Weighted total** | **9.6** | **8.4** | **7.1** | **6.4** |

---

## Eliminated Options

| Tool | Elimination Reason |
|------|-------------------|
| **npm workspaces** | Slower installs, no strict deps, no catalogs. pnpm is strictly better for monorepos. |
| **Bun** | Workspace publishing not supported. Immature `--filter`. Not ready for 14-package monorepo. |
| **Nx** | Overkill for 14 packages / 1 developer. 3x slower on small projects. Configuration overhead not justified. Re-evaluate at 30+ packages or 5+ developers. |
| **Lerna** | Task running is just Nx. Publishing handled by Changesets. No unique value for this project. |
| **Bazel** | Google's polyglot build system. Extreme complexity for JavaScript monorepos. Designed for 1000+ package repos. |
| **Rush** | Microsoft's monorepo tool. Opinionated setup, less ecosystem support than pnpm + Turborepo. |
| **semantic-release** | Not designed for monorepos with independent package versions. |
| **Moon** | Rust-based monorepo tool. Emerging but small community. Not enough ecosystem support yet. |

---

## Recommended Actions

### #1 Enable Vercel Remote Cache (Highest Impact)

**This is the single most impactful change — and it's free.**

| Dimension | Details |
|-----------|---------|
| **Effort** | 10 minutes |
| **Cost** | $0 (free for all Vercel plans, even without hosting on Vercel) |
| **Impact** | CI builds skip unchanged packages; only modified packages rebuild |
| **Cache expiry** | 7 days (automatic) |

**Setup:**
```bash
# Local: link repo to Vercel Remote Cache
npx turbo login
npx turbo link

# CI: add secrets to GitHub Actions
# TURBO_TOKEN — from Vercel dashboard
# TURBO_TEAM — your Vercel team slug
```

**Expected CI improvement:** For a typical PR that changes 1-2 packages out of 14, the build/test/lint jobs would cache ~85% of tasks. Install + Prisma generate still runs, but the heavy work (tsc, vite build, vitest) is cached.

### #2 Upgrade Turborepo to ^2.8

| Dimension | Details |
|-----------|---------|
| **Effort** | 5 minutes (`pnpm update turbo`) |
| **Breaking changes** | None (2.3 → 2.8 is non-breaking) |
| **Unlocks** | Boundaries, devtools, composable config, worktree cache, agent skills |

### #3 Adopt pnpm Catalogs

| Dimension | Details |
|-----------|---------|
| **Effort** | 1-2 hours |
| **Impact** | Shared dependency versions defined once; fewer merge conflicts; version consistency |

**Example in `pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
  - "tools/*"
  - "infrastructure/pulumi"

catalog:
  react: "^19.1.0"
  react-dom: "^19.1.0"
  typescript: "~5.8.0"
  vitest: "^3.1.0"
  vite: "^6.2.0"
```

Then in individual package.json files:
```json
{
  "dependencies": {
    "react": "catalog:"
  }
}
```

### #4 Automate Changesets in CI

| Dimension | Details |
|-----------|---------|
| **Effort** | 30 minutes |
| **Impact** | Automatic "Version Packages" PRs; npm publish on merge |

Add `.github/workflows/release.yml`:
```yaml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### #5 Enable Turborepo Boundaries (Optional, Low Priority)

| Dimension | Details |
|-----------|---------|
| **Effort** | 1 hour |
| **Impact** | Prevent cross-layer imports; enforce architectural constraints |
| **Status** | Experimental in Turborepo 2.4+ |

Example in `turbo.json`:
```json
{
  "boundaries": {
    "tags": {
      "apps": ["apps/*"],
      "services": ["services/*"],
      "packages": ["packages/*"]
    },
    "rules": [
      { "allow": ["packages"], "from": ["apps", "services"] },
      { "deny": ["apps", "services"], "from": ["packages"] }
    ]
  }
}
```

---

## Decision Matrix

| Scenario | Recommended Action |
|----------|-------------------|
| **Current state** (14 pkgs, 1 dev, no remote cache) | Enable Vercel Remote Cache + upgrade Turborepo to 2.8. Both free, 15 min total. |
| **CI is slow** | Remote cache is the fix. Eliminates redundant rebuilds. |
| **Dependency version drift** | Adopt pnpm catalogs. Define versions once in workspace root. |
| **Need to publish @mbe/rialto** | Automate Changesets in CI with `changesets/action`. |
| **Growing to 30+ packages** | Enable Turborepo Boundaries. Consider Nx migration if team grows. |
| **Hiring a team (5+ devs)** | Re-evaluate Nx for module boundaries, generators, and affected commands. |
| **Package manager pain** | None expected. pnpm is the right choice; no migration needed. |

---

## Summary

The current monorepo stack — **pnpm + Turborepo + Changesets** — is the right stack. The tools are correct; the configuration has gaps.

| Component | Verdict | Action |
|-----------|---------|--------|
| **pnpm** | Keep | Adopt catalogs |
| **Turborepo** | Keep | Upgrade 2.3 → 2.8; enable remote cache |
| **Changesets** | Keep | Automate in CI |
| **Remote cache** | Add | Vercel Remote Cache (free) |
| **Boundaries** | Add later | Turborepo 2.8 experimental feature |

Total effort for all improvements: ~4 hours. Total cost: $0.

---

## Re-Evaluation Triggers

1. **Team grows to 5+ developers** — Nx's module boundaries and generators become valuable; re-evaluate Turborepo vs Nx
2. **Monorepo grows to 30+ packages** — Turborepo Boundaries may not be sufficient; Nx's mature enforcement might be needed
3. **Vercel changes Remote Cache pricing** — currently free; if they add charges, evaluate self-hosted alternatives or Nx Cloud
4. **pnpm major version** — pnpm 10 (whenever released); evaluate new features
5. **Turborepo major version** — follow Vercel's roadmap for Boundaries GA, Rust migration completion
6. **Bun matures** — re-evaluate when Bun supports monorepo publishing and has pnpm-level workspace ergonomics
7. **Build times exceed 10 minutes** — investigate Nx's distributed task execution or CI parallelization

---

## Sources

### Turborepo
- [Turborepo 2.8 Release](https://turborepo.dev/blog/2-8)
- [Turborepo 2.7 Release](https://turborepo.dev/blog/turbo-2-7)
- [Turborepo 2.4 Release](https://turborepo.dev/blog/turbo-2-4)
- [Turborepo 2.3 Release](https://turborepo.dev/blog/turbo-2-3)
- [Turborepo 2.0 Release](https://turborepo.dev/blog/turbo-2-0)
- [Turborepo Boundaries Reference](https://turborepo.dev/docs/reference/boundaries)
- [Turborepo Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Vercel Remote Cache (Free)](https://vercel.com/changelog/free-vercel-remote-cache)
- [Vercel Remote Cache Docs](https://vercel.com/docs/monorepos/remote-caching)
- [Turborepo Remote Cache Accelerating CI (Mercari Engineering)](https://engineering.mercari.com/en/blog/entry/20260216-turborepo-remote-cache-accelerating-ci-to-move-fast/)
- [Boundaries RFC Discussion](https://github.com/vercel/turborepo/discussions/9435)

### Nx
- [Nx Cloud Pricing](https://nx.app/pricing)
- [Nx Remote Cache](https://nx.dev/remote-cache)
- [Nx Self-Hosted Cache](https://nx.dev/docs/guides/tasks--caching/self-hosted-caching)
- [Nx Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries)
- [Migrating from Turborepo to Nx](https://nx.dev/docs/guides/adopting-nx/from-turborepo)
- [Nx Wrapping Up 2025](https://nx.dev/blog/wrapping-up-2025)
- [Nx Self-Hosted Cache: From Free to Paid to Free Again](https://emilyxiong.medium.com/exploring-of-nx-self-hosted-cache-5bc39bd2ed7f)

### Comparisons
- [Turborepo, Nx, and Lerna: The Truth about Monorepo Tooling in 2026](https://dev.to/dataformathub/turborepo-nx-and-lerna-the-truth-about-monorepo-tooling-in-2026-71)
- [Nx vs Turborepo: Integrated Ecosystem or High-Speed Task Runner?](https://dev.to/thedavestack/nx-vs-turborepo-integrated-ecosystem-or-high-speed-task-runner-the-key-decision-for-your-monorepo-279)
- [Why I Chose Turborepo Over Nx](https://dev.to/saswatapal/why-i-chose-turborepo-over-nx-monorepo-performance-without-the-complexity-1afp)
- [Nx vs Turborepo: Which Monorepo Tool for Your Startup?](https://nextbuild.co/blog/nx-vs-turborepo-monorepo-startups)
- [Monorepo Tools Compared (DevTools Guide)](https://www.devtoolsguide.com/monorepo-tools-comparison/)

### Package Managers
- [pnpm Catalogs](https://pnpm.io/catalogs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [NPM vs Yarn vs PNPM 2026 (NareshIT)](https://nareshit.com/blogs/npm-vs-yarn-vs-pnpm-package-manager-2026)
- [pnpm vs Bun vs Yarn Berry (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/pnpm-vs-bun-install-vs-yarn/)
- [JavaScript Package Managers in 2026](https://vibepanda.io/resources/guide/javascript-package-managers)
- [Workspaces and Monorepos in Package Managers (Andrew Nesbitt)](https://nesbitt.io/2026/01/18/workspaces-and-monorepos-in-package-managers.html)
- [pnpm vs npm vs yarn vs Bun 2026 Showdown](https://dev.to/pockit_tools/pnpm-vs-npm-vs-yarn-vs-bun-the-2026-package-manager-showdown-51dc)

### Version Management
- [Changesets GitHub](https://github.com/changesets/changesets)
- [Changesets vs Semantic Release (Brian Schiller)](https://brianschiller.com/blog/2023/09/18/changesets-vs-semantic-release/)
- [NPM Release Automation Guide (Oleksii Popov)](https://oleksiipopov.com/blog/npm-release-automation/)
- [Release Management for NX Monorepos](https://www.hamzak.xyz/blog-posts/release-management-for-nx-monorepos-semantic-release-vs-changesets-vs-release-it-)

### Self-Hosted Remote Cache
- [turborepo-remote-cache (Open Source)](https://github.com/ducktors/turborepo-remote-cache)
- [Alternative Remote Caching Hosts Discussion](https://github.com/vercel/turborepo/discussions/381)

### Lerna
- [Lerna and Nx](https://lerna.js.org/docs/lerna-and-nx)
- [Lerna Releases (GitHub)](https://github.com/lerna/lerna/releases)
- [Lerna Is Dead — Long Live Lerna (Nx Blog)](https://nx.dev/blog/lerna-is-dead-long-live-lerna)
