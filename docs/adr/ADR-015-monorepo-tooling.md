---
id: ADR-015
title: Monorepo Tooling (pnpm workspaces + Turborepo)
status: active
date: 2026-06-30
---

# ADR-015: Monorepo Tooling (pnpm workspaces + Turborepo)

## Context

The repository is a single monorepo containing many independently-versioned units: frontend apps (`apps/*`), shared libraries (`packages/*`), backend services (`services/*`), tooling (`tools/*`), and infrastructure (`infrastructure/*`). These units depend on each other (e.g. every app depends on `@mattbutlerengineering/rialto`; services depend on `@mbe/types`), and CI must build, typecheck, lint, and test them efficiently without rebuilding the world on every change.

We needed a package manager that models intra-repo dependencies as first-class workspace links, and a task runner that understands the dependency graph so it can order and cache work.

## Decision

The repo uses **pnpm workspaces** for package management and **Turborepo** for the task pipeline.

### pnpm workspaces

- Workspace membership is declared in `pnpm-workspace.yaml`; intra-repo dependencies are referenced as `workspace:*` so consumers pick up source changes directly (no publish/round-trip during development).
- A single `pnpm-lock.yaml` at the root pins the whole dependency tree.
- CVE remediation and version pinning go through `pnpm.overrides` using the **scoped selector pattern** (`"pkg@<patched": "^patched"`) so an override cannot silently float a major version.

### Turborepo task pipeline

- `turbo.json` defines the task graph (`build`, `test`, `typecheck`, `lint`) and their inter-task dependencies (`^build` = build dependencies first).
- Turbo caches task outputs keyed on inputs, so unchanged packages are not re-run.
- `--filter <pkg>...` (with the trailing `...`) selects a package **and its transitive dependencies**. CI's Architecture-Audit job builds only `@mbe/cli...` for exactly this reason — it needs the CLI and its deps, not the whole repo.

### Run tasks from the package directory

`pnpm <task>` is run from **inside a package directory**, not the monorepo root — a bare `turbo test`/`typecheck`/`build` at the root errors out for most packages. Tooling and agents use `pnpm --dir <abs-path> <cmd>` when a working directory cannot be assumed (e.g. parallel shells that do not share `cd` state).

## Consequences

**Benefits:**

- Source-level linking (`workspace:*`) means a change in `packages/rialto` is immediately visible to `apps/*` without a publish step.
- Turbo's graph-aware caching keeps CI fast — only affected packages and their dependents re-run.
- One lockfile and one override table give a single, auditable place for dependency governance.

**Trade-offs:**

- Contributors and agents must know the "run from the package dir" rule; root invocations fail confusingly. This is documented in the gotchas file and enforced by convention.
- Turbo's cache can mask stale generated artifacts if inputs are misdeclared — generated files (llms.txt, dep-graph) are regenerated and verified in CI rather than trusted from cache.
- `pnpm.overrides` with an open replacement range can float a major version; the scoped-selector pattern is mandatory to prevent this.

## Alternatives Considered

### npm / yarn workspaces

Rejected because pnpm's content-addressed store is faster and more disk-efficient, and its strictness (no phantom dependencies) catches missing `package.json` entries that npm/yarn hoisting would hide.

### Nx instead of Turborepo

Rejected because Turborepo's configuration surface is smaller and its caching model was sufficient for our task graph. Nx's richer generator/plugin ecosystem was not needed given our scaffolding lives in the `mbe` CLI.

### A single flat package (no workspaces)

Rejected because it would couple release cadence across all units, prevent per-package dependency isolation, and make the `packages/rialto` npm publish (for external consumers) impossible.

### Polyrepo (one repo per unit)

Rejected because cross-cutting changes (a shared type change rippling into three services) would require coordinated multi-repo PRs, losing the atomic-change and single-CI-run benefits the monorepo provides.
