# Marketing site reference

Page inventory, key components and the E2E spec inventory, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time a marketing file is read. The rules (Rialto-only UI, patterns, size limits, env vars, commands, deploy) stay in CLAUDE.md. The source of truth is `src/` and `e2e/`.

## Pages

| Page             | Route            | Description                                               |
| ---------------- | ---------------- | --------------------------------------------------------- |
| HomePage         | `/`              | Landing: hero, proof strip, projects, weekly CTA, contact |
| StatusPage       | `/status`        | Real-time health dashboard for APIs and static sites      |
| WeeklyIntakePage | `/weekly`        | Curated newsletter resources with source filtering        |
| MetricsPage      | `/metrics`       | ACMM quality metrics dashboard                            |
| ShippedIndexPage | `/shipped`       | Index of every feature the factory shipped, newest first  |
| ShippedStoryPage | `/shipped/:slug` | One shipped feature: proposal → children → PR verdicts    |
| NotFoundPage     | `*`              | 404 with suggested links                                  |

## Key Components

- `Navbar` — Navigation wrapper
- `HeroSection` — Landing hero
- `ProofStrip` — Build-time repo measurements (`data/repo-stats.ts`) as count-up figures
- `ProjectsSection` / `ProjectCard` — Featured projects, each with its stack inline
- `ContactSection` — Minimal "Elsewhere" links row

## E2E Tests

Playwright tests in `e2e/`, run in CI by the `Marketing E2E` job (`.github/workflows/e2e.yml`, advisory — see issue #3886):

| Test                      | Validates                                       |
| ------------------------- | ----------------------------------------------- |
| `a11y.test.ts`            | Accessibility (axe-core)                        |
| `ai-health.spec.ts`       | AI Health dashboard rendering + stale banner    |
| `mobile-overflow.spec.ts` | No horizontal overflow on real mobile viewports |
| `navigation.spec.ts`      | Navigation flows                                |
| `not-found.spec.ts`       | 404 handling                                    |
| `seo.spec.ts`             | SEO structure (headings)                        |
| `status.spec.ts`          | Status page health checks                       |
| `weekly.spec.ts`          | Weekly intake page                              |
