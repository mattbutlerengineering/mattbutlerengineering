# Product Charter

This monorepo is Matt Butler's engineering portfolio that works for a living: a
real hospitality SaaS demo, a design system, a generative-UI playground, and the
autonomous agent platform that builds all of it. Every feature should either
(a) make the hospitality demo feel like a product a small venue would pay for,
(b) make the platform more convincingly self-improving, or (c) showcase
engineering craft a hiring manager or client would notice in five minutes.

## How to use this file

This charter grounds `/ideate` (autonomous feature proposals). Themes are
intentionally coarse — 3 bullets max per app, revisited roughly quarterly.
Edit freely; PRs welcome. If a proposal cites no theme here and no signal
artifact, it should not exist.

## apps/hospitality — restaurant management SPA

- **Purpose:** Reservations, table management, floor plans, deposits, and guest
  tracking for small multi-venue operators (see
  `docs/plans/2026-01-31-hospitality-platform-roadmap.md`, Tier 1-2 scale).
- **Target user:** Owner-operator of 1-10 venues; front-of-house manager on a
  tablet; guests on the public booking widget.
- **Current themes:** (1) close the guest-facing loop — booking, cancellation,
  confirmation flows that feel production-grade; (2) operator daily workflow —
  dashboard, readiness, timeline views that answer "how is tonight going?";
  (3) polish the onboarding → first-booking journey shipped in July 2026.
- **Non-goals:** POS integration, payroll/staffing, multi-region scale,
  native mobile apps.

## apps/gen — generative UI playground

- **Purpose:** Renders Rialto components from JSON descriptions at runtime;
  demonstrates LLM-driven UI generation against a typed component catalog.
- **Target user:** Technical visitor evaluating the approach; Matt demoing
  catalog-constrained generation.
- **Current themes:** (1) tighten the prompt → render → refine loop;
  (2) showcase breadth of the Rialto catalog in generated output.
- **Non-goals:** Becoming a general-purpose app builder; user accounts beyond
  existing auth; persistence-heavy features.

## apps/rialto-web + packages/rialto — design system

- **Purpose:** Rialto component library and its interactive showcase/docs site.
- **Target user:** Consuming apps in this repo first; external evaluators of
  the design system second.
- **Current themes:** (1) fill component gaps the consuming apps actually hit;
  (2) accessibility and visual-regression rigor as a differentiator;
  (3) documentation pages that read as product, not a component dump.
- **Non-goals:** Theming marketplaces, Figma plugin tooling, supporting
  frameworks other than React.

## apps/marketing — mattbutlerengineering.com

- **Purpose:** Public portfolio site; the front door that routes to the demos.
- **Target user:** Hiring managers, prospective clients, curious engineers.
- **Current themes:** (1) surface the live proof — link visitors into
  hospitality/rialto/gen with context; (2) keep AI-health/metrics pages honest
  and current (they claim self-improvement; the data must back it).
- **Non-goals:** Blog platform, newsletter, CMS integration.

## services & platform (users, reservations, agent APIs; infra)

- **Purpose:** Fastify + Prisma APIs on DigitalOcean backing hospitality and
  the agent platform; Pulumi-managed infra; the autonomous improvement loop
  itself (implement-queue, sensors, ACMM).
- **Current themes:** (1) reliability of the booking/deposit state machines;
  (2) observability that feeds the sensor loop (the loop's own telemetry is a
  product surface); (3) keep the agent platform boring — proven patterns over
  novel machinery.
- **Non-goals:** New paid infrastructure, microservice proliferation,
  multi-cloud.

## Ideation guardrails (hard rules for /ideate)

1. **No new paid infrastructure** — features run on what is already deployed
   (Cloudflare Workers, existing DO app, Neon). Anything needing a new billed
   service is auto-out-of-scope.
2. **No auth-model changes** — Auth0 config, roles, and session handling are
   HITL-only territory.
3. **No schema-destructive features** — proposals may add tables/columns via
   additive migrations; anything dropping or rewriting existing data is out.
4. **≤1 proposal per app per batch** — spread batches across surfaces unless a
   signal is overwhelming (cite it).
5. **Every proposal cites ≥1 signal artifact** — a metrics file, an open
   `audit`/`sentry`/`ci-fix` issue, a lighthouse/uptime trend, or a TODO
   cluster. Charter alignment alone is not evidence.
6. **Scope to one implement-queue batch** — a proposal should decompose into
   3-10 agent-sized issues; anything larger needs to be split or rejected.
