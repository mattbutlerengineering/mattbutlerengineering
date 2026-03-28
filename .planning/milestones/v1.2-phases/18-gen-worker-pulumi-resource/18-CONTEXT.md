# Phase 18: Gen Worker Pulumi Resource - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the gen app CF Worker as a Pulumi-managed resource in the infrastructure stack, replacing the wrangler-only deployment for IaC compliance (INFRA-02). The Worker must reference Static Assets configuration consistent with the existing wrangler.toml.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation decisions delegated to Claude:

- **Scope:** Whether to migrate only the gen Worker or all 4 static Workers to Pulumi. INFRA-02 only requires gen, but consistency may favor migrating all.
- **CI deploy handoff:** Whether to keep `wrangler deploy` alongside Pulumi or have Pulumi fully own the Worker lifecycle. Must avoid drift between the two.
- **Static Assets approach:** How to handle the `[assets]` configuration (dist/ directory, SPA not_found_handling) within the Pulumi `cloudflare.WorkersScript` resource vs a dedicated Workers resource type.
- **Compatibility:** Ensuring `compatibility_date`, `not_found_handling`, and asset directory match the existing wrangler.toml exactly.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude to match existing IaC patterns from the Pulumi stack.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `infrastructure/pulumi/index.ts`: Full Pulumi stack with edge router, DO App Platform, DNS. Pattern for `cloudflare.WorkersScript` already established (edge router resource at line 204).
- `apps/gen/wrangler.toml`: Defines the Worker config — name `mattbutlerengineering-gen`, SPA not_found_handling, dist/ directory.

### Established Patterns
- Edge router Worker is Pulumi-managed (`cloudflare.WorkersScript` with `module: true`, `compatibilityDate`, bindings)
- Static site Workers (marketing, hospitality, rialto-web, gen) are wrangler-managed (`wrangler deploy` in CI)
- Service Bindings reference Workers by name string — the GEN binding already exists (line 217: `{ name: "GEN", service: "mattbutlerengineering-gen" }`)

### Integration Points
- `infrastructure/pulumi/index.ts` — new resource added here
- `.github/workflows/deploy-static.yml` — CI workflow that runs `wrangler deploy` for static apps
- `apps/gen/wrangler.toml` — source of truth for Worker config values

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-gen-worker-pulumi-resource*
*Context gathered: 2026-03-28*
