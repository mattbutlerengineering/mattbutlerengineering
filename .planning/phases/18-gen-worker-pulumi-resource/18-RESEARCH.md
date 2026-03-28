# Phase 18: Gen Worker Pulumi Resource - Research

**Researched:** 2026-03-28
**Domain:** Pulumi Cloudflare provider — Workers Static Assets IaC
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

None — all implementation decisions delegated to Claude.

### Claude's Discretion

- **Scope:** Whether to migrate only the gen Worker or all 4 static Workers to Pulumi. INFRA-02 only requires gen, but consistency may favor migrating all.
- **CI deploy handoff:** Whether to keep `wrangler deploy` alongside Pulumi or have Pulumi fully own the Worker lifecycle. Must avoid drift between the two.
- **Static Assets approach:** How to handle the `[assets]` configuration (dist/ directory, SPA not_found_handling) within the Pulumi `cloudflare.WorkersScript` resource vs a dedicated Workers resource type.
- **Compatibility:** Ensuring `compatibility_date`, `not_found_handling`, and asset directory match the existing wrangler.toml exactly.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-02 | Pulumi resource for gen app CF Worker with Static Assets | Upgrade @pulumi/cloudflare v5→v6 enables WorkersScript with assets; directory upload + notFoundHandling both supported in v6 API |
</phase_requirements>

## Summary

The gen app CF Worker (`mattbutlerengineering-gen`) currently exists as a `wrangler deploy`-managed resource. The goal is to bring it under Pulumi IaC. The installed `@pulumi/cloudflare` v5.49.1 does NOT support the `[assets]` configuration needed for Workers Static Assets — this capability only exists in v6.x (released January 2026), which tracks the Terraform Cloudflare provider v5.11.0+ that added Workers Static Assets upload in October 2025.

The `@pulumi/cloudflare` v6 upgrade involves 1,622 breaking changes (the upstream Terraform provider migrated from SDKv2 to Plugin Framework), including resource renames like `cloudflare.Record` → `cloudflare.DnsRecord`. However, many of these changes are state-level migrations that Pulumi handles automatically on first `pulumi up`. The existing stack currently uses `cloudflare.WorkersScript`, `cloudflare.WorkersRoute`, `cloudflare.Record`, and `digitalocean.App` — all of these need to be audited for v6 compat before upgrading.

There is an alternative "lighter" approach: use a Pulumi `@pulumi/command` resource to shell out to `wrangler deploy`, tracking file hash changes. This avoids the provider upgrade but means Pulumi only records execution, not actual resource state. This approach has meaningful drift risk because two systems would own the same Worker.

**Primary recommendation:** Upgrade `@pulumi/cloudflare` to v6, add a `cloudflare.WorkersScript` resource for the gen Worker with `assets.config.notFoundHandling: "single-page-application"` and `assets.directory: "../../apps/gen/dist"`, and remove the `wrangler deploy` step for gen from CI. Migrate all other Workers simultaneously (marketing, hospitality, rialto-web) to complete the IaC picture and avoid a partial upgrade state.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @pulumi/cloudflare | ^6.13.0 | Cloudflare IaC provider | Only version with WorkersScript assets support |
| @pulumi/pulumi | ^3.145.0 | Pulumi core SDK (already installed) | No change needed |

### The Version Gap: v5 vs v6

This is the central finding of this research.

| Feature | v5.49.1 (installed) | v6.13.0 (required) |
|---------|---------------------|---------------------|
| WorkersScript assets | NOT SUPPORTED | Supported via `assets.config` |
| notFoundHandling | Not available | `"single-page-application"` supported |
| assets.directory | Not available | Supported — provider uploads files |
| cloudflare.Record | Exists | Renamed to `cloudflare.DnsRecord` |
| WorkersScript.name | `name` property | `scriptName` property |
| State migration | N/A | Required on first `pulumi up` |

**Key insight:** Cloudflare's Terraform provider v5.11.0 (October 2025) added Workers Static Assets upload. `@pulumi/cloudflare` v6 tracks this. v5 Pulumi packages do not have it. There is no backport.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @pulumi/cloudflare v6 WorkersScript | @pulumi/command wrapping wrangler deploy | Avoids provider upgrade risk, but no real resource ownership, drift inevitable |
| Full v6 upgrade (all resources) | Partial upgrade (gen only) | Not possible — it's a package-level version change, all resources upgrade together |

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are confined to:

```
infrastructure/pulumi/
├── index.ts               # Add gen WorkersScript resource here
├── package.json           # Upgrade @pulumi/cloudflare to ^6.13.0
└── node_modules/          # Reinstall after version bump

.github/workflows/
└── deploy-static.yml      # Remove gen deploy job once Pulumi owns the Worker

apps/gen/
└── dist/                  # Built output — Pulumi uploads this at pulumi up time
```

### Pattern 1: WorkersScript with Static Assets (v6 API)

**What:** Add a `cloudflare.WorkersScript` resource with `assets` block instead of bare `content`.
**When to use:** Any Workers Static Assets Worker — pure static, SPA routing, no custom Worker script needed.

```typescript
// Source: https://www.pulumi.com/registry/packages/cloudflare/api-docs/workersscript/
// Requires @pulumi/cloudflare v6.x
const genWorker = new cloudflare.WorkersScript("mattbutlerengineering-gen", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-gen",  // NOTE: v6 uses scriptName, not name
  compatibilityDate: "2026-03-25",
  assets: {
    directory: "../../apps/gen/dist",        // relative to infrastructure/pulumi/
    config: {
      notFoundHandling: "single-page-application",
    },
  },
});
```

**Critical difference from v5:** `name` → `scriptName`. If you use `name` in v6, it will fail TypeScript compilation.

### Pattern 2: v5→v6 Provider Upgrade in package.json

```json
// infrastructure/pulumi/package.json
{
  "dependencies": {
    "@pulumi/cloudflare": "^6.13.0",   // was "^5.49.0"
    "@pulumi/pulumi": "^3.145.0",       // no change
    "@pulumi/digitalocean": "^4.35.0",  // no change
    "@pulumi/auth0": "^3.11.0"          // no change
  }
}
```

Then: `cd infrastructure/pulumi && pnpm install`

### Pattern 3: DnsRecord (v6 renamed from Record)

The existing DNS records in `index.ts` use `cloudflare.Record`. In v6 this is `cloudflare.DnsRecord`. All existing Record resources must be updated:

```typescript
// Before (v5):
const dnsRecord = new cloudflare.Record("mattbutlerengineering-dns", { ... });
const apiDns = new cloudflare.Record("mattbutlerengineering-api-dns", { ... });
const wwwRecord = new cloudflare.Record("mattbutlerengineering-www-dns", { ... });

// After (v6):
const dnsRecord = new cloudflare.DnsRecord("mattbutlerengineering-dns", { ... });
const apiDns = new cloudflare.DnsRecord("mattbutlerengineering-api-dns", { ... });
const wwwRecord = new cloudflare.DnsRecord("mattbutlerengineering-www-dns", { ... });
```

Pulumi performs automatic state migration on `pulumi up` but the TypeScript source must use the new class name to compile.

### Pattern 4: WorkersRoute — check for name changes

The existing stack uses `cloudflare.WorkersRoute`. Verify this class still exists in v6 (it does — confirmed in registry). No rename detected.

### Pattern 5: Existing edge-router WorkersScript — scriptName migration

The edge-router resource at line 204 of `index.ts` uses `new cloudflare.WorkersScript(...)` with property `name`. In v6 this must become `scriptName`:

```typescript
// Before (v5):
const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/edge-router.js", "utf-8"),
  module: true,
  ...
});

// After (v6):
const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/edge-router.js", "utf-8"),  // still required for JS workers
  ...
});
```

### Anti-Patterns to Avoid

- **Keeping wrangler deploy in CI alongside Pulumi for the same Worker:** Two systems owning the same resource causes drift on every CI run. Pulumi's state will not match what wrangler deployed, causing spurious diffs or errors on next `pulumi up`.
- **Using `@pulumi/command` to shell wrangler:** Only valid if you explicitly decide NOT to give Pulumi true resource ownership. This is a workaround, not IaC.
- **Upgrading only the gen Worker, leaving others wrangler-managed:** Results in an inconsistent stack where some Workers are IaC-managed and others are not. Fine for this phase scope, but creates long-term debt.
- **Running `pulumi up` without first running `pnpm build --filter=@mbe/gen`:** Pulumi uploads from `apps/gen/dist/` at plan/apply time. If dist doesn't exist, the upload fails.
- **Trying to add assets to a `WorkersScript` in @pulumi/cloudflare v5:** TypeScript will compile (no `assets` property on the type), but the API call will ignore the field. The Worker will be created without assets.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Asset upload to CF | Custom script computing hashes and calling CF API | @pulumi/cloudflare v6 WorkersScript assets.directory | Provider handles manifest generation, hash computation, chunked upload, deduplication |
| Wrangler-to-Pulumi drift tracking | Custom hash-based triggers in @pulumi/command | @pulumi/cloudflare v6 WorkersScript | Provider tracks resource state natively, computes diffs properly |
| SPA not-found routing | Custom Worker script intercepting 404s | assets.config.notFoundHandling: "single-page-application" | Platform-level feature, no Worker code needed |

**Key insight:** The `@pulumi/cloudflare` v6 provider replicates exactly what `wrangler deploy` does for static assets — directory scanning, content hashing, manifest generation, partial uploads. There is no need to keep wrangler in the loop for the gen Worker once Pulumi owns it.

## Common Pitfalls

### Pitfall 1: @pulumi/cloudflare v5 assets TypeScript gap

**What goes wrong:** Developer adds `assets` property to `WorkersScript` in v5.49. TypeScript does not error (property may be unknown/any). Provider silently ignores the `assets` field. Worker deploys without static assets.
**Why it happens:** v5 `WorkersScriptArgs` interface has no `assets` property. TypeScript strict mode would catch this; loose configs would not.
**How to avoid:** Upgrade to v6 first, then add the gen Worker resource. The TypeScript types confirm you're on the right version.
**Warning signs:** `pulumi preview` shows `WorkersScript` resource created but no asset upload activity; `wrangler.toml` config not reflected.

### Pitfall 2: `name` vs `scriptName` property in v6

**What goes wrong:** Copy-paste from existing edge-router WorkersScript uses `name` property. v6 `WorkersScript` requires `scriptName`. TypeScript compilation fails OR worse, the property is silently ignored.
**Why it happens:** The upstream Terraform provider renamed `name` to `script_name` in its v5 release, which maps to `scriptName` in Pulumi v6.
**How to avoid:** In v6, always use `scriptName`. The TypeScript type `WorkersScriptArgs` will have `scriptName` as a required field.
**Warning signs:** TypeScript error "Object literal may only specify known properties, and 'name' does not exist in type WorkersScriptArgs."

### Pitfall 3: Record → DnsRecord type error blocks compilation

**What goes wrong:** After upgrading to @pulumi/cloudflare v6, existing `cloudflare.Record` calls produce TypeScript error "Property 'Record' does not exist on type typeof cloudflare."
**Why it happens:** `cloudflare.Record` was renamed to `cloudflare.DnsRecord` in the v6 provider.
**How to avoid:** In the same PR that bumps @pulumi/cloudflare to v6, update all three Record instances in `index.ts` to `DnsRecord`. This is a mechanical rename — no property changes needed.
**Warning signs:** `pnpm typecheck` in `infrastructure/pulumi/` fails after version bump.

### Pitfall 4: assets.directory path is relative to Pulumi project root

**What goes wrong:** Path to `apps/gen/dist` is wrong, causing "directory not found" error during `pulumi up`.
**Why it happens:** The Pulumi project root is `infrastructure/pulumi/`. The dist directory is at `../../apps/gen/dist` relative to that.
**How to avoid:** Use `"../../apps/gen/dist"` as the directory value. Alternatively, use `path.join(__dirname, "../../apps/gen/dist")` with Node.js `path` module for explicit resolution.
**Warning signs:** `pulumi preview` or `pulumi up` errors with "ENOENT: no such file or directory, scandir '../../apps/gen/dist'"

### Pitfall 5: Pulumi uploads stale dist/ if build not run first

**What goes wrong:** `pulumi up` succeeds but serves an outdated version of the gen app.
**Why it happens:** The Pulumi resource uploads whatever is in `apps/gen/dist/` at the time of `pulumi up`. If you haven't run `pnpm build --filter=@mbe/gen` first, dist/ contains a previous build or nothing.
**How to avoid:** The `pulumi up` workflow (CI or manual) must include a build step before running Pulumi. This is a fundamental change from the wrangler workflow where the CI job always built before deploying.
**Warning signs:** Deployed app shows old content despite code changes. No error from Pulumi since the directory exists.

### Pitfall 6: CI still runs wrangler deploy for gen after Pulumi takes ownership

**What goes wrong:** Both `pulumi up` (infra CI) and `wrangler deploy` (static CI) overwrite each other's Worker. On every run, one system's state is clobbered. Pulumi next `pulumi up` detects drift and tries to re-upload.
**Why it happens:** The `deploy-static.yml` workflow has a `deploy-gen` job that runs `wrangler deploy` for every push to `apps/gen/**`. If Pulumi now owns the gen Worker, this job must be removed.
**How to avoid:** Delete the `deploy-gen` job from `.github/workflows/deploy-static.yml` as part of this phase. Also remove `apps/gen/**` and related packages from the `detect-changes` paths filter.
**Warning signs:** `pulumi preview` shows a diff on every run even when nothing changed in IaC; CI logs show both `wrangler deploy` and `pulumi up` running for gen.

## Code Examples

Verified patterns from official sources and local type inspection:

### Complete gen Worker resource (v6)

```typescript
// Source: https://www.pulumi.com/registry/packages/cloudflare/api-docs/workersscript/ (v6.13.0)
// infrastructure/pulumi/index.ts — add after the edge-router WorkersScript

const genWorker = new cloudflare.WorkersScript("mattbutlerengineering-gen", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-gen",
  compatibilityDate: "2026-03-25",   // matches apps/gen/wrangler.toml
  assets: {
    directory: "../../apps/gen/dist",  // relative to infrastructure/pulumi/
    config: {
      notFoundHandling: "single-page-application",  // matches wrangler.toml
    },
  },
});
```

### Edge-router updated for v6

```typescript
// Source: local type inspection of @pulumi/cloudflare v6 WorkersScriptArgs
const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-edge-router",  // was: name
  content: readFileSync("../worker/edge-router.js", "utf-8"),
  compatibilityDate: "2026-03-25",
  plainTextBindings: [
    { name: "API_ORIGIN", text: `https://api.${domain}` },
  ],
  serviceBindings: [
    { name: "MARKETING", service: "mattbutlerengineering-marketing" },
    { name: "HOSPITALITY", service: "mattbutlerengineering-hospitality" },
    { name: "RIALTO", service: "mattbutlerengineering-rialto-web" },
    { name: "GEN", service: "mattbutlerengineering-gen" },
  ],
});
```

### DNS Records renamed in v6

```typescript
// Source: https://www.pulumi.com/registry/packages/cloudflare/api-docs/dnsrecord/ (v6.13.0)
// cloudflare.Record → cloudflare.DnsRecord
const dnsRecord = new cloudflare.DnsRecord("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "AAAA",
  content: "100::",
  proxied: true,
  ttl: 1,
});
```

### CI: Remove gen wrangler deploy

```yaml
# .github/workflows/deploy-static.yml
# REMOVE: the entire deploy-gen job
# REMOVE: apps/gen/** paths from detect-changes triggers
# KEEP: all other jobs (marketing, hospitality, rialto-web)
```

### Pulumi import for existing wrangler-deployed Worker

```bash
# If gen Worker already exists from prior wrangler deploys, import it into Pulumi state
# Run from infrastructure/pulumi/
pulumi import cloudflare:index/workersScript:WorkersScript mattbutlerengineering-gen \
  "<CLOUDFLARE_ACCOUNT_ID>/mattbutlerengineering-gen"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wrangler.toml for all Workers | @pulumi/cloudflare v6 WorkersScript with assets | Oct 2025 (CF TF v5.11) | IaC can fully own static asset Workers |
| @pulumi/cloudflare v5 (WorkersScript no assets) | @pulumi/cloudflare v6 (assets.config.notFoundHandling) | Jan 2026 (Pulumi v6.0.0) | Provider-level assets upload support |
| cloudflare.Record | cloudflare.DnsRecord | v6.0.0 | Requires TypeScript rename, state auto-migrated |
| WorkersScript `name` property | WorkersScript `scriptName` property | v6.0.0 | TypeScript rename required |

**Deprecated/outdated:**
- `cloudflare.Record`: Replaced by `cloudflare.DnsRecord` in v6. The old class name no longer exists.
- `cloudflare.WorkerScript` (without 's'): Deprecated in favor of `cloudflare.WorkersScript` (with 's'). Was deprecated in v5 too.
- `WorkersScript.name` property (in v6): Replaced by `scriptName`. Using `name` causes TypeScript error.

## Open Questions

1. **Does the v6 WorkersScript `module` property still exist?**
   - What we know: The edge-router Worker uses `module: true`. The v6 API schema may have removed or changed this.
   - What's unclear: Whether v6 WorkersScript still has a `module` boolean or handles this differently.
   - Recommendation: Check `@pulumi/cloudflare@6` TypeScript types after installing. If missing, the edge-router may need to use a different property (possibly `modules` array).

2. **Does the v6 provider require the gen dist/ to exist at `pulumi preview` time?**
   - What we know: Terraform/Pulumi providers typically scan the directory during plan phase to compute the asset manifest hash for the diff.
   - What's unclear: Whether `pulumi preview` requires a built dist/ or only `pulumi up` does.
   - Recommendation: Build the gen app before running either `pulumi preview` or `pulumi up`. Treat the build as a prerequisite for any Pulumi operation.

3. **Do all 4 static Workers (marketing, hospitality, rialto-web, gen) need to be migrated, or just gen?**
   - What we know: INFRA-02 only requires gen. Other 3 remain wrangler-managed.
   - What's unclear: Whether a partial migration (Pulumi owns gen, wrangler owns others) causes any platform-level issues with Service Bindings or Worker lifecycles.
   - Recommendation: Migrate gen only (INFRA-02 scope). The 4 Workers are independent — Service Bindings reference Workers by name string, not by who deployed them.

## Sources

### Primary (HIGH confidence)

- Local `@pulumi/cloudflare@5.49.1` type declarations (`workersScript.d.ts`, `index.d.ts`) — confirmed v5 has NO assets property in WorkersScript
- [Pulumi Cloudflare Registry - WorkersScript v6](https://www.pulumi.com/registry/packages/cloudflare/api-docs/workersscript/) — confirmed v6 API with assets.config.notFoundHandling
- [Pulumi Cloudflare Registry - DnsRecord v6](https://www.pulumi.com/registry/packages/cloudflare/api-docs/dnsrecord/) — confirmed Record renamed to DnsRecord
- [Cloudflare Changelog - Workers Static Assets Terraform support](https://developers.cloudflare.com/changelog/post/2025-10-09-assets-terraform/) — confirmed CF TF v5.11.0 added assets upload
- [pulumi-cloudflare v6.0.0 release notes](https://github.com/pulumi/pulumi-cloudflare/releases/tag/v6.0.0) — confirmed 1,622 breaking changes, state migration required
- `npm view @pulumi/cloudflare version` — confirmed latest is 6.13.0
- Local `infrastructure/pulumi/index.ts` — confirmed existing edge-router pattern and GEN Service Binding at line 217

### Secondary (MEDIUM confidence)

- [Cloudflare SST issue #5947](https://github.com/sst/sst/issues/5947) — confirmed notFoundHandling="single-page-application" works in updated provider (was buggy, now fixed)
- [Pulumi + Wrangler tutorial](https://developers.cloudflare.com/pulumi/tutorial/dynamic-provider-and-wrangler/) — confirmed wrangler+Pulumi coexistence patterns; wrangler-driven approach is an official pattern for non-IaC assets

### Tertiary (LOW confidence — needs validation)

- v6 `module` property existence for WorkersScript: Not confirmed from type declarations (package not yet installed). Check after upgrading.
- Exact behavior of `pulumi preview` when `apps/gen/dist/` does not exist: Inferred from provider behavior patterns, not directly verified.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed by npm, local type inspection, official registry
- Architecture: HIGH — v6 API confirmed from official Pulumi registry docs
- Pitfalls: HIGH for v5/v6 gap and name/scriptName issues (type-confirmed); MEDIUM for path and CI drift (inferred from patterns)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable provider; @pulumi/cloudflare v6 is current, unlikely to break in 30 days)
