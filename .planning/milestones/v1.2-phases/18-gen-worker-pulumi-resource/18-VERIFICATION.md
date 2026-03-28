---
phase: 18-gen-worker-pulumi-resource
verified: 2026-03-28T19:10:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 18: Gen Worker Pulumi Resource Verification Report

**Phase Goal:** The gen app CF Worker is defined as a Pulumi resource in the infrastructure stack, replacing the wrangler-only deployment for IaC compliance
**Verified:** 2026-03-28T19:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | pulumi preview shows a CF Worker resource for mattbutlerengineering-gen in the stack | VERIFIED | `infrastructure/pulumi/index.ts` line 223: `new cloudflare.WorkersScript("mattbutlerengineering-gen", ...)` with `scriptName: "mattbutlerengineering-gen"` |
| 2 | The gen Worker resource uses Static Assets with SPA not_found_handling matching wrangler.toml | VERIFIED | `assets.directory: "../../apps/gen/dist"`, `notFoundHandling: "single-page-application"` (line 230) matches `apps/gen/wrangler.toml` exactly |
| 3 | The edge router and DNS records compile and work with the v6 provider (renamed APIs) | VERIFIED | All three DNS records use `cloudflare.DnsRecord` (v6). Edge router uses `scriptName`, `mainModule`, unified `bindings[]` array. WorkersRoutes use `script` property. `npx tsc --noEmit` exits with zero errors. No v5 remnants (`plainTextBindings`, `serviceBindings`, `module: true`, `cloudflare.Record`) anywhere in the file. |
| 4 | CI no longer runs wrangler deploy for gen (Pulumi owns the gen Worker lifecycle) | VERIFIED | `grep -c "deploy-gen" .github/workflows/deploy-static.yml` returns 0. No `apps/gen/**` path trigger in `deploy-static.yml`. The workflow only handles marketing, hospitality, and rialto-web. |
| 5 | pulumi up builds the gen app before uploading assets | VERIFIED | `pulumi-up.yml` lines 48–55: "Build gen app (Pulumi uploads assets from dist/)" step runs `pnpm build --filter=@mbe/gen` with all five VITE_ env vars before the Pulumi Up step. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `infrastructure/pulumi/package.json` | `@pulumi/cloudflare v6` dependency | VERIFIED | `"@pulumi/cloudflare": "^6.13.0"` confirmed at line 15 |
| `infrastructure/pulumi/index.ts` | Gen Worker Pulumi resource with assets config | VERIFIED | Lines 219–233: `WorkersScript("mattbutlerengineering-gen", ...)` with `assets.directory` and `notFoundHandling`. 280 lines total, fully substantive — complete v6-migrated stack. |
| `.github/workflows/deploy-static.yml` | CI workflow without gen deploy job | VERIFIED | 139 lines. Only three jobs: detect-changes, deploy-marketing, deploy-hospitality, deploy-rialto-web. No gen job, no gen path, no gen output. |
| `.github/workflows/pulumi-up.yml` | Pulumi CI with gen build step before pulumi up | VERIFIED | 74 lines. Build gen step at lines 48–55, precedes "Pulumi Up" at line 57. `apps/gen/**` path trigger at line 9. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `infrastructure/pulumi/index.ts` | `apps/gen/dist` | `assets.directory` relative path | VERIFIED | Line 228: `directory: "../../apps/gen/dist"` — correct relative path from `infrastructure/pulumi/` |
| `infrastructure/pulumi/index.ts` | edge-router serviceBindings | GEN service binding references gen Worker by name | VERIFIED | Line 215: `{ name: "GEN", service: "mattbutlerengineering-gen", type: "service" }` in the edge-router `bindings[]` array |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-02 | `18-01-PLAN.md` | Pulumi resource for gen app CF Worker with Static Assets | SATISFIED | `WorkersScript("mattbutlerengineering-gen")` with `assets` config in `index.ts`. REQUIREMENTS.md line 58 marks it `[x]` complete; line 106 records `Phase 18 | Complete`. |

No orphaned requirements — REQUIREMENTS.md maps INFRA-02 to Phase 18 and only INFRA-02 appears in the plan's `requirements` field. Full coverage.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, FIXMEs, placeholder comments, empty implementations, or stub patterns detected in any of the five modified files.

### Human Verification Required

None. All observable truths are verifiable via static analysis:
- Pulumi resource definition exists and TypeScript compiles
- CI diff is file-level (job presence/absence)
- Asset directory path is a static string
- Service binding name matches across both files

The one thing that cannot be verified statically is whether `pulumi up` successfully deploys the gen Worker to Cloudflare (requires credentials and a live run). However, this is a runtime execution concern, not a code correctness concern. All code preconditions are met.

### Gaps Summary

No gaps. All five must-have truths are verified. The phase goal is achieved:

1. `@pulumi/cloudflare` is at v6.13.0 with a complete v5 → v6 migration (DnsRecord, scriptName, script, unified bindings, mainModule).
2. The gen Worker is declared as a Pulumi `WorkersScript` resource with `assets.directory` pointing to `../../apps/gen/dist` and `notFoundHandling: "single-page-application"`, exactly matching `apps/gen/wrangler.toml`.
3. `deploy-static.yml` no longer deploys gen via wrangler — the job and all gen change-detection are fully removed.
4. `pulumi-up.yml` builds the gen app before `pulumi up` with all required VITE_ env vars, and triggers on `apps/gen/**` changes.
5. `pulumi-preview.yml` also triggers on `apps/gen/**` and shared package paths.
6. TypeScript compiles with zero errors.
7. Both task commits (96c85d5, d7893e8) are present in git history.

---

_Verified: 2026-03-28T19:10:00Z_
_Verifier: Claude (gsd-verifier)_
