---
phase: 02-dashboard-rename
verified: 2026-02-28T18:45:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 2: Dashboard Rename Verification Report

**Phase Goal:** The dashboard app is renamed to hospitality with all routing, auth, and infrastructure config updated atomically
**Verified:** 2026-02-28T18:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | The app directory is `apps/hospitality` and the package name is `@mbe/hospitality` | VERIFIED | `apps/hospitality/` exists; `apps/dashboard/` absent; `package.json` name is `"@mbe/hospitality"` |
| 2 | Vite base, BrowserRouter basename, and Pulumi ingress all use `/hospitality/` | VERIFIED | `vite.config.ts`: `base: "/hospitality/"` ; `main.tsx`: `basename="/hospitality"` ; `index.ts` ingress prefix: `/hospitality` |
| 3 | Auth0 callback URLs reference `/hospitality/callback` (both localhost and production) | VERIFIED | `auth0.ts` localCallbacks: `http://localhost:3002/hospitality/callback`; prodCallbacks: `https://${domain}/hospitality/callback` |
| 4 | A 301 redirect from `/dashboard` to `/hospitality` exists in Pulumi ingress rules | VERIFIED | `index.ts` lines 46-57: redirect rule with `prefix: "/dashboard"`, `uri: "/hospitality"`, `redirectCode: 301` |
| 5 | No references to `/dashboard` or `@mbe/dashboard` remain in code, config, or IaC | VERIFIED | grep across `apps/`, `infrastructure/`, `services/`, `packages/`, `tools/` returns zero matches |
| 6 | CLAUDE.md and all codebase docs reference hospitality (not dashboard) for app-specific paths | VERIFIED | `CLAUDE.md` line 33: `/hospitality | Hospitality app | apps/hospitality`; `STRUCTURE.md` references `apps/hospitality`; auth skill uses `/hospitality/callback` |
| 7 | Auth skill example and evaluations updated to `/hospitality/callback` | VERIFIED | `.claude/skills/auth-package/SKILL.md` line 252: `VITE_AUTH_REDIRECT_URI=http://localhost:3002/hospitality/callback` |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/hospitality/package.json` | Package identity as `@mbe/hospitality` | VERIFIED | `"name": "@mbe/hospitality"` confirmed |
| `apps/hospitality/vite.config.ts` | Vite base `/hospitality/` and PWA manifest with hospitality naming | VERIFIED | `base: "/hospitality/"` ; manifest: `name: "MBE Hospitality"`, `scope: "/hospitality/"`, `start_url: "/hospitality/"` |
| `apps/hospitality/src/main.tsx` | BrowserRouter basename and Auth0 redirect URI using `/hospitality` | VERIFIED | `basename="/hospitality"` ; fallback redirectUri: `window.location.origin + "/hospitality/callback"` |
| `infrastructure/pulumi/auth0.ts` | Auth0 client renamed to `mattbutlerengineering-hospitality` with `/hospitality` callbacks | VERIFIED | Resource logical name `"mattbutlerengineering-hospitality"` ; `hospitalityApp` export; `hospitalityClientId` in `auth0Outputs` |
| `infrastructure/pulumi/index.ts` | Ingress rules with `/dashboard` redirect and `/hospitality` component | VERIFIED | `redirectCode: 301` present; `name: "hospitality"` static site; `hospitalityUrl` export; `auth0Outputs.hospitalityClientId` used in both marketing and hospitality envs |
| `CLAUDE.md` | Primary project docs with hospitality naming | VERIFIED | URL convention table, directory layout, and access points all reference `/hospitality` |
| `.planning/codebase/STRUCTURE.md` | Codebase structure reflecting hospitality directory | VERIFIED | `apps/hospitality/src/main.tsx` listed as entry point |
| `.claude/skills/auth-package/SKILL.md` | Auth skill with `/hospitality/callback` example | VERIFIED | Line 252 confirms correct redirect URI example |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/hospitality/vite.config.ts` | `infrastructure/pulumi/index.ts` | base path alignment: Vite `base: "/hospitality/"` matches ingress prefix `/hospitality` | WIRED | Both confirmed; Vite base produces assets at `/hospitality/*`; Pulumi ingress routes `/hospitality` prefix to hospitality static site with `preservePathPrefix: false` |
| `apps/hospitality/src/main.tsx` | `infrastructure/pulumi/auth0.ts` | Auth0 redirect URI alignment: `/hospitality/callback` in both app and IaC | WIRED | `main.tsx` fallback: `"/hospitality/callback"`; `auth0.ts` callbackUrls include both localhost and prod `/hospitality/callback` |
| `infrastructure/pulumi/index.ts` | `infrastructure/pulumi/auth0.ts` | Client ID reference: `hospitalityClientId` from `auth0Outputs` | WIRED | `index.ts` references `auth0Outputs.hospitalityClientId` three times (top-level export, marketing env, hospitality env) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| HOSP-01 | 02-01, 02-02 | Directory renamed from `apps/dashboard` to `apps/hospitality` | SATISFIED | `apps/hospitality/` exists; `apps/dashboard/` absent; git mv in commit `dbc3667` |
| HOSP-02 | 02-01 | Package name updated from `@mbe/dashboard` to `@mbe/hospitality` | SATISFIED | `package.json` name field confirmed as `@mbe/hospitality` |
| HOSP-03 | 02-01, 02-02 | URL path changed from `/dashboard` to `/hospitality` (Vite base, React Router basename) | SATISFIED | Three-way alignment: `vite.config.ts`, `main.tsx`, `index.ts` all verified |
| HOSP-04 | 02-01 | Auth0 callback URL updated to `/hospitality/callback` in Pulumi IaC | SATISFIED | Both `localCallbacks` and `prodCallbacks` in `auth0.ts` confirmed |
| INFRA-01 | 02-01 | Pulumi ingress rules for `/rialto`, `/hospitality`, and `/` (catch-all last) | SATISFIED | Ingress order verified: `/api`, `/dashboard` (301 redirect), `/hospitality` (component), `/rialto`, `/` (catch-all) |
| INFRA-02 | 02-01 | SPA fallback (`catchallDocument`) configured per app | SATISFIED | `catchallDocument: "index.html"` present for marketing, rialto-web, and hospitality static sites |
| INFRA-03 | 02-01, 02-02 | Vite `base`, React Router `basename`, and Pulumi ingress in sync per app | SATISFIED | Three-way alignment confirmed across all three files |

**Orphaned requirements:** None — all 7 requirement IDs declared in plan frontmatter are accounted for and marked complete in `REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODO, FIXME, HACK, PLACEHOLDER, or empty implementation patterns found in any of the key modified files.

### Human Verification Required

None — all checks are verifiable via static analysis of the codebase. The phase involves a pure rename with no runtime behavior changes beyond routing paths.

Note for deployment: After running `pulumi up`, the Auth0 client will be deleted and recreated (Pulumi resource rename), generating a new `client_id`. The local `apps/hospitality/.env` file will need `VITE_AUTH_CLIENT_ID` updated manually with the new value from `pulumi stack output`. This is a documented operational step, not a code gap.

### Gaps Summary

No gaps. All must-haves verified against actual codebase state. The phase goal — atomic rename of dashboard to hospitality across directory, package name, Vite config, React Router, Auth0 IaC, Pulumi ingress, cross-app links, and documentation — is fully achieved.

Commit trail confirmed:
- `dbc3667` — app directory and config rename (Task 1)
- `9a4eeec` — Pulumi IaC update (Task 2)
- `5a66cb4` — primary docs update (Plan 02, Task 1)
- `df52308` — evaluations, codebase docs, and skill files (Plan 02, Task 2)

---

_Verified: 2026-02-28T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
