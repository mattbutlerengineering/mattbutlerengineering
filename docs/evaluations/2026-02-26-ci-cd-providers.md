# CI/CD Provider Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **CI/CD platform** | GitHub Actions (3 workflows) |
| **CI workflow** | `ci.yml` — lint-typecheck → build + test (parallel), migrations job |
| **IaC preview** | `pulumi-preview.yml` — on PRs touching `infrastructure/pulumi/**` |
| **IaC deploy** | `pulumi-up.yml` — on push to main |
| **Runner** | `ubuntu-latest` (2 vCPU, 7 GB RAM, standard GitHub-hosted) |
| **Build orchestration** | Turborepo (local caching only, **no remote cache**) |
| **Docker** | Multi-stage Dockerfiles (node:22-alpine, pnpm workspace-aware) |
| **Test coverage** | Vitest + V8 → Codecov |
| **Deployment** | DigitalOcean App Platform `deployOnPush: true` (separate from CI) |
| **Dependency updates** | Dependabot (GitHub-native, **no config file**) |
| **Release management** | Changesets (**not automated in CI**) |
| **Pre-commit hooks** | **None** |
| **Concurrency** | CI: `cancel-in-progress: true`; Pulumi: `cancel-in-progress: false` |
| **Monthly CI cost** | $0 |

### Architecture

```
┌──────────────┐                               ┌──────────────────┐
│  Developer   │──── git push / PR ────────────►│  GitHub Actions  │
└──────────────┘                                └────────┬─────────┘
                                                         │
                              ┌───────────────────────────┼───────────────────────────┐
                              │                           │                           │
                              ▼                           ▼                           ▼
                    ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
                    │  ci.yml          │       │  pulumi-preview  │       │  pulumi-up.yml   │
                    │                  │       │  (PRs only,      │       │  (main only,     │
                    │  lint-typecheck  │       │   infra paths)   │       │   infra paths)   │
                    │       │         │       └──────────────────┘       └──────────────────┘
                    │   ┌───┴───┐     │
                    │   ▼       ▼     │       ┌──────────────────┐
                    │  build   test   │       │  DigitalOcean    │
                    │          │      │       │  App Platform    │
                    │       migrations│       │  deployOnPush    │
                    └──────────────────┘       └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Codecov         │
                    │  (coverage)      │
                    └──────────────────┘
```

### Pain Points & Optimization Opportunities

- **No Turborepo remote cache** — every CI run reinstalls dependencies and rebuilds from scratch; `turbo.json` has no `remoteCache` configuration
- **No Docker layer caching in CI** — the `services/users/Dockerfile` multi-stage build runs cold every time
- **Redundant setup steps** — `pnpm install --frozen-lockfile` + `db:generate` repeated in all 4 CI jobs (lint-typecheck, build, test, migrations) with no artifact sharing
- **Changesets not automated** — `changeset` and `release` scripts exist in root `package.json` but no CI workflow publishes versions or creates release PRs
- **Dependabot unconfigured** — no `.github/dependabot.yml`; no grouping, no auto-merge, no lock file maintenance
- **No pre-commit hooks** — lint/typecheck issues caught only in CI, not at commit time
- **No deployment status feedback in PRs** — DigitalOcean deploys independently; PR authors don't see deploy status

---

## Evaluation Criteria

| Criterion | Why It Matters |
|-----------|---------------|
| **Build speed** | TypeScript compilation (`tsc`) is CPU-bound single-thread; faster CI = faster feedback |
| **Monorepo support** | Path filtering, task orchestration, dependency-aware builds |
| **Caching sophistication** | Remote task cache, Docker layer cache, dependency cache persistence |
| **Free tier / pricing** | Solo developer budget; 2,000 free min/mo is the current baseline |
| **GitHub integration depth** | PR status checks, commit annotations, marketplace actions |
| **Docker build support** | Multi-stage builds, layer caching, registry push |
| **YAML vs programmable pipelines** | Maintainability as pipeline complexity grows |
| **Migration friction** | Effort to switch; workflow rewrite scope; learning curve |
| **GHA compatibility** | Can it complement GitHub Actions, or does it replace it entirely? |
| **Deployment integration** | Preview environments, deploy status in PRs |

---

## Provider Classification

| Category | Providers | Relationship to GitHub Actions |
|----------|-----------|-------------------------------|
| **Full CI/CD Platforms** | GitHub Actions, CircleCI, GitLab CI, Buildkite, Semaphore CI | Replace GHA entirely |
| **Build Accelerators** | Turborepo Remote Cache, Depot, Dagger | Complement GHA (run inside GHA jobs) |
| **Faster Runners** | Namespace, Blacksmith | Complement GHA (swap `runs-on` label) |
| **Monorepo Caching** | Nx Cloud | Requires full Nx migration (incompatible with Turborepo) |

---

## Provider Profiles

### Full CI/CD Platforms

#### 1. GitHub Actions (Current)

GitHub's native CI/CD platform. The decisive advantage is not the runner specs or free minutes — it's the native platform integration that no external service can replicate. January 2026 brought a 39% price reduction on hosted runners.

| Criterion | Details |
|-----------|---------|
| **Free tier** | 2,000 min/mo (Linux 2-core); public repos: unlimited |
| **Pricing** | $0.006/min (2-core Linux) after free quota; 39% reduction effective Jan 1, 2026 |
| **Runner specs** | 2 vCPU, 7 GB RAM (standard); 4–64 core larger runners (Team/Enterprise plans only) |
| **Monorepo support** | `paths:` filter on triggers, reusable workflows, composite actions |
| **Caching** | `actions/cache` (10 GB limit), `setup-node` with pnpm cache, Turborepo via community actions |
| **Docker builds** | `docker/build-push-action` + buildx; layer caching via `cache-from: type=gha` (shares 10 GB limit) |
| **Marketplace** | 20,000+ actions; largest ecosystem of any CI platform |
| **Concurrency** | Configurable groups with `cancel-in-progress` |
| **Service containers** | Native `services:` for database testing (Postgres, Redis, etc.) |
| **Pipeline model** | YAML workflows with job dependencies and matrix strategies |

**Recent changes (2025–2026):**
- 39% price reduction on hosted runners (January 1, 2026)
- Arm64 Linux runners GA (February 2025)
- 1-core slim runner (`ubuntu-slim`) GA at $0.002/min (January 22, 2026)
- Self-hosted runner billing fee announced then indefinitely postponed after community backlash

**Key strength:** Zero-friction integration — PR checks, commit statuses, branch protection rules, and deployment environments are all first-class GitHub features. The marketplace provides pre-built actions for virtually every tool (Codecov, Pulumi, Prisma, Changesets, etc.).

**Key weakness:** YAML debugging remains painful. The 10 GB cache limit is shared across all caches in a repository — Docker layer cache competes with `actions/cache` for the same pool. Standard runners (2 vCPU) are slow for CPU-bound TypeScript compilation.

---

#### 2. CircleCI

Credit-based CI/CD platform with genuinely faster build performance and more sophisticated Docker Layer Caching. However, vendor risk is real — multiple layoff rounds in 2023–2024, no funding since 2021 ($315M total raised at $1.7B valuation).

| Criterion | Details |
|-----------|---------|
| **Free tier** | 30,000 credits/mo (~3,000 min on Linux medium at 10 credits/min) |
| **Pricing** | Performance plan: $15/mo base + pay-as-you-go credits; DLC: 200 credits/job ($0.12) |
| **Runner specs** | Medium (2 vCPU, 4 GB), Large (4 vCPU, 8 GB), XL (8 vCPU, 16 GB) |
| **Monorepo support** | Dynamic configuration (two-stage pipeline); path filtering via `continuation` orb |
| **Caching** | Workspace persistence, checksum-based cache keys, 15 GB Docker Layer Cache (dedicated, separate from compute cache) |
| **Docker builds** | First-class Docker Layer Caching (DLC) with dedicated 15 GB store |
| **Ecosystem** | Orbs (reusable config packages); Node.js, pnpm, Turborepo orbs available |
| **GitHub integration** | PR status checks, job annotations; not as deep as native GHA |
| **Pipeline model** | YAML with workflows, jobs, steps; orbs for reusability |

**Key strength:** Docker Layer Caching is a first-class feature with a dedicated 15 GB store (separate from compute cache). This is meaningfully better than GHA's `cache-from: type=gha` which competes with all other caches in the 10 GB limit. CircleCI claims 40% faster median builds and 90% less queue time vs default GHA runners.

**Key weakness:** Monorepo path filtering requires "dynamic configuration" — a two-stage pipeline architecture where the first stage evaluates which paths changed and generates the second stage's config. Powerful but significantly more complex than GHA's `paths:` filter. DLC costs 200 credits per job ($0.12), which adds up with frequent pushes.

**Vendor risk:** Multiple layoffs (2023–2024), security incident in January 2023 (secrets rotation required for all customers), and GitHub Actions directly competing with its core product.

---

#### 3. GitLab CI

The most feature-complete CI/CD platform (native container registry, DAG pipelines, child pipelines, Auto DevOps). However, using GitLab CI with a GitHub-hosted repository requires a **Premium plan at $29/user/month** — there is no free path.

| Criterion | Details |
|-----------|---------|
| **Free tier** | 400 min/mo (SaaS); unlimited on self-hosted runners |
| **Pricing** | Premium: $29/user/mo (annual) + 10,000 min/mo; Ultimate: $99/user/mo |
| **Runner specs** | Similar to GHA standard; larger runners on Premium+ |
| **Monorepo support** | `rules:changes:` for path filtering, child pipelines, DAG dependencies |
| **Caching** | Key-based with `cache:` directive; per-branch or shared |
| **Docker builds** | Built-in container registry; Docker-in-Docker or kaniko; no dedicated layer cache |
| **GitHub integration** | Requires Premium plan; pull mirroring with 30-minute polling interval |
| **Pipeline model** | YAML with stages, DAG, child pipelines, `include:` templates |

**Key strength:** If the repository were hosted on GitLab, this would be the strongest platform. Built-in container registry, DAG pipelines, and unlimited minutes on self-hosted runners. The self-hosted runner story is the best of the three major platforms.

**Key weakness for this project:** Everything. Requires a paid plan for GitHub integration, split-platform developer experience, polling-based mirroring, and the least generous free tier (400 min/mo vs GHA's 2,000). Not a viable option for a GitHub-hosted repo on a solo developer budget.

---

#### 4. Buildkite

Hybrid CI/CD platform: hosted orchestration layer with self-hosted or managed agents. Strong test analytics and the best GitHub Merge Queue support. Per-user pricing ($30/user/mo on Pro) makes it expensive for the features relative to free GHA.

| Criterion | Details |
|-----------|---------|
| **Free tier** | Personal plan: free, 500 hosted min/mo, 1 user |
| **Pricing** | Pro: $30/user/mo (P95 active billing) + hosted agent minutes at $0.013–0.052/min |
| **Runner specs** | Self-hosted: any hardware; hosted: 2–8 vCPU Linux, Mac M4 Pro |
| **Monorepo support** | `monorepo-diff` plugin (computes git diff, triggers downstream pipelines) |
| **Caching** | NVMe-attached cache volumes on hosted agents (no extra cost, best-effort persistence); S3-backed for self-hosted |
| **Docker builds** | Docker plugin ecosystem; no dedicated layer caching on hosted agents |
| **GitHub integration** | Per-step commit statuses, inline annotations, first-class Merge Queue support (October 2025) |
| **Pipeline model** | YAML with dynamic pipeline generation; steps can emit sub-pipelines |

**Recent changes (2025):** Vitest integration in Test Engine (August 2025), Mac M4 Pro hardware (August 2025), native `secrets:` YAML key (October 2025), GitHub Merge Queue support (October 2025).

**Key strength:** Test Engine with Vitest support (August 2025) provides test analytics — identifying flaky tests, slow tests, and test suite trends. Useful as a monorepo grows. The hybrid model (self-hosted agents) means you can scale to dedicated hardware without platform lock-in.

**Key weakness:** $30/user/mo Pro plan for a solo developer is $30/mo for CI that GHA provides free. The monorepo-diff plugin is functional but is a plugin, not a built-in primitive. The 500 free hosted minutes on Personal plan is 4x less than GHA's 2,000.

---

#### 5. Semaphore CI

Speed-focused CI/CD with the best built-in monorepo support of any platform. `change_in()` is a first-class DSL function evaluated before any job runs — superior to GHA's `paths:` filter or Buildkite's diff plugin. Open-sourced core in February 2025 (Apache 2.0).

| Criterion | Details |
|-----------|---------|
| **Free tier** | None on Cloud (billing from first job); Community Edition: self-hosted, free (Apache 2.0) |
| **Pricing** | Cloud: per-second billing, $0.0075/min (e1-standard-2) to $0.02/min (e2-standard-4); no per-seat cost |
| **Runner specs** | e1-standard-2 (2 vCPU, 4 GB), e2-standard-4 (4 vCPU, 8 GB), up to 8 vCPU |
| **Monorepo support** | `change_in()` DSL function — glob patterns, exclusion lists, commit range awareness; no plugins required |
| **Caching** | `cache store/restore` toolbox commands with checksum-based keys; registry-based Docker layer caching |
| **Docker builds** | `--cache-from` registry-based; no dedicated layer cache service |
| **GitHub integration** | PR status checks, annotations; not as deep as native GHA |
| **Pipeline model** | YAML with blocks, promotions, `change_in()` conditions |

**Key strength:** `change_in()` is the strongest monorepo path filtering in any CI platform. It evaluates before job runs (unlike GHA's `paths:` which only filters at the workflow level), supports glob patterns and exclusion lists, and is commit-range-aware (different behavior for push vs PR).

**Key weakness:** No free cloud tier — billing starts from the first job. At ~50 builds × 10 min/build, estimated ~$7.50–10/mo for a solo developer. That's inexpensive but not free. The open-source Community Edition is self-hosted only.

---

### Build Accelerators

#### 6. Turborepo Remote Cache (Vercel)

Remote caching for the existing Turborepo setup. Each task produces a hash from inputs; when the hash matches a stored artifact, Turborepo downloads cached output instead of re-executing. The Vercel-hosted cache became free with no published caps in late 2024.

| Criterion | Details |
|-----------|---------|
| **Pricing** | Free (Vercel Remote Cache) — no published usage caps, "fair use" policy |
| **Setup complexity** | ~17 minutes: generate Vercel token, add 2 secrets to GHA, add 2 env lines to workflow |
| **Expected savings** | ~50% reduction in Turbo task duration, ~30% reduction in total CI job time (Mercari Engineering benchmark) |
| **Self-hosted alternatives** | `ducktors/turborepo-remote-cache` (Node.js, S3/GCS/R2 backend); `rharkor/caching-for-turbo` (GitHub Actions cache backend, $0) |
| **Security** | HMAC-SHA256 artifact signing via `TURBO_REMOTE_CACHE_SIGNATURE_KEY` env var |
| **GHA compatibility** | Runs inside existing GHA jobs; add env vars only |

**Key finding:** The `rharkor/caching-for-turbo` community action bridges Turborepo's remote cache protocol to GitHub's built-in `actions/cache` — zero external infrastructure, zero cost, zero new accounts. This is the lowest-friction option.

**Alternative: Vercel Remote Cache** is the official, supported option and also free. Choose this if you want Vercel's dashboard visibility into cache hits/misses, or if you're already using Vercel for hosting.

---

#### 7. Depot

Managed Docker build service with persistent layer caching. Drop-in replacement for `docker/build-push-action` in GitHub Actions. The persistent cache (backed by fast bare-metal NVMe) is the key differentiator — GitHub's ephemeral runners lose Docker layers between runs.

| Criterion | Details |
|-----------|---------|
| **Pricing** | No free tier. Developer: $20/mo (500 Docker build min, 2,000 GHA min, 25 GB cache). Startup: $200/mo. |
| **Setup complexity** | ~22 minutes: create account, configure OIDC trust, swap `docker/build-push-action` → `depot/build-push-action` |
| **Build speed** | 2–10x faster Docker builds depending on cache hit rate and image size |
| **Multi-stage support** | Full support; caches intermediate stages independently |
| **GHA compatibility** | Drop-in action replacement; OIDC auth (no long-lived secrets) |
| **Additional features** | Also offers Turborepo cache integration on Depot GHA runners |

**Key strength:** Docker layer caching is persistent across runs. The `services/users/Dockerfile` multi-stage build (node:22-alpine → pnpm install → prisma generate → build → production image) would see massive improvements since dependency install and prisma generate rarely change.

**Key weakness:** $20/mo is hard to justify for a solo developer until Docker build time is a proven bottleneck. Measure first — if Docker builds take <2 minutes, the savings don't justify the cost.

---

#### 8. Dagger

Open-source programmable CI engine with a TypeScript SDK. Replace YAML workflow definitions with TypeScript functions; Dagger runs them inside containers using BuildKit. The promise: `dagger call build` works identically on a developer laptop and in GitHub Actions.

| Criterion | Details |
|-----------|---------|
| **Pricing** | Engine: free (open-source). Cloud Individual: free (visualization). Cloud Team: $50/mo (distributed caching). |
| **Setup complexity** | 4–12 hours to rewrite existing YAML pipeline as TypeScript modules |
| **Caching** | BuildKit-native content-addressing; `dag.cacheVolume()` for persistent state; distributed caching requires Cloud Team ($50/mo) |
| **GHA compatibility** | Runs inside GHA via `dagger/dagger-for-github` action; does not replace GHA, replaces step definitions |
| **TypeScript SDK** | Full SDK for defining pipelines as code; type-safe, testable |
| **Local/CI parity** | Same pipeline runs locally and in CI (the core value proposition) |

**Key strength:** Local/CI parity is genuinely compelling. Debugging CI failures locally (instead of push-and-pray) eliminates a real pain point. TypeScript pipelines are testable and type-safe — no more YAML indentation bugs.

**Key weakness:** Significant migration effort (4–12 hours). The current pipeline is 3 simple YAML files totaling ~150 lines — Dagger's overhead is not justified at this complexity level. Distributed caching (the main performance benefit) requires $50/mo. Community consensus: Dagger is over-engineered for simple pipelines.

---

### Faster GitHub Actions Runners

#### 9. Namespace

Developer infrastructure platform offering managed GitHub Actions runners on AMD EPYC hardware (~1.9–2x faster single-thread vs GitHub standard). Drop-in replacement — change `runs-on:` label only. Supports personal GitHub accounts.

| Criterion | Details |
|-----------|---------|
| **Pricing** | Developer (PAYG): $0.0015/unit-min; 4 vCPU = $0.006/min (vs GitHub 4-core at $0.012/min) |
| **Free tier** | None — billing from first minute (no credit card required to start) |
| **Runner specs** | AMD EPYC (x86), AmpereOne/Apple M4 Pro (ARM); 4–32 vCPU; NVMe storage |
| **CPU benchmark** | p50 ~4,515 vs GitHub ~2,327 — roughly 1.9–2x faster single-thread |
| **Unique features** | Persistent NVMe cache volumes (cross-run, no `actions/cache` needed); SSH debugging into running/completed jobs |
| **Personal accounts** | Yes — works with personal GitHub accounts, not just organizations |
| **Setup** | Low: connect GitHub account, create runner profile, change `runs-on:` labels (~30 min) |

**Key strength:** Persistent NVMe cache volumes eliminate the cold-cache penalty. Node modules, pnpm store, and Turborepo local cache persist across runs without configuring `actions/cache`. Combined with 2x CPU speed, this could cut CI times by 50-60%.

**Key weakness:** No free tier means paying from minute one. For a solo developer within GitHub's 2,000 free min/mo, the economic argument is weak unless CI latency (not cost) is the pain point.

---

#### 10. Blacksmith

Faster GitHub Actions runners focused on speed and Docker layer caching ("sticky disks"). ~1.9x faster single-thread performance vs GitHub standard. Includes a 3,000 free min/mo tier — the only faster runner provider with a meaningful free tier.

| Criterion | Details |
|-----------|---------|
| **Pricing** | 2 vCPU: $0.004/min; 4 vCPU: $0.008/min; 8 vCPU: $0.016/min |
| **Free tier** | 3,000 min/mo (2-core); scales by core count |
| **Runner specs** | Newer-gen x86 with ~50% higher single-core; persistent Docker layer cache ("sticky disks") |
| **CPU benchmark** | p50 ~4,484 vs GitHub ~2,327 — roughly 1.9x faster single-thread |
| **Docker caching** | "Sticky disks" persist Docker layers across runs — Docker builds drop from minutes to seconds |
| **Migration wizard** | Built-in tool at `app.blacksmith.sh` to rewrite `runs-on:` labels automatically |
| **Setup** | Very low: connect org, use migration wizard (~15–30 min) |

**Hard blocker:** Requires a GitHub organization — personal repositories are not supported. A solo developer using `github.com/username/repo` must create a GitHub org and transfer repos first.

**Key strength:** 3,000 free min/mo on faster hardware is genuinely generous. Docker layer caching ("sticky disks") is a standout feature — the `services/users/Dockerfile` multi-stage build would benefit enormously.

**Key weakness:** Organization requirement adds friction. No macOS runners. No persistent dependency caching (pnpm store still needs `actions/cache`). No SSH debugging.

---

## Comparison Tables

### Full Platforms — Pricing

| Provider | Free Tier | Per-Minute Rate | Monorepo Support | GitHub Integration |
|----------|-----------|-----------------|------------------|--------------------|
| **GitHub Actions** | 2,000 min/mo | $0.006/min (2-core) | `paths:` filter, reusable workflows | Native (best possible) |
| **CircleCI** | ~3,000 min/mo (30K credits) | ~$0.006/min (medium) | Dynamic config (complex) | Good (PR checks, annotations) |
| **GitLab CI** | 400 min/mo | $29/user/mo (Premium required for GitHub) | `rules:changes:`, child pipelines | Poor (requires Premium, polling) |
| **Buildkite** | 500 min/mo | $0.013–0.052/min + $30/user/mo | `monorepo-diff` plugin | Good (per-step statuses, merge queue) |
| **Semaphore CI** | None (per-second billing) | $0.0075–0.02/min; no per-seat | `change_in()` DSL (best-in-class) | Good (PR checks, annotations) |

### Build Accelerators — Pricing & GHA Compatibility

| Tool | Pricing | What It Caches | GHA Integration | Replaces GHA? |
|------|---------|----------------|-----------------|---------------|
| **Turborepo Remote Cache** | Free (Vercel) or $0 (GHA cache backend) | Turborepo task outputs (build artifacts, test results) | Env vars only | No (complements) |
| **Depot** | $20/mo (Developer) | Docker layers (persistent NVMe) | Drop-in action swap | No (complements) |
| **Dagger** | Free engine; $50/mo for distributed cache | BuildKit layers, cache volumes | Runs inside GHA job | No (replaces YAML steps) |

### Faster Runners — Pricing & Specs

| Provider | Free Tier | 4 vCPU Cost/Min | CPU Speed vs GitHub | Personal Account? | Docker Cache? |
|----------|-----------|-----------------|--------------------|--------------------|---------------|
| **GitHub standard** | 2,000 min/mo | N/A (Team plan req'd for 4-core) | Baseline | Yes | No |
| **Namespace** | None (PAYG) | ~$0.006/min | ~1.9–2x faster | Yes | No (but NVMe cache volumes) |
| **Blacksmith** | 3,000 min/mo (2-core) | $0.008/min | ~1.9x faster | No (org required) | Yes ("sticky disks") |

---

## Eliminated Providers

| Provider | Elimination Reason |
|----------|-------------------|
| **GitLab CI** | Requires Premium plan ($29/user/mo) for GitHub integration; 400 free min/mo is 5x less generous than GHA; split-platform DX with polling-based mirroring. Not viable for a GitHub-hosted repo. |
| **Jenkins** | Self-hosted ops burden (JVM, plugins, security patches). Massive ecosystem but requires dedicated infrastructure and ongoing maintenance. Not appropriate for a solo developer. |
| **Travis CI** | Declining platform. Free tier eliminated in 2020, community trust eroded. Open-source project shifted to community-maintained fork. No competitive advantage over GHA. |
| **Bitrise** | Mobile-focused CI/CD platform. Optimized for iOS/Android build pipelines. Not relevant for a TypeScript web monorepo. |
| **TeamCity** | JetBrains enterprise CI/CD. Powerful but complex; requires self-hosted server or expensive cloud plan. Overkill for a solo developer. |
| **AWS CodePipeline / CodeBuild** | AWS-native CI/CD. Requires AWS ecosystem; complex IAM configuration; poor DX compared to GHA. Only makes sense if already deeply invested in AWS. |
| **Azure DevOps Pipelines** | Microsoft enterprise platform. Strong feature set but split-platform DX and enterprise-oriented pricing. GHA is Microsoft's own recommendation for GitHub repos. |
| **Nx Cloud** | Requires full migration from Turborepo to Nx. Cannot be used as a drop-in remote cache backend for Turborepo — the two ecosystems are incompatible. Not an option without rewriting the entire build orchestration. |

---

## Recommended Shortlist

### #1 GitHub Actions — Stay + Optimize (Recommended)

GitHub Actions is the correct platform for this project. The native GitHub integration is an unmatched advantage. The evaluation confirms the architecture doc's original recommendation — GHA is the right choice for a solo developer on GitHub.

**Immediate optimizations (all free, total setup ~1 hour):**

1. **Enable Turborepo remote cache** via `rharkor/caching-for-turbo` — bridges Turborepo's cache protocol to GitHub's built-in `actions/cache`. Zero cost, zero external accounts. Expected: ~30-50% reduction in CI job time for cache-hit runs.

2. **Add Changesets automation workflow** — `changesets/action` watches for changeset files on `main`, opens a living "Version Packages" PR, and creates GitHub Releases on merge. Eliminates manual `changeset version` + `changeset publish`.

3. **Configure Dependabot** (or switch to Renovate) — add `.github/dependabot.yml` with grouping rules, auto-merge for patches, and lock file maintenance. Renovate is the stronger choice for pnpm monorepos (better workspace support, group presets, dependency dashboard).

4. **Add pre-commit hooks** via Lefthook — Prettier format + ESLint fix on staged files. Catches issues before they reach CI.

**Action items:**
| Action | Effort | Cost | Impact |
|--------|--------|------|--------|
| Turborepo remote cache (`rharkor/caching-for-turbo`) | 17 min | $0 | ~30-50% faster CI |
| Changesets automation workflow | 30 min | $0 | Automated releases |
| Dependabot config or Renovate setup | 20 min | $0 | Grouped, auto-merged dependency PRs |
| Lefthook pre-commit hooks | 15 min | $0 | Catch lint issues pre-push |

### #2 CircleCI — Strongest Full Alternative

If GitHub Actions becomes insufficient (unlikely for a solo developer), CircleCI is the strongest alternative:

1. **Faster builds** — vendor claims 40% faster median, 90% less queue time vs default GHA runners
2. **Superior Docker Layer Caching** — dedicated 15 GB DLC store, separate from compute cache
3. **Orbs ecosystem** — reusable config packages for Node.js, pnpm, Turborepo

**Trade-offs:** $15/mo minimum on Performance plan. Monorepo path filtering requires dynamic configuration (complex). Vendor risk — multiple layoffs, no recent funding, 2023 security incident. GitHub Actions directly competes with its core product.

**When to consider:** If Docker build caching becomes critical and Depot ($20/mo) doesn't solve it, or if GHA's YAML limitations become genuinely painful.

### #3 Dagger — Programmable Pipelines (Future)

If YAML complexity grows beyond 3-5 workflow files, Dagger offers TypeScript-defined pipelines with local/CI parity:

1. **TypeScript SDK** — type-safe, testable pipeline definitions; no YAML indentation bugs
2. **Local/CI parity** — `dagger call build` works identically on laptop and in CI
3. **BuildKit caching** — content-addressed caching with persistent volumes

**Trade-offs:** 4-12 hour migration effort. Distributed caching requires $50/mo (Cloud Team). Over-engineered for current pipeline complexity (3 YAML files, ~150 lines total).

**When to consider:** When pipeline complexity exceeds 5-7 workflow files, or when debugging CI failures locally becomes a frequent pain point.

---

## Build Acceleration Analysis

### Turborepo Remote Cache — Setup Guide

The highest-ROI optimization. Two approaches, both free:

**Option A: GitHub Actions Cache Backend (Recommended)**
```yaml
# Add to each job that runs turbo commands
- name: Setup Turborepo cache
  uses: rharkor/caching-for-turbo@v8
```

No environment variables, no external accounts, no Vercel dependency. Uses GitHub's built-in 10 GB cache. The action bridges Turborepo's remote cache protocol to `actions/cache`.

**Option B: Vercel Remote Cache**
```yaml
# Add env vars to jobs that run turbo commands
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

Requires a free Vercel account and access token. Provides dashboard visibility into cache hits/misses.

**Expected impact for this monorepo:**
- First run: no change (populates cache)
- Subsequent runs (no source changes in a package): near-instant task completion
- Partial changes (e.g., only `@mbe/rialto` changed): only rialto rebuilds; `@mbe/types`, `@mbe/auth`, `services/users` use cached output
- Mercari Engineering measured ~50% reduction in Turbo task duration and ~30% in total CI job time

### Docker Layer Caching — Options

The `services/users/Dockerfile` has a well-structured multi-stage build with dependency install and prisma generate as early layers. Layer caching would skip these on most runs.

| Option | Cost | Setup | Effectiveness |
|--------|------|-------|---------------|
| **GHA `cache-from: type=gha`** | $0 | Add cache-from/cache-to to build step | Limited (shares 10 GB with all caches) |
| **Depot** | $20/mo | Swap action, add OIDC trust | Excellent (persistent NVMe, dedicated) |
| **Blacksmith sticky disks** | $0 (3K free min) | Change `runs-on:` labels | Good (persistent, but org required) |
| **GitHub Container Registry cache** | $0 | Push cache layers to `ghcr.io` | Good (unlimited storage, slower than local) |

**Recommendation:** Start with `cache-from: type=gha` ($0). Measure Docker build time. If consistently >3 minutes, evaluate Depot ($20/mo) or Blacksmith (free but org required).

### Faster Runners — When to Consider

| Scenario | Recommendation |
|----------|---------------|
| CI times <5 min, within free quota | Stay on standard runners |
| CI times 5-10 min, latency is frustrating | Consider Namespace (PAYG, no free tier) or Blacksmith (3K free min, org required) |
| CI times >10 min, scaling to more packages | Faster runners + remote cache combined |
| Docker builds are the bottleneck | Blacksmith sticky disks or Depot |

**Key benchmark:** GitHub standard runners score CPU p50 ~2,327 vs Namespace/Blacksmith at ~4,484–4,515. For CPU-bound `tsc` compilation, that's a near-linear 1.9x speedup. A 6-minute CI run becomes ~3.2 minutes.

---

## Missing Workflows Analysis

### Changesets Automation

**Problem:** The root `package.json` has `changeset`, `version-packages`, and `release` scripts, but no CI workflow automates them. Version bumps and releases are manual.

**Solution:** Two new workflow files:

**`.github/workflows/release.yml`** — the main automation:
```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    name: Release
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
          version: pnpm version-packages
          # Omit publish for private monorepo — creates version PR + GitHub Releases only
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**`.github/workflows/changeset-check.yml`** — enforces PRs include a changeset:
```yaml
name: Changeset Check

on:
  pull_request:
    branches: [main]

jobs:
  check:
    name: Changeset Required
    runs-on: ubuntu-latest
    # Skip if PR has "skip-changeset" label
    if: ${{ !contains(github.event.pull_request.labels.*.name, 'skip-changeset') }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm changeset status --since=origin/main
```

### Dependency Management — Renovate vs Dependabot

**Problem:** No `.github/dependabot.yml` — using GitHub's default Dependabot behavior with no grouping, no auto-merge, and no lock file maintenance.

**Dependabot limitations with pnpm monorepos:**
- Known open issues with workspace member `package.json` updates
- `groups` feature throws `NoChangeError` in some pnpm configurations
- No lock file maintenance PR capability
- No dependency dashboard

**Recommended: Renovate** (free GitHub App from Mend.io)

Key advantages over Dependabot:
- `group:monorepos` preset — auto-groups all packages from the same monorepo (e.g., all `@vitest/*` in one PR)
- Lock file maintenance — weekly PR to refresh `pnpm-lock.yaml`
- Dependency Dashboard — GitHub Issue listing all pending updates with status
- Per-rule auto-merge — patch updates auto-merge; majors require review

**Recommended `renovate.json`:**
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "group:monorepos",
    "group:recommended",
    ":maintainLockFilesWeekly",
    ":automergeMinor"
  ],
  "packageRules": [
    {
      "groupName": "React",
      "matchPackagePatterns": ["^react", "^@types/react"]
    },
    {
      "groupName": "Vite ecosystem",
      "matchPackagePatterns": ["^vite", "^@vitejs/"]
    },
    {
      "groupName": "TypeScript tooling",
      "matchPackagePatterns": ["^typescript", "^@typescript-eslint/"]
    },
    {
      "groupName": "Fastify",
      "matchPackagePatterns": ["^fastify", "^@fastify/"]
    },
    {
      "groupName": "Prisma",
      "matchPackagePatterns": ["^prisma", "^@prisma/"]
    }
  ]
}
```

**If staying with Dependabot**, add `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      react:
        patterns: ["react*", "@types/react*"]
      vite:
        patterns: ["vite*", "@vitejs/*"]
      fastify:
        patterns: ["fastify*", "@fastify/*"]
      prisma:
        patterns: ["prisma*", "@prisma/*"]
    open-pull-requests-limit: 10
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Pre-Commit Hooks

**Problem:** Lint and typecheck issues are caught only in CI, not at commit time. A lint failure requires waiting for the full CI pipeline to surface.

**Recommended: Lefthook** (Go binary, single config file)

Advantages over Husky v9 + lint-staged:
- Built-in parallel execution (`parallel: true`) — ESLint and Prettier run simultaneously
- Built-in `{staged_files}` placeholder — eliminates the `lint-staged` dependency
- Single `lefthook.yml` config file vs `.husky/` directory + `package.json` lint-staged config

**Recommended `lefthook.yml`:**
```yaml
pre-commit:
  parallel: true
  commands:
    prettier:
      glob: "*.{ts,tsx,js,jsx,json,css,md}"
      run: npx prettier --write {staged_files} && git add {staged_files}
    eslint:
      glob: "*.{ts,tsx,js,jsx}"
      run: npx eslint --fix {staged_files} && git add {staged_files}
```

**What NOT to run pre-commit:**
- `tsc --noEmit` — too slow (20-60 seconds across monorepo)
- `vitest` — too slow, and test failures are CI's job
- `turbo build` — inappropriate for a pre-commit hook

**The correct pattern:** Local hooks provide fast feedback (lint/format); CI is the authoritative gate that cannot be bypassed with `--no-verify`.

---

## Decision Matrix

| Scenario | Recommended Action |
|----------|-------------------|
| **Current state** (solo dev, <2K min/mo, free tier) | Stay on GitHub Actions; add Turborepo remote cache + Changesets automation + Renovate + Lefthook |
| **CI times >5 min, latency is the pain** | Add Turborepo remote cache first; if still slow, evaluate Namespace or Blacksmith runners |
| **Docker builds are the bottleneck** | Add `cache-from: type=gha` (free); if insufficient, Depot ($20/mo) or Blacksmith sticky disks |
| **Growing to 5+ services** | Turborepo remote cache becomes critical; evaluate Semaphore CI for `change_in()` monorepo support |
| **YAML pipelines become painful (5+ files)** | Evaluate Dagger TypeScript SDK for programmable pipelines |
| **Need test analytics (flaky test tracking)** | Buildkite Test Engine (Vitest support since August 2025) |
| **Exceeding 2,000 free min/mo** | Add Turborepo remote cache to reduce minutes; evaluate faster runners (2x speed = half the minutes) |
| **Moving to AWS ecosystem** | AWS CodeBuild becomes natural fit; but GHA is still likely better for DX |
| **Enterprise CI needs (SOC 2, audit logs)** | Buildkite or CircleCI for compliance features |

---

## Re-Evaluation Triggers

Watch for these events that should trigger a fresh evaluation:

1. **CI times consistently >5 minutes** — implement Turborepo remote cache and Docker layer caching; if still slow, evaluate faster runners
2. **Exceeding 2,000 free GHA minutes/month** — remote cache should reduce this; if not, faster runners do more work per minute
3. **Growing beyond 5-7 monorepo packages** — `change_in()` path filtering (Semaphore) becomes compelling to skip unaffected packages entirely
4. **YAML pipelines exceed 5 workflow files** — Dagger TypeScript SDK becomes worth the migration effort
5. **Docker builds consistently >3 minutes** — Depot ($20/mo) or Blacksmith sticky disks provide persistent layer caching
6. **GitHub Actions pricing changes** — GitHub postponed a self-hosted runner fee; watch for reintroduction or other pricing shifts
7. **Dagger ecosystem matures** — distributed caching without Cloud Team ($50/mo), better GHA integration, broader community adoption
8. **Blacksmith adds personal account support** — removes the organization hard blocker; 3,000 free min/mo on faster hardware becomes immediately attractive

---

## Sources

### GitHub Actions
- [GitHub Actions Billing](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [GitHub Runner Pricing Reference](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- [GitHub-Hosted Runner Specs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [January 2026 Price Reduction](https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/)
- [December 2025 Pricing Announcement](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)

### CircleCI
- [CircleCI Pricing](https://circleci.com/pricing/)
- [CircleCI Docker Layer Caching](https://circleci.com/docs/guides/optimize/docker-layer-caching/)
- [CircleCI vs GHA Performance](https://circleci.com/blog/ci-cd-at-scale-circleci-vs-github-actions/)

### GitLab CI
- [GitLab Pricing](https://about.gitlab.com/pricing/)
- [GitLab CI for External Repos (GitHub)](https://docs.gitlab.com/ci/ci_cd_for_external_repos/github_integration/)
- [GitLab Monorepo Guide](https://docs.gitlab.com/user/project/repository/monorepos/)

### Buildkite
- [Buildkite Pricing](https://buildkite.com/pricing/)
- [Buildkite New Paid Plans](https://buildkite.com/resources/blog/new-paid-plans/)
- [Buildkite October 2025 Changelog](https://buildkite.com/resources/blog/changelog-roundup-october-2025-edition/)
- [Buildkite August 2025 Changelog](https://buildkite.com/resources/blog/changelog-roundup-august-2025-edition/)
- [Buildkite monorepo-diff Plugin](https://buildkite.com/resources/plugins/buildkite-plugins/monorepo-diff-buildkite-plugin/)

### Semaphore CI
- [Semaphore Pricing](https://semaphore.io/pricing)
- [Semaphore Machine Types](https://docs.semaphore.io/reference/machine-types)
- [Semaphore Monorepo Documentation](https://docs.semaphore.io/using-semaphore/monorepo)
- [Semaphore Goes Open Source (February 2025)](https://semaphore.io/semaphore-goes-open-source-today)

### Turborepo Remote Cache
- [Vercel Remote Cache (Free)](https://turbo.build/blog/free-vercel-remote-cache)
- [Turborepo Remote Caching Docs](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions)
- [Mercari Engineering — Turborepo Remote Cache Results](https://engineering.mercari.com/en/blog/entry/20260216-turborepo-remote-cache-accelerating-ci-to-move-fast/)
- [rharkor/caching-for-turbo](https://github.com/marketplace/actions/caching-for-turborepo)
- [ducktors/turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache)

### Depot
- [Depot Pricing](https://depot.dev/pricing)
- [Depot GitHub Actions Integration](https://depot.dev/docs/container-builds/integrations/github-actions)
- [Depot Cache — Turborepo Integration](https://depot.dev/docs/cache/integrations/turbo)
- [Introducing Depot Cache](https://depot.dev/blog/introducing-depot-cache)

### Dagger
- [Dagger GitHub Actions Integration](https://docs.dagger.io/getting-started/ci-integrations/github-actions/)
- [New Dagger Cloud Pricing](https://dagger.io/blog/new-dagger-cloud-pricing)
- [Dagger vs Current CI/CD State](https://medium.com/datamindedbe/dagger-vs-the-current-state-of-ci-cd-b2c6659dc97a)

### Faster Runners
- [Namespace Pricing](https://namespace.so/pricing)
- [Namespace Faster GitHub Actions](https://namespace.so/docs/features/faster-github-actions)
- [Blacksmith Pricing](https://www.blacksmith.sh/pricing)
- [Blacksmith Quickstart](https://docs.blacksmith.sh/introduction/quickstart)
- [WarpBuild Pricing](https://www.warpbuild.com/pricing)
- [RunsOn CPU Benchmarks 2026](https://runs-on.com/benchmarks/github-actions-cpu-performance/)
- [RunsOn Pricing](https://runs-on.com/pricing/)
- [GitHub Actions 2026 Pricing Changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/)

### Dependency Management
- [Renovate Documentation](https://docs.renovatebot.com/)
- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)

### Changesets
- [changesets/action](https://github.com/changesets/action)
- [Changesets Documentation](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
