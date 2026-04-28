# Graph Report - .  (2026-04-26)

## Corpus Check
- 112 files · ~146,330 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 468 nodes · 605 edges · 32 communities detected
- Extraction: 76% EXTRACTED · 23% INFERRED · 1% AMBIGUOUS · INFERRED: 139 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_ADR-001002 Design System & API Errors|ADR-001/002: Design System & API Errors]]
- [[_COMMUNITY_mbe CLI Commands|mbe CLI Commands]]
- [[_COMMUNITY_ServicePackage Topology|Service/Package Topology]]
- [[_COMMUNITY_ADR-006 Edge Routing Architecture|ADR-006: Edge Routing Architecture]]
- [[_COMMUNITY_Universal Eval Criteria + EmailHosting Domains|Universal Eval Criteria + Email/Hosting Domains]]
- [[_COMMUNITY_ACMM Maturity Model + Self-Healing|ACMM Maturity Model + Self-Healing]]
- [[_COMMUNITY_Auth & Database Provider Evaluations|Auth & Database Provider Evaluations]]
- [[_COMMUNITY_ADR-002 API Versioning Strategy|ADR-002: API Versioning Strategy]]
- [[_COMMUNITY_Cross-Domain Eval Criteria + AnalyticsJobsCacheStorage|Cross-Domain Eval Criteria + Analytics/Jobs/Cache/Storage]]
- [[_COMMUNITY_Hospitality Domain Decisions (HoldMasterOverride)|Hospitality Domain Decisions (Hold/MasterOverride)]]
- [[_COMMUNITY_CICD & Monorepo Tooling Evaluations|CI/CD & Monorepo Tooling Evaluations]]
- [[_COMMUNITY_Agent Self-Healing & CI Auto-Fix Decisions|Agent Self-Healing & CI Auto-Fix Decisions]]
- [[_COMMUNITY_Auth Architecture & Agent Security|Auth Architecture & Agent Security]]
- [[_COMMUNITY_Known Gotchas (Pre-commitCIReleaseDeploy)|Known Gotchas (Pre-commit/CI/Release/Deploy)]]
- [[_COMMUNITY_Observability Provider Evaluations|Observability Provider Evaluations]]
- [[_COMMUNITY_Generative UI PRD v1.2|Generative UI PRD v1.2]]
- [[_COMMUNITY_Alternative Static (non-progressive) si…|Alternative: Static (non-progressive) si…]]
- [[_COMMUNITY_Frontend Meta-Framework Domain|Frontend Meta-Framework Domain]]
- [[_COMMUNITY_Principle Surface actionable next steps…|Principle: Surface actionable next steps…]]
- [[_COMMUNITY_Real-Time Updates Domain|Real-Time Updates Domain]]
- [[_COMMUNITY_Payment Processing Domain|Payment Processing Domain]]
- [[_COMMUNITY_E2E Testing Framework Domain|E2E Testing Framework Domain]]
- [[_COMMUNITY_AI Providers (Generative UI) Domain|AI Providers (Generative UI) Domain]]
- [[_COMMUNITY_Generative UI Frameworks Domain|Generative UI Frameworks Domain]]
- [[_COMMUNITY_Root Signals (Agent Eval) Domain|Root Signals (Agent Eval) Domain]]
- [[_COMMUNITY_Misc 25|Misc 25]]
- [[_COMMUNITY_Misc 26|Misc 26]]
- [[_COMMUNITY_Misc 27|Misc 27]]
- [[_COMMUNITY_Misc 28|Misc 28]]
- [[_COMMUNITY_Misc 29|Misc 29]]
- [[_COMMUNITY_Misc 30|Misc 30]]
- [[_COMMUNITY_Misc 31|Misc 31]]

## God Nodes (most connected - your core abstractions)
1. `mbe CLI` - 27 edges
2. `Agent Service` - 24 edges
3. `Reservations Service` - 19 edges
4. `Rialto Design System` - 18 edges
5. `@mbe/auth` - 17 edges
6. `Users Service` - 16 edges
7. `Known Gotchas` - 15 edges
8. `@mbe/agent-core` - 15 edges
9. `ADR-006: Edge Routing Architecture [active]` - 15 edges
10. `CLAUDE.md (Claude Code Mandates)` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Change Tiers` --semantically_similar_to--> `Model Governance Tiering`  [INFERRED] [semantically similar]
  docs/change-tiers.md → AGENTS.md
- `Gen App (Dynamic UI)` --consumes--> `POST /api/gen/ui`  [INFERRED]
  AGENTS.md → services/agent/CLAUDE.md
- `@mbe/api-client` --consumed_by--> `apps/rialto-web (showcase consumer)`  [INFERRED]
  apps/hospitality/README.md → packages/rialto/CLAUDE.md
- `Ship Loop (Continuous Improvement)` --conceptually_related_to--> `ACMM 6-Level Rubric`  [INFERRED]
  CLAUDE.md → docs/acmm.md
- `ADR-001: Design System Unification (Rialto over Tailwind) [active]` --applies_to--> `Rialto Design System`  [INFERRED]
  docs/adr/ADR-001-rialto-over-tailwind.md → AGENTS.md

## Hyperedges (group relationships)
- **Ship Loop Continuous-Improvement Process** — concept_ship_loop, skill_ship_loop, skill_site_audit, skill_issue_worker, skill_ci_monitor, skill_progress_tracker, concept_remote_triggers, concept_label_state_machine, concept_self_evaluation_bias, concept_issue_enrichment_planner, concept_structured_failure_handoff [INFERRED 0.85]
- **ACMM Maturity Framework** — doc_acmm, concept_acmm_levels, concept_acmm_threshold_70, concept_acmm_anti_patterns, concept_reflection_log, skill_acmm_audit [EXTRACTED 0.95]
- **Agent Session Execution Stack** — concept_session_lifecycle, concept_worktree_isolation, concept_security_model, doc_worktree_lifecycle, package_agent_core, service_agent_api, tool_mbe_cli [INFERRED 0.90]
- **Auth Architecture Evolution** — adr_003_auth_architecture, adr_005_service_authentication, package_mbe_auth, provider_auth0 [INFERRED 0.90]
- **Edge Routing Evolution** — adr_004_edge_routing, adr_006_edge_routing_architecture, edge_router_worker [INFERRED 0.95]
- **Health Check Architecture Evolution** — adr_004_health_check_patterns, adr_006_health_check_architecture, endpoint_health_system, platform_do_app_platform [INFERRED 0.95]
- **Error Format / RFC 7807 Evolution** — adr_002_api_error_format, adr_003_error_handling_standard, package_mbe_types [INFERRED 0.90]
- **API Contract Cluster (versioning + errors)** — adr_002_api_versioning_strategy, adr_002_api_error_format, adr_003_error_handling_standard [INFERRED 0.80]
- **Selected Stack (cross-eval)** — eval_auth_chose_auth0, eval_jobs_chose_bullmq, eval_cache_chose_upstash_redis, eval_cicd_chose_github_actions, eval_db_chose_supabase, eval_db_alt_neon, eval_e2e_chose_playwright, eval_email_chose_resend, eval_frontend_chose_astro_marketing, eval_frontend_chose_vite_spa, eval_hosting_chose_railway, eval_hosting_alt_digitalocean, eval_iac_chose_pulumi, eval_monorepo_chose_pnpm, eval_monorepo_chose_turborepo, eval_monorepo_chose_changesets, eval_storage_chose_r2, eval_obs_chose_sentry, eval_payments_chose_stripe, eval_realtime_chose_sse, eval_analytics_chose_posthog, eval_routing_chose_cf_workers_static, eval_ai_chose_anthropic [INFERRED 0.85]
- **Strongest Alternatives (rejected)** — eval_auth_alt_clerk, eval_auth_alt_kinde, eval_db_alt_prisma_pg, eval_email_alt_postmark, eval_hosting_alt_flyio, eval_obs_alt_newrelic, eval_iac_alt_opentofu, eval_monorepo_alt_nx, eval_cicd_alt_circleci, eval_frontend_alt_react_router_v7, eval_ai_alt_vercel_ai_sdk [INFERRED 0.80]
- **Universal Criteria (cross-cutting)** — criterion_universal_free_tier, criterion_universal_solo_dev_fit, criterion_universal_typescript_dx, criterion_universal_vendor_lockin, criterion_universal_pulumi_iac [INFERRED 0.90]
- **One-man dev team philosophy applied across plans** — omdt_architecture, omdt_cheat_sheet, omdt_next_steps, omdt_playbook, principle_one_man_dev_team, plan_2026_02_27_agentic_workflows, plan_2026_01_31_hospitality_platform_roadmap [INFERRED 0.80]
- **Self-healing operations runbooks** — runbook_ci_unhealthy, runbook_deploys_unhealthy, runbook_services_unhealthy, runbook_static_sites_unhealthy [INFERRED 0.90]
- **ACMM improvement loop iteration 1 reflections** — reflection_actionable_reports_beat_comprehensive, reflection_trust_live_audit_output, principle_actionable_over_comprehensive, principle_trust_live_output, reflections_readme [EXTRACTED 0.95]
- **Hospitality feature lineage (chronological)** — feature_hospitality_core_operations, feature_hospitality_progressive_sidebar, feature_masteroverride_hold_splitflap, feature_tapechart_visual_coverage [INFERRED 0.85]
- **Agentic platform meta-system (harness + audit + self-healing)** — feature_harness_engineering, feature_layered_audit_system, feature_self_healing_pipeline [INFERRED 0.85]
- **MasterOverride feature evolution** — feature_masteroverride_hold_splitflap, feature_tapechart_visual_coverage [EXTRACTED 1.00]
- **Static sites deployed to Cloudflare Workers** — app_marketing, app_hospitality, app_rialto_web, app_gen, deploy_target_cloudflare_workers [EXTRACTED 1.00]
- **DigitalOcean App Platform services** — service_users, service_reservations, service_agent, deploy_target_do_app_platform [INFERRED 0.90]
- **mbe CLI command surface** — tool_cli_mbe, cli_command_mbe_agent_run, cli_command_mbe_agent_start, cli_command_mbe_agent_list, cli_command_mbe_agent_status, cli_command_mbe_agent_logs, cli_command_mbe_agent_cancel, cli_command_mbe_agent_delete, cli_command_mbe_agent_orchestrate, cli_command_mbe_pack, cli_command_mbe_prime, cli_command_mbe_sync_rules, cli_command_mbe_up, cli_command_mbe_new, cli_command_mbe_generate, cli_command_mbe_check_adr, cli_command_mbe_check_deps, cli_command_mbe_cleanup_worktrees, cli_command_mbe_stats, cli_command_mbe_login, cli_command_mbe_health, cli_command_mbe_loop, cli_command_mbe_users, cli_command_mbe_visual, cli_command_mbe_wave, cli_command_mbe_compound [EXTRACTED 1.00]
- **Rialto family (component lib + catalog + Claude plugin)** — package_rialto, package_rialto_catalog, package_rialto_plugin [EXTRACTED 1.00]
- **Cross-cutting infrastructure (auth + observability + sentry + api-client)** — package_auth, package_observability, package_sentry, package_api_client [INFERRED 0.85]
- **Type-safety stack (types + config)** — package_types, package_config [INFERRED 0.85]

## Communities

### Community 0 - "ADR-001/002: Design System & API Errors"
Cohesion: 0.06
Nodes (44): Alternative: Tailwind CSS, Consequence: Agents perform better with singular pattern, Consequence: Single styling source of truth, ADR-001: Design System Unification (Rialto over Tailwind) [active], Alternative: Custom JSON envelope {success, error, data}, Alternative: GraphQL errors, ADR-002: API Error Format (RFC 7807) [active], Consequence: Unified client-side error handling (+36 more)

### Community 1 - "mbe CLI Commands"
Cohesion: 0.05
Nodes (42): mbe agent cancel, mbe agent delete, mbe agent list, mbe agent logs, mbe agent orchestrate, mbe agent run, mbe agent start, mbe agent status (+34 more)

### Community 2 - "Service/Package Topology"
Cohesion: 0.07
Nodes (40): apps/hospitality, services/agent-api, services/reservations, services/users, @mbe/agent-core, Feedback Loop (poll PR comments + CI, dispatch fix sessions), Model Router (haiku/sonnet/opus tiering), Orchestrator (meta-agent decomposition via MCP) (+32 more)

### Community 3 - "ADR-006: Edge Routing Architecture"
Cohesion: 0.1
Nodes (30): ADR-006: Edge Routing Architecture [active], Alternative: Cloudflare CDN cache with purge-on-deploy, Alternative: Cloudflare Pages with _redirects/_headers, Alternative: Nginx reverse proxy on API server, Alternative: Separate subdomains per app, Gen App (Dynamic UI), Hospitality App, Marketing App (+22 more)

### Community 4 - "Universal Eval Criteria + Email/Hosting Domains"
Cohesion: 0.08
Nodes (31): Solo developer fit (universal criterion), TypeScript/SDK quality (universal criterion), Vendor lock-in / migration friction (universal criterion), Email & SMS Provider Domain, Hosting/PaaS Domain, IaC Tooling Domain, Neon (current, #2 stay+optimize), Branching/preview envs (criterion) (+23 more)

### Community 5 - "ACMM Maturity Model + Self-Healing"
Cohesion: 0.09
Nodes (28): ACMM Anti-Patterns (L4/L5/L6), ACMM 6-Level Rubric, ACMM 70% Threshold Walk, Cloudflare edge-router, Issue Enrichment Planner Phase, GitHub Label State Machine (ready→in-progress→has-pr), Langfuse LLM Observability, Model Governance Tiering (+20 more)

### Community 6 - "Auth & Database Provider Evaluations"
Cohesion: 0.09
Nodes (27): Pulumi IaC support (cross-domain criterion), Auth Provider Domain, Database Provider Domain, Clerk, AWS Cognito, Firebase Auth, Keycloak, Kinde (+19 more)

### Community 7 - "ADR-002: API Versioning Strategy"
Cohesion: 0.11
Nodes (24): ADR-002: API Versioning Strategy [active], Alternative: Header-only versioning (Accept media type), Alternative: No versioning, Alternative: Query-parameter versioning, Consequence: Path prefixes simplify routing & log filtering, DigitalOcean App Platform, AUTH_AUDIENCE, AUTH_AUTHORITY (+16 more)

### Community 8 - "Cross-Domain Eval Criteria + Analytics/Jobs/Cache/Storage"
Cohesion: 0.12
Nodes (24): Free tier generosity (universal criterion), Analytics & Feature Flags Domain, Background Jobs Domain, Caching Layer Domain, Object Storage Domain, Routing Architecture Domain, Flagsmith, LaunchDarkly (+16 more)

### Community 9 - "Hospitality Domain Decisions (Hold/MasterOverride)"
Cohesion: 0.11
Nodes (23): Alternative: DOM-based floor plan rendering, Alternative: Plain text status indicator (no split-flap), Alternative: Polymorphic status field instead of enum, Decision: Cancellation reason + note on Reservation, Decision: Hold state semantics for masteroverride, Decision: Konva canvas for floor plan rendering, Decision: Split-flap mechanical animation aesthetic, Decision: TableStatus enum (AVAILABLE/OCCUPIED/DIRTY/READY) (+15 more)

### Community 10 - "CI/CD & Monorepo Tooling Evaluations"
Cohesion: 0.11
Nodes (22): CI/CD Provider Domain, Monorepo Tooling Domain, Dagger, Depot, Turborepo Remote Cache (Vercel), Buildkite, CircleCI, GitLab CI (+14 more)

### Community 11 - "Agent Self-Healing & CI Auto-Fix Decisions"
Cohesion: 0.12
Nodes (19): Alternative: Manual-only CI fix workflow, Alternative: Single combined audit pass, Decision: Auto-fix simple CI failures, escalate complex ones, Decision: Self-tuning circuit breaker for agent loop, Decision: Agent harness observability instrumentation, Decision: Quality gates pipeline (lint/typecheck/tests/security), Decision: Inventory tracking for audit coverage, Decision: Parallel dispatch for audit speed (+11 more)

### Community 12 - "Auth Architecture & Agent Security"
Cohesion: 0.13
Nodes (16): Auth0 OIDC/JWT Integration, Circuit Breaker Pattern, Agent Security Model (Allowed/Blocked Tools), Agent Session Lifecycle, SSE Event Broadcaster, Git Worktree Isolation, Cloudflare Workers (Static Sites), DigitalOcean App Platform (+8 more)

### Community 13 - "Known Gotchas (Pre-commit/CI/Release/Deploy)"
Cohesion: 0.16
Nodes (15): Known Gotchas, Baseline CI checks fail on main, Changesets requires GITHUB_TOKEN, Changesets silently skips rialto CHANGELOG, GH Actions paid and active on PR, graphify-out not gitignored, /health is liveness only — use /api/v1/users/health, JSX unescaped apostrophe lint failure (+7 more)

### Community 14 - "Observability Provider Evaluations"
Cohesion: 0.2
Nodes (12): Observability/Monitoring Domain, Axiom, BetterStack, Datadog, Grafana Cloud (#3 vendor-neutral), LogRocket, New Relic (#2 free tier alt), PostHog (cross-domain) (+4 more)

### Community 15 - "Generative UI PRD v1.2"
Cohesion: 0.23
Nodes (12): Generative UI PRD v1.2, Dependency Graph (auto-generated), One-Man Dev Team Architecture, One-Man Dev Team Cheat Sheet, Restaurant Booking Platform Next Steps, One-Man Dev Team Playbook, Platform Design (2026-01-22), Hospitality Platform Roadmap (+4 more)

### Community 16 - "Alternative: Static (non-progressive) si…"
Cohesion: 0.18
Nodes (12): Alternative: Static (non-progressive) sidebar, Decision: AppBar motion curve / easing, Decision: AppBar scroll behavior (hide/show on scroll), Decision: Collapsed and expanded sidebar states, Decision: Progressive disclosure pattern, Hospitality Progressive Sidebar, Rialto Motion AppBar, Milestone: Sidebar layout skeleton (+4 more)

### Community 17 - "Frontend Meta-Framework Domain"
Cohesion: 0.28
Nodes (9): Frontend Meta-Framework Domain, Next.js (App Router), Nuxt, React Router v7 Framework Mode, SolidStart, SvelteKit, TanStack Start, Astro (chosen for marketing) (+1 more)

### Community 18 - "Principle: Surface actionable next steps…"
Cohesion: 0.28
Nodes (9): Principle: Surface actionable next steps over exhaustive detail, Principle: Re-run source of truth, don't recall summaries, Actionable reports beat comprehensive ones, Trust live audit output, not hand-summarized state, Reflections Log README, Runbook: CI Unhealthy, Runbook: Deploys Unhealthy, Runbook: API Services Unhealthy (+1 more)

### Community 19 - "Real-Time Updates Domain"
Cohesion: 0.6
Nodes (5): Real-Time Updates Domain, Ably, Pusher, WebSockets (@fastify/websocket), Server-Sent Events (chosen)

### Community 20 - "Payment Processing Domain"
Cohesion: 0.83
Nodes (4): Payment Processing Domain, PayPal / Braintree, Square, Stripe (chosen)

### Community 21 - "E2E Testing Framework Domain"
Cohesion: 1.0
Nodes (3): E2E Testing Framework Domain, Cypress, Playwright (chosen, stay)

### Community 22 - "AI Providers (Generative UI) Domain"
Cohesion: 1.0
Nodes (3): AI Providers (Generative UI) Domain, Vercel AI SDK + AI Gateway, Anthropic Claude (chosen path of least resistance)

### Community 23 - "Generative UI Frameworks Domain"
Cohesion: 0.67
Nodes (3): Generative UI Frameworks Domain, json-render (Vercel Labs), Tambo

### Community 24 - "Root Signals (Agent Eval) Domain"
Cohesion: 0.67
Nodes (3): Root Signals (Agent Eval) Domain, Existing success-evaluator + Langfuse (status quo), Root Signals / Scorable

### Community 25 - "Misc 25"
Cohesion: 1.0
Nodes (1): API Versioning Policy

### Community 26 - "Misc 26"
Cohesion: 1.0
Nodes (1): Cheatsheet

### Community 27 - "Misc 27"
Cohesion: 1.0
Nodes (1): Next Steps

### Community 28 - "Misc 28"
Cohesion: 1.0
Nodes (1): Secrets Management

### Community 29 - "Misc 29"
Cohesion: 1.0
Nodes (1): Security for AI Agents

### Community 30 - "Misc 30"
Cohesion: 1.0
Nodes (1): Ideal Stack — February 2026

### Community 31 - "Misc 31"
Cohesion: 1.0
Nodes (1): Chunk 2: Timeline Actions + Walk-ins

## Ambiguous Edges - Review These
- `ADR-002: API Error Format (RFC 7807) [active]` → `ADR-002: API Versioning Strategy [active]`  [AMBIGUOUS]
  docs/adr/ · relation: conflicts_with
- `ADR-003: Auth Architecture (Auth0 + Permissive) [active]` → `ADR-003: Error Handling Standard (RFC 7807) [active]`  [AMBIGUOUS]
  docs/adr/ · relation: conflicts_with
- `ADR-004: Edge Routing (Cloudflare Workers + Service Bindings) [active]` → `ADR-004: Health Check Patterns (two-tier) [active]`  [AMBIGUOUS]
  docs/adr/ · relation: conflicts_with
- `ADR-005: Agent Worktree Isolation [active]` → `ADR-005: Service Authentication (Auth0 OIDC + JWKS) [active]`  [AMBIGUOUS]
  docs/adr/ · relation: conflicts_with
- `ADR-006: Edge Routing Architecture [active]` → `ADR-006: Health Check Architecture [active]`  [AMBIGUOUS]
  docs/adr/ · relation: conflicts_with
- `Supabase Auth` → `Supabase (#1 recommended)`  [AMBIGUOUS]
  docs/evaluations/2026-02-26-database-providers.md · relation: conflicts_with

## Knowledge Gaps
- **234 isolated node(s):** `API Versioning Policy`, `Cheatsheet`, `Next Steps`, `Secrets Management`, `Security for AI Agents` (+229 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Misc 25`** (1 nodes): `API Versioning Policy`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc 26`** (1 nodes): `Cheatsheet`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc 27`** (1 nodes): `Next Steps`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc 28`** (1 nodes): `Secrets Management`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc 29`** (1 nodes): `Security for AI Agents`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc 30`** (1 nodes): `Ideal Stack — February 2026`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc 31`** (1 nodes): `Chunk 2: Timeline Actions + Walk-ins`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `ADR-002: API Error Format (RFC 7807) [active]` and `ADR-002: API Versioning Strategy [active]`?**
  _Edge tagged AMBIGUOUS (relation: conflicts_with) - confidence is low._
- **What is the exact relationship between `ADR-003: Auth Architecture (Auth0 + Permissive) [active]` and `ADR-003: Error Handling Standard (RFC 7807) [active]`?**
  _Edge tagged AMBIGUOUS (relation: conflicts_with) - confidence is low._
- **What is the exact relationship between `ADR-004: Edge Routing (Cloudflare Workers + Service Bindings) [active]` and `ADR-004: Health Check Patterns (two-tier) [active]`?**
  _Edge tagged AMBIGUOUS (relation: conflicts_with) - confidence is low._
- **What is the exact relationship between `ADR-005: Agent Worktree Isolation [active]` and `ADR-005: Service Authentication (Auth0 OIDC + JWKS) [active]`?**
  _Edge tagged AMBIGUOUS (relation: conflicts_with) - confidence is low._
- **What is the exact relationship between `ADR-006: Edge Routing Architecture [active]` and `ADR-006: Health Check Architecture [active]`?**
  _Edge tagged AMBIGUOUS (relation: conflicts_with) - confidence is low._
- **What is the exact relationship between `Supabase Auth` and `Supabase (#1 recommended)`?**
  _Edge tagged AMBIGUOUS (relation: conflicts_with) - confidence is low._
- **Why does `CLAUDE.md (Claude Code Mandates)` connect `ACMM Maturity Model + Self-Healing` to `ADR-006: Edge Routing Architecture`, `Known Gotchas (Pre-commit/CI/Release/Deploy)`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._