# Auth Provider Evaluation — February 2026

## Current State

| Dimension                | Value                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| **Auth provider**        | Auth0 (free tier, Okta-owned)                                      |
| **Auth0 domain**         | `dev-ytbgmz5ls3wh4xdx.us.auth0.com`                                |
| **API identifier**       | `https://api.mattbutlerengineering.com`                            |
| **Auth package**         | `@mbe/auth` — generic OIDC (zero Auth0-specific code)              |
| **Frontend library**     | `react-oidc-context` (standard OIDC)                               |
| **Backend verification** | `jose` (JWKS/JWT, standard)                                        |
| **IaC**                  | Pulumi TypeScript (`@pulumi/auth0`)                                |
| **Features used**        | Login, JWT verification, auto-create user on first login           |
| **Features NOT used**    | Social login, MFA, organizations, custom rules/actions, M2M tokens |
| **Monthly auth cost**    | $0 (free tier)                                                     |

### Architecture

```
┌──────────────┐     OIDC Authorization Code + PKCE     ┌──────────────────┐
│  React SPA   │ ◄──────────────────────────────────────►│  Auth Provider    │
│  (dashboard) │     4 env vars: authority, clientId,    │  (Auth0 today)   │
│              │     redirectUri, audience               │                  │
└──────┬───────┘                                         └────────┬─────────┘
       │ Bearer token (JWT)                                       │ JWKS endpoint
       ▼                                                          ▼
┌──────────────┐     jose: jwtVerify() + JWKS            ┌──────────────────┐
│  Fastify API │ ◄──────────────────────────────────────►│  /.well-known/   │
│  (users)     │     Standard JWT verification           │  jwks.json       │
└──────────────┘                                         └──────────────────┘
```

### Key Finding: Zero Vendor Lock-In

The auth integration is **purely OIDC/JWT** with no Auth0-specific libraries:

- **`packages/auth/`**: Types (`OIDCConfig`, `JWTPayload`, `AuthUser`), React hooks (`useAuth()`, `useAccessToken()`, `useRequireAuth()`), Fastify plugin (JWKS-based JWT verification). All use `react-oidc-context` + `jose`.
- **`apps/hospitality/src/main.tsx`**: `AuthProvider` with 4 config values. Any OIDC provider works.
- **`services/users/src/routes/users.ts`**: Inline JWT verification via `jose` + JWKS. Auto-creates user on first login (upsert).
- **`infrastructure/pulumi/auth0.ts`**: Resource Server (RS256, 24hr token), SPA Client (authorization_code + refresh_token, rotating), Client Grant.

**Migration to any OIDC-compliant provider: change env vars + rewrite Pulumi auth config. No application code changes.**

### Pain Points & Motivations

- **No social login** — Users must create email/password accounts; no "Sign in with Google/GitHub"
- **No MFA** — Available on Auth0 free tier but not configured
- **No prebuilt UI** — Using Auth0's Universal Login (adequate but not customizable without paid plan)
- **Pricing cliff** — Auth0 free tier is 25K MAU; Professional starts at $240/mo with no intermediate option
- **Feature planning** — Want to understand what each provider unlocks (social login, MFA, user management) before needing them

---

## Evaluation Criteria

| Criterion                           | Why It Matters                                                |
| ----------------------------------- | ------------------------------------------------------------- |
| **Pricing at 1K / 10K / 100K MAUs** | Budget planning as user base grows                            |
| **Free tier generosity**            | MAU limit and feature restrictions on free plan               |
| **OIDC/OAuth2 compliance**          | Can swap provider without application code changes?           |
| **Prebuilt UI components**          | Login forms, user profile, account management                 |
| **Social login support**            | Google, GitHub, etc. — reduces signup friction                |
| **MFA support**                     | TOTP, SMS, WebAuthn/passkeys                                  |
| **User management dashboard**       | Admin UI for viewing/managing users                           |
| **Pulumi IaC provider**             | Current stack is Pulumi TypeScript — hard requirement         |
| **SDK ecosystem**                   | React hooks, Node.js/Fastify integration                      |
| **Migration friction from Auth0**   | Effort to switch; password hash export; user data portability |
| **Enterprise features**             | SSO, SCIM, organizations — future-proofing                    |
| **Self-hosted option**              | Full control, no per-MAU cost at scale                        |

---

## Provider Classification

| Category                | Providers                           | Characteristics                                              |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------ |
| **Managed SaaS**        | Auth0, Clerk, WorkOS, Stytch, Kinde | Hosted auth service; per-MAU pricing; managed infrastructure |
| **Cloud Platform Auth** | Firebase Auth, AWS Cognito          | Auth bundled with cloud ecosystem; platform lock-in risk     |
| **BaaS-Bundled**        | Supabase Auth                       | Auth tied to Supabase database platform                      |
| **Self-Hosted**         | Keycloak                            | Open-source, self-managed; flat infrastructure cost          |
| **DIY Library**         | Lucia/Oslo/Arctic                   | Code libraries, not a service; developer builds everything   |

---

## Provider Profiles

### 1. Auth0 (Current)

Universal OIDC/OAuth2 provider, acquired by Okta in 2021. The most widely adopted auth-as-a-service platform. Free tier expanded to 25K MAU in September 2024.

| Criterion               | Details                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (free tier covers up to 25K MAU)                                                |
| **Pricing (10K MAU)**   | $0 (free tier)                                                                     |
| **Pricing (100K MAU)**  | Custom Enterprise pricing (~$500–2,000+/mo)                                        |
| **Free tier**           | 25K MAU; unlimited social connections; basic MFA; no custom domains; no SCIM       |
| **OIDC compliance**     | Full — certified OpenID Connect provider                                           |
| **Prebuilt UI**         | Universal Login (React-based, customizable on paid plans); Lock widget             |
| **Social login**        | 70+ providers (Google, GitHub, Microsoft, Facebook, Apple, etc.)                   |
| **MFA**                 | TOTP, SMS, WebAuthn, push notifications — available on free tier                   |
| **User management**     | Full dashboard; user search, blocking, impersonation; activity logs                |
| **Pulumi provider**     | `@pulumi/auth0` — mature, full coverage, actively maintained                       |
| **SDK ecosystem**       | `auth0-react`, `auth0-spa-js`, `node-auth0`; but project uses generic OIDC instead |
| **Migration friction**  | N/A (already in use)                                                               |
| **Enterprise features** | SSO (Enterprise plan), SCIM (Enterprise), Organizations, Custom Domains            |
| **Self-hosted**         | Not available                                                                      |

**Pricing trap:** The B2C Essentials plan ($35/mo base + $0.07/MAU overage) is more expensive than Professional at most scales. At 10K MAU, Essentials costs ~$700/mo vs Professional at $240/mo. Professional ($240/mo for up to 20K MAU) is the only rational paid on-ramp.

**Key risk:** Pricing cliff from free ($0) to Professional ($240/mo) with no intermediate tier. Okta ownership raises concerns about continued investment in the developer-focused product vs enterprise Okta.

---

### 2. Clerk

Developer-first auth with the best prebuilt React components in the market. Uses Monthly Retained Users (MRU) instead of MAU — new users who churn within 24 hours are not counted ("First Day Free"). Major pricing update on February 5, 2026 raised the free tier from 10K to 50K MRU.

| Criterion               | Details                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (Hobby plan covers up to 50K MRU)                                                                                    |
| **Pricing (10K MAU)**   | $0 (Hobby plan)                                                                                                         |
| **Pricing (100K MAU)**  | ~$1,025/mo (Pro: $25/mo + $0.020/MRU for 50K overage)                                                                   |
| **Free tier**           | 50K MRU (expanded from 10K in February 2026); unlimited apps                                                            |
| **OIDC compliance**     | Full OIDC provider; standard authorization code + PKCE                                                                  |
| **Prebuilt UI**         | Best-in-class: `<SignIn />`, `<UserButton />`, `<UserProfile />`, `<OrganizationSwitcher />` — drop-in React components |
| **Social login**        | 20+ providers (Google, GitHub, Microsoft, Apple, Discord, etc.)                                                         |
| **MFA**                 | TOTP, SMS, WebAuthn — Pro plan and above                                                                                |
| **User management**     | Excellent dashboard; user search, impersonation, session management                                                     |
| **Pulumi provider**     | None — no Terraform provider either. Dashboard-only config. **Hard blocker.**                                           |
| **SDK ecosystem**       | `@clerk/clerk-react`, `@clerk/nextjs`, `@clerk/express`; no Fastify adapter (manual integration)                        |
| **Migration friction**  | Low app code change; official open-source Auth0 migration tool (`clerk/migration-tool`)                                 |
| **Enterprise features** | Organizations, roles, permissions; no SCIM provisioning                                                                 |
| **Self-hosted**         | Not available                                                                                                           |

**Key strength:** The React component library is unmatched. `<SignIn />` handles the entire auth flow with customizable themes. `<UserButton />` provides avatar, profile, and sign-out in one component.

**Key risk:** No Pulumi or Terraform provider means auth configuration cannot be managed as IaC. This is a hard blocker for this project's infrastructure-as-code workflow.

---

### 3. WorkOS

Enterprise-first auth provider. AuthKit provides free consumer auth (up to 1M MAU), but the business model is enterprise SSO and directory sync sold per-connection.

| Criterion               | Details                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (AuthKit free through 1M MAU)                                                      |
| **Pricing (10K MAU)**   | $0 (AuthKit free)                                                                     |
| **Pricing (100K MAU)**  | $0 for auth alone; $125/connection/mo for enterprise SSO                              |
| **Free tier**           | 1,000,000 MAU for AuthKit — most generous free tier in the market                     |
| **OIDC compliance**     | Full OIDC provider                                                                    |
| **Prebuilt UI**         | AuthKit — open-source, built on Radix UI (`workos/authkit`); clean, customizable      |
| **Social login**        | Limited: Google, Microsoft, GitHub only (3 providers)                                 |
| **MFA**                 | TOTP only — no SMS, no WebAuthn/passkeys                                              |
| **User management**     | Dashboard with user search, organization management                                   |
| **Pulumi provider**     | None — no Terraform provider either. **Hard blocker.**                                |
| **SDK ecosystem**       | `@workos-inc/node`; documented against Express (no Fastify adapter)                   |
| **Migration friction**  | Medium — standard OIDC but limited social provider list may be a downgrade            |
| **Enterprise features** | Best-in-class: SSO (SAML + OIDC), SCIM directory sync, Admin Portal, JIT provisioning |
| **Self-hosted**         | Not available                                                                         |

**Key strength:** 1M free MAUs is extraordinary. If you need enterprise SSO/SCIM later, WorkOS is purpose-built for it with per-connection pricing that scales predictably.

**Key risk:** Only 3 social providers and TOTP-only MFA limits consumer-facing features. No Pulumi provider is a hard blocker.

---

### 4. Supabase Auth (GoTrue)

Auth service bundled with the Supabase BaaS platform. Built on GoTrue, an open-source auth server. Tightly integrated with Supabase's PostgreSQL database. Launched OAuth 2.1 server mode (public beta, November 2025).

| Criterion               | Details                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (free tier: 50K MAU, bundled with Supabase)                                                    |
| **Pricing (10K MAU)**   | $0 (free tier)                                                                                    |
| **Pricing (100K MAU)**  | ~$188/mo (Pro: $25/mo base + $0.00325/MAU overage) — cheapest managed option                      |
| **Free tier**           | 50K MAU; bundled with 500 MB database, 1 GB storage, 2 GB bandwidth                               |
| **OIDC compliance**     | Full OAuth 2.1 + OIDC provider (public beta November 2025)                                        |
| **Prebuilt UI**         | `@supabase/auth-ui-react` — basic but functional login form components                            |
| **Social login**        | Google, GitHub, Apple, Facebook, Discord, Twitter, Azure, and more                                |
| **MFA**                 | TOTP, phone OTP — available on all plans                                                          |
| **User management**     | Supabase Dashboard — user management integrated with database explorer                            |
| **Pulumi provider**     | None — no official Pulumi provider. **Hard blocker.**                                             |
| **SDK ecosystem**       | `@supabase/supabase-js`; tight coupling to Supabase client                                        |
| **Migration friction**  | High — requires Supabase-managed PostgreSQL; incompatible with Neon without running two databases |
| **Enterprise features** | SAML 2.0 SSO (Pro+); Row-level security (RLS) integration; no SCIM                                |
| **Self-hosted**         | Yes — GoTrue is open-source; Supabase self-hosted via Docker                                      |

**Key strength:** At ~$188/mo for 100K MAU (Pro plan), it's the cheapest managed auth at scale.

**Key risk:** Two hard blockers: (1) No Pulumi provider, (2) Requires Supabase-managed PostgreSQL, which conflicts with the project's Neon database.

---

### 5. Firebase Auth

Google's auth service with a generous free tier. Part of the Firebase/GCP ecosystem. Mature and battle-tested at massive scale. Can be used standalone without other Firebase services.

| Criterion               | Details                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (Spark plan: free for most auth features)                                                                              |
| **Pricing (10K MAU)**   | $0 (Spark plan)                                                                                                           |
| **Pricing (100K MAU)**  | ~$275/mo (Blaze: $0.0055/MAU beyond 50K free tier)                                                                        |
| **Free tier**           | 50K MAU for email/password and social; phone auth: 10K SMS/mo free (US)                                                   |
| **OIDC compliance**     | Partial — Firebase issues custom tokens; standard OIDC available via Google Cloud Identity Platform                       |
| **Prebuilt UI**         | FirebaseUI — functional but dated; React support lags                                                                     |
| **Social login**        | Google, Facebook, Apple, GitHub, Microsoft, Twitter, Yahoo; 10+ providers                                                 |
| **MFA**                 | SMS, TOTP (Identity Platform required for TOTP); no WebAuthn                                                              |
| **User management**     | Firebase Console — basic user management; limited search/filtering                                                        |
| **Pulumi provider**     | Partial — `@pulumi/gcp` manages Firebase app registration; auth configuration (providers, MFA, templates) not declarative |
| **SDK ecosystem**       | `firebase/auth` — massive ecosystem; `reactfire` for React; `firebase-admin` for Node.js                                  |
| **Migration friction**  | Medium — custom token format requires auth package changes; not standard OIDC without extra configuration                 |
| **Enterprise features** | Multi-tenancy (Identity Platform); blocking functions; no SSO/SCIM                                                        |
| **Self-hosted**         | Not available                                                                                                             |

**Key strength:** Generous free tier (50K MAU), massive ecosystem, and Google-scale reliability.

**Key risk:** Not a standard OIDC provider — would require changes to the `@mbe/auth` package, breaking the zero-vendor-lock-in advantage. Partial Pulumi support. Google platform deprecation risk.

---

### 6. AWS Cognito

AWS-native auth service. Fully managed user pools with OIDC compliance. Underwent major pricing restructure in November 2024 introducing Lite, Essentials, and Plus tiers.

| Criterion               | Details                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (Lite free tier: 10K MAU; legacy accounts: 50K MAU)                                    |
| **Pricing (10K MAU)**   | $0 (Lite free tier)                                                                       |
| **Pricing (100K MAU)**  | ~$495/mo (Lite: $0.0055/MAU) or ~$1,350/mo (Essentials: $0.015/MAU)                       |
| **Free tier**           | Lite: 10K MAU (new accounts); Essentials: 10K MAU; legacy: 50K MAU                        |
| **OIDC compliance**     | Full — standard OIDC provider; authorization code + PKCE; JWKS endpoint                   |
| **Prebuilt UI**         | Managed Login — improved October 2025 but historically poor; Amplify UI components better |
| **Social login**        | Google, Facebook, Apple, Amazon; SAML/OIDC federation for enterprise IdPs                 |
| **MFA**                 | SMS, TOTP, email OTP (Essentials); passkeys/WebAuthn (Essentials); adaptive MFA (Plus)    |
| **User management**     | AWS Console — functional but buried in AWS UI complexity                                  |
| **Pulumi provider**     | `@pulumi/aws` — mature, full Cognito coverage                                             |
| **SDK ecosystem**       | `@aws-amplify/auth`, `@aws-sdk/client-cognito-identity-provider`; no Fastify adapter      |
| **Migration friction**  | High — **no password hash export** (users must reset passwords on migration out)          |
| **Enterprise features** | User pool federation, SAML, Lambda triggers, Advanced Security (adaptive auth)            |
| **Self-hosted**         | Not available                                                                             |

**Key strength:** Full Pulumi support via `@pulumi/aws` — the only alternative to Auth0 with production-grade IaC. 50K free MAU on legacy accounts.

**Key risk:** Essentials tier pricing ($0.015/MAU) is prohibitively expensive. **No password hash export** — migrating away forces all users to reset passwords. This is a vendor trap.

---

### 7. Stytch

Passwordless-first auth provider. API-driven architecture with magic links, WebAuthn/passkeys, and OTP as primary authentication methods. Separate B2C and B2B product lines.

| Criterion               | Details                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (Consumer free: 5K MAU; B2B free: 1K MAU + 25 orgs)                                 |
| **Pricing (10K MAU)**   | ~$500/mo ($0.10/MAU beyond 5K free)                                                    |
| **Pricing (100K MAU)**  | ~$9,500/mo — most expensive provider evaluated                                         |
| **Free tier**           | Consumer: 5K MAU; B2B: 1K MAU + 25 organizations                                       |
| **OIDC compliance**     | Full — Connected Apps provides standard OIDC (authorization code + PKCE, JWKS)         |
| **Prebuilt UI**         | `@stytch/react` — pre-built components for magic link, OTP, passkey flows              |
| **Social login**        | Google, Apple, Facebook, GitHub, Microsoft, Discord, and more                          |
| **MFA**                 | WebAuthn/passkeys, TOTP, SMS OTP, email OTP — passwordless-native                      |
| **User management**     | Dashboard with user search, session management, device fingerprinting                  |
| **Pulumi provider**     | None. **Hard blocker.**                                                                |
| **SDK ecosystem**       | `@stytch/react`, `stytch` (Node.js) with TypeScript; no Fastify adapter                |
| **Migration friction**  | Medium — standard OIDC but passwordless-first flow differs from current email/password |
| **Enterprise features** | Best-in-class B2B: SCIM, JIT provisioning, org-level RBAC, M2M tokens                  |
| **Self-hosted**         | Not available                                                                          |

**Key strength:** Purpose-built for passwordless/passkey auth. B2B features (SCIM, JIT provisioning, org RBAC) are genuinely excellent.

**Key risk:** $0.10/MAU is the most expensive per-MAU pricing by a wide margin. 5K free MAU is the least generous. No Pulumi provider.

---

### 8. Kinde

Newer auth entrant (founded 2022) with a generous free tier and built-in feature flags. B2B focus with organizations and permissions in the core product.

| Criterion               | Details                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | $0 (free tier: 10,500 MAU)                                                                  |
| **Pricing (10K MAU)**   | $0 (free tier)                                                                              |
| **Pricing (100K MAU)**  | ~$1,535/mo (Plus: $75/mo base + $0.0163/MAU for 89.5K overage)                              |
| **Free tier**           | 10,500 MAU — most generous of any managed auth SaaS (excluding WorkOS)                      |
| **OIDC compliance**     | Full — standard authorization code + PKCE; JWKS endpoint                                    |
| **Prebuilt UI**         | Hosted login pages; `@kinde-oss/kinde-auth-react` components                                |
| **Social login**        | Google, Facebook, Apple, GitHub, Microsoft, LinkedIn, GitLab, Bitbucket, Discord            |
| **MFA**                 | TOTP, SMS OTP, email OTP — all plans including free                                         |
| **User management**     | Dashboard with user, organization, and permissions management                               |
| **Pulumi provider**     | None. **Hard blocker.**                                                                     |
| **SDK ecosystem**       | `@kinde-oss/kinde-auth-react`, `@kinde-oss/kinde-typescript-sdk`; community Fastify support |
| **Migration friction**  | Low — standard OIDC; Auth0 migration guides available                                       |
| **Enterprise features** | Organizations, roles, permissions, SAML SSO (Plus+), feature flags — all built-in           |
| **Self-hosted**         | Not available                                                                               |

**Unique feature:** Feature flags built directly into auth tokens as a `feature_flags` JWT claim. Eliminates a separate LaunchDarkly/Statsig dependency.

**Key risk:** No Pulumi or Terraform provider. Relatively new company — less battle-tested. Plus plan pricing steep once past free tier.

**Watchlist:** If Kinde ships a Pulumi/Terraform provider, it immediately becomes the top migration candidate (generous free tier + feature flags + full OIDC).

---

### 9. Lucia / Oslo / Arctic (DIY Libraries)

Lucia was a popular open-source auth library for Node.js. **Deprecated in March 2025.** The project pivoted to an educational resource at `lucia-auth.com`, recommending developers compose three standalone libraries: **Arctic** (OAuth2 consumer, 50+ providers), **Oslo** (cryptographic primitives), and a custom session store.

| Criterion               | Details                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| **Pricing**             | Free (open-source libraries)                                     |
| **OIDC compliance**     | No — DIY session implementation cannot act as an OIDC provider   |
| **Prebuilt UI**         | None — build everything from scratch                             |
| **Social login**        | Arctic supports 50+ OAuth2 providers                             |
| **MFA**                 | Oslo provides TOTP primitives; developer implements everything   |
| **User management**     | None — build your own admin dashboard                            |
| **Pulumi provider**     | N/A (not a service)                                              |
| **SDK ecosystem**       | `arctic`, `oslo` — well-typed TypeScript libraries               |
| **Migration friction**  | Very high — complete rewrite of auth layer; lose OIDC compliance |
| **Enterprise features** | None — build everything yourself                                 |
| **Self-hosted**         | By definition (library in your codebase)                         |

**Key risk:** Developer responsible for all security concerns: timing attacks, session fixation, CSRF, TOTP clock drift, token rotation. Single maintainer (pilcrow) — bus factor risk. Not OIDC compliant.

**Verdict:** Not recommended. Would trade a managed, OIDC-compliant system for a custom, non-standard implementation with significant security maintenance burden.

---

### 10. Keycloak

Open-source identity and access management server (Red Hat). Java/Quarkus-based. Formally certified by the OpenID Foundation — the strongest OIDC compliance of any provider evaluated. Flat infrastructure cost regardless of MAU count.

| Criterion               | Details                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| **Pricing (1K MAU)**    | ~$24/mo (4 GB DigitalOcean Droplet) — flat, unlimited MAU                                         |
| **Pricing (10K MAU)**   | ~$24/mo                                                                                           |
| **Pricing (100K MAU)**  | ~$24/mo                                                                                           |
| **Free tier**           | Free software (Apache 2.0); infrastructure cost only                                              |
| **OIDC compliance**     | Formally OpenID Certified — strongest compliance of any provider                                  |
| **Prebuilt UI**         | Full login UI with themes; drag-and-drop authentication flow editor                               |
| **Social login**        | 15+ providers (Google, GitHub, Microsoft, Facebook); SAML/OIDC federation                         |
| **MFA**                 | TOTP, WebAuthn/FIDO2, hardware keys; fully customizable auth flows                                |
| **User management**     | Full Admin Console — user management, realm settings, client configuration                        |
| **Pulumi provider**     | Community only (`mrparkers/terraform-provider-keycloak` bridge) — unofficial                      |
| **SDK ecosystem**       | `keycloak-js` (frontend); standard OIDC (works with `react-oidc-context`)                         |
| **Migration friction**  | Medium — standard OIDC means existing app code works unchanged; server setup/maintenance required |
| **Enterprise features** | Full: SSO, SAML, SCIM (via extension), Organizations (v24+), fine-grained authorization           |
| **Self-hosted**         | Yes — the only option (or managed via Phase Two, Elest.io, Skycloak)                              |

**Key strength:** At $24/mo flat, cheapest option once past ~5K MAU on most paid providers. Unlimited MAUs. Formally OIDC certified. Existing `@mbe/auth` code works unchanged.

**Key risk:** Java/Quarkus requires minimum 4 GB RAM (base heap ~1,250 MB). Cannot run on App Platform — requires separate Droplet. Self-hosted = managing patches, upgrades, backups. Community-only Pulumi provider. Significant ops overhead for a solo developer.

---

## Comparison Table

### Pricing

| Provider                 | Free Tier (MAU) | Cost at 1K | Cost at 10K | Cost at 100K              |
| ------------------------ | --------------- | ---------- | ----------- | ------------------------- |
| **Auth0**                | 25,000          | $0         | $0          | ~$500–2,000+ (Enterprise) |
| **Clerk**                | 50,000 MRU      | $0         | $0          | ~$1,025                   |
| **WorkOS**               | 1,000,000       | $0         | $0          | $0                        |
| **Supabase Auth**        | 50,000          | $0         | $0          | ~$188                     |
| **Firebase Auth**        | 50,000          | $0         | $0          | ~$275                     |
| **Cognito (Lite)**       | 10,000          | $0         | $0          | ~$495                     |
| **Cognito (Essentials)** | 10,000          | $0         | $0          | ~$1,350                   |
| **Stytch**               | 5,000           | $0         | ~$500       | ~$9,500                   |
| **Kinde**                | 10,500          | $0         | $0          | ~$1,535                   |
| **Keycloak**             | ∞ (self-hosted) | ~$24       | ~$24        | ~$24                      |
| **Lucia/Oslo**           | ∞ (DIY)         | $0         | $0          | $0                        |

### Features

| Provider       | OIDC           | Prebuilt UI        | Social Login     | MFA                       | Pulumi             | Enterprise                |
| -------------- | -------------- | ------------------ | ---------------- | ------------------------- | ------------------ | ------------------------- |
| **Auth0**      | ✅ Full        | ✅ Universal Login | ✅ 70+           | ✅ TOTP/SMS/WebAuthn/Push | ✅ `@pulumi/auth0` | ✅ SSO/SCIM (Enterprise)  |
| **Clerk**      | ✅ Full        | ✅ Best-in-class   | ✅ 20+           | ✅ TOTP/SMS/WebAuthn      | ❌ None            | ⚠️ Orgs/Roles (no SCIM)   |
| **WorkOS**     | ✅ Full        | ✅ AuthKit (Radix) | ⚠️ 3 only        | ⚠️ TOTP only              | ❌ None            | ✅ Best SSO/SCIM          |
| **Supabase**   | ✅ Full (beta) | ⚠️ Basic           | ✅ 10+           | ⚠️ TOTP/Phone             | ❌ None            | ⚠️ SAML only              |
| **Firebase**   | ⚠️ Partial     | ⚠️ Dated           | ✅ 10+           | ⚠️ SMS/TOTP               | ⚠️ Partial         | ⚠️ Multi-tenancy          |
| **Cognito**    | ✅ Full        | ⚠️ Poor UX         | ✅ 4+ Federation | ✅ SMS/TOTP/Passkeys      | ✅ `@pulumi/aws`   | ✅ Federation/Triggers    |
| **Stytch**     | ✅ Full        | ✅ Good            | ✅ 6+            | ✅ Passwordless-native    | ❌ None            | ✅ Best B2B               |
| **Kinde**      | ✅ Full        | ✅ Good            | ✅ 9+            | ✅ TOTP/SMS/Email         | ❌ None            | ✅ Orgs/Permissions/Flags |
| **Keycloak**   | ✅ Certified   | ✅ Full + themes   | ✅ 15+           | ✅ TOTP/WebAuthn/FIDO2    | ⚠️ Community       | ✅ Full                   |
| **Lucia/Oslo** | ❌ None        | ❌ None            | ✅ 50+ (Arctic)  | ⚠️ DIY                    | N/A                | ❌ None                   |

### Migration Compatibility

| Provider       | App Code Changes     | Pulumi Changes                | Password Migration   | Effort      |
| -------------- | -------------------- | ----------------------------- | -------------------- | ----------- |
| **Auth0**      | None (current)       | None                          | N/A                  | None        |
| **Clerk**      | None (OIDC)          | Rewrite to Dashboard-only     | Auth0 migration tool | Low         |
| **WorkOS**     | None (OIDC)          | Rewrite to Dashboard-only     | Manual               | Low         |
| **Supabase**   | Minor (custom JWT)   | Rewrite (no Pulumi)           | Manual               | Medium–High |
| **Firebase**   | Rewrite auth package | Partial rewrite               | Manual               | Medium      |
| **Cognito**    | None (OIDC)          | Rewrite to `@pulumi/aws`      | ⚠️ No hash export    | Medium      |
| **Stytch**     | None (OIDC)          | Rewrite to Dashboard-only     | Manual               | Low         |
| **Kinde**      | None (OIDC)          | Rewrite to Dashboard-only     | Migration guide      | Low         |
| **Keycloak**   | None (OIDC)          | Rewrite to community provider | Import from Auth0    | Medium      |
| **Lucia/Oslo** | Full rewrite         | N/A                           | Full rewrite         | Very High   |

---

## Eliminated Providers

### Hard Blocker: No Pulumi IaC Provider

| Provider   | Elimination Reason                                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clerk**  | No Pulumi or Terraform provider. Dashboard-only config. Despite best-in-class React components and generous 50K free MRU, cannot be managed as infrastructure-as-code. **Top watchlist candidate** if they ship a provider. |
| **WorkOS** | No Pulumi or Terraform provider. Despite 1M free MAU and best enterprise SSO/SCIM. Limited to 3 social providers and TOTP-only MFA further reduces appeal.                                                                  |
| **Stytch** | No Pulumi provider. Combined with the most expensive per-MAU pricing ($0.10/MAU, ~$9,500/mo at 100K), there is no compelling path for this project. Excellent for passwordless-first B2B products.                          |
| **Kinde**  | No Pulumi or Terraform provider. Despite generous 10,500 MAU free tier, built-in feature flags, and full OIDC. **Second watchlist candidate** — compelling combination if IaC support ships.                                |

### Hard Blocker: Incompatible Architecture

| Provider              | Elimination Reason                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase Auth**     | Requires Supabase-managed PostgreSQL; incompatible with Neon without a second database. No Pulumi provider. Three hard blockers combined.                                           |
| **Lucia/Oslo/Arctic** | Deprecated (March 2025). Not an OIDC provider — would break zero-lock-in architecture. Massive security maintenance burden. Single maintainer. Moving backwards from current state. |

### Eliminated on Fit

| Provider          | Elimination Reason                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firebase Auth** | Not a standard OIDC provider without extra Google Cloud Identity Platform configuration. Would require `@mbe/auth` package changes, breaking zero-lock-in advantage. Partial Pulumi support. Google deprecation risk.                         |
| **AWS Cognito**   | Most expensive at scale (Essentials: ~$1,350/mo at 100K MAU). Worst developer experience. **No password hash export** — migration out forces all users to reset passwords (vendor trap). November 2024 pricing restructure widely criticized. |

---

## Recommended Shortlist

### #1 Auth0 — Stay (Recommended)

Auth0 remains the best fit across all criteria:

1. **Only provider with full Pulumi IaC support** — `@pulumi/auth0` is mature and actively maintained. Uniquely valuable; no other provider matches.
2. **25K free MAU** — More than sufficient for current and near-term growth.
3. **Full OIDC compliance** — Powers the project's zero-lock-in architecture.
4. **70+ social providers** — Adding "Sign in with Google/GitHub" is a configuration change, not a code change.
5. **MFA on free tier** — TOTP, SMS, WebAuthn available without paying.
6. **Proven at scale** — Battle-tested by millions of applications.

**Action items to improve current setup (all configuration-only, no code changes):**

1. Enable social login (Google, GitHub)
2. Enable MFA (TOTP at minimum)
3. Customize Universal Login branding
4. Monitor MAU count — alert at 20K MAU to plan for pricing cliff

**Pricing plan when exceeding 25K MAU:** Jump to B2C Professional at $240/mo. Skip Essentials (it's a pricing trap). At that scale, re-evaluate alternatives.

### #2 AWS Cognito — Strongest Alternative with Pulumi

If Auth0's pricing becomes untenable or Okta makes concerning product decisions:

1. **Full Pulumi support** via `@pulumi/aws` — the only alternative with production-grade IaC.
2. **Standard OIDC** — existing `@mbe/auth` code works unchanged (change 4 env vars).
3. **AWS ecosystem integration** — if the project moves to AWS for hosting, Cognito integrates natively.

**Trade-offs:** Poor Hosted UI (would need custom login page). Essentials tier pricing is expensive. **No password hash export** — once on Cognito, migrating away forces user password resets. This is a one-way door.

**Migration path:**

1. Create Cognito User Pool via Pulumi (`@pulumi/aws`)
2. Configure OIDC client (authorization_code + PKCE)
3. Change 4 env vars (authority, clientId, redirectUri, audience)
4. No application code changes
5. Import existing users (Auth0 → Cognito user import)

### #3 Keycloak — Self-Hosted Escape Hatch

If per-MAU pricing becomes unsustainable at scale (>50K MAU):

1. **Flat $24/mo** regardless of MAU count — cheapest at scale.
2. **Formally OIDC Certified** — strongest protocol compliance; existing app code works unchanged.
3. **Full feature set** — social login, MFA, SSO, SAML, admin console, theme engine.
4. **No vendor dependency** — open-source, self-managed, full data ownership.

**Trade-offs:** Requires separate 4 GB Droplet ($24/mo). Java/JVM overhead. Self-hosted ops burden (patches, upgrades, monitoring). Community-only Pulumi provider.

**When to consider:** When monthly auth costs exceed ~$100/mo, the fixed $24/mo becomes economically compelling. At 100K MAU, Auth0 could cost $500–2,000+/mo vs Keycloak at $24/mo flat.

---

## Self-Hosted vs Managed Analysis

| Factor                      | Self-Hosted (Keycloak)                           | Managed SaaS (Auth0, Clerk, etc.)      |
| --------------------------- | ------------------------------------------------ | -------------------------------------- |
| **Monthly cost**            | ~$24/mo flat (4 GB Droplet)                      | $0–2,000+/mo (scales with MAU)         |
| **Cost at 100K MAU**        | ~$24/mo                                          | $188–9,500/mo depending on provider    |
| **Time cost**               | 2–5 hrs/mo (updates, patches, monitoring)        | ~0 hrs/mo                              |
| **Security responsibility** | You apply patches, manage TLS, review CVEs       | Provider handles all security          |
| **OIDC compliance**         | Formally certified (strongest)                   | Varies (Auth0: full; Supabase: beta)   |
| **Feature completeness**    | Full (SSO, SAML, SCIM, themes, flows)            | Varies by provider and tier            |
| **Scaling**                 | Vertical (bigger Droplet) or cluster (complex)   | Automatic (provider-managed)           |
| **Recovery time**           | Hours (manual intervention, restore from backup) | Minutes (provider auto-recovery)       |
| **Vendor lock-in**          | None (open-source, standard OIDC)                | Medium (some providers trap passwords) |
| **IaC support**             | Community Pulumi/Terraform                       | Auth0: excellent; most others: none    |
| **JVM overhead**            | 4 GB RAM minimum; 15–30s startup                 | N/A                                    |

**Verdict:** Managed auth is the correct choice at current scale. The operational burden of self-hosted auth is disproportionate to the cost savings. Re-evaluate when per-MAU costs exceed ~$100/mo.

---

## Decision Matrix

| Scenario                                  | Recommended Path                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Current state (< 25K MAU, solo developer) | **Stay on Auth0** — $0/mo, full Pulumi, zero migration cost                |
| Adding social login (Google, GitHub)      | **Stay on Auth0** — 70+ providers, configuration-only change               |
| Adding MFA                                | **Stay on Auth0** — available on free tier, configuration-only             |
| Approaching 25K MAU                       | **Auth0 Professional** at $240/mo; re-evaluate alternatives                |
| Need enterprise SSO/SCIM                  | **Auth0 Enterprise** or **WorkOS** (if Pulumi provider ships)              |
| Auth0 pricing becomes untenable           | **AWS Cognito** (with Pulumi) or **Keycloak** (self-hosted)                |
| >50K MAU, cost optimization priority      | **Keycloak** self-hosted at ~$24/mo flat                                   |
| Clerk or Kinde ship Pulumi providers      | **Re-evaluate immediately** — both strong alternatives blocked only by IaC |
| Project adopts AWS for hosting            | **AWS Cognito** becomes natural ecosystem fit                              |
| Maximum developer experience priority     | **Clerk** — best React components (if IaC requirement relaxed)             |
| Passwordless/passkey-first product        | **Stytch** — purpose-built (if budget allows $0.10/MAU)                    |
| B2B SaaS with enterprise customers        | **WorkOS** for SSO/SCIM layer or **Stytch B2B**                            |

---

## Re-Evaluation Triggers

Watch for these events that should trigger a fresh evaluation:

1. **Clerk ships Pulumi/Terraform provider** — Immediately becomes top candidate (50K free MRU, best React components, OIDC, Auth0 migration tool)
2. **Kinde ships Pulumi/Terraform provider** — Strong candidate (10.5K free MAU, built-in feature flags, full OIDC)
3. **Approaching 20K MAU** — Plan transition from free tier; evaluate Professional ($240/mo) vs alternatives
4. **Auth0 pricing change** — Okta has changed Auth0 pricing multiple times; any increase should trigger re-evaluation
5. **WorkOS ships Pulumi provider** — With 1M free MAU, compelling if social login needs are minimal
6. **Project adopts AWS hosting** — Cognito becomes natural ecosystem fit
7. **MAU exceeds 50K** — Self-hosted Keycloak economics become compelling ($24/mo vs $500+/mo)

---

## Sources

### Auth0

- [Auth0 Pricing](https://auth0.com/pricing)
- [Auth0 Free Plan Changes (September 2024)](https://auth0.com/blog/auth0-free-plan-changes/)
- [Auth0 Pricing Explained — Security Boulevard](https://securityboulevard.com/2025/09/auth0-pricing-explained-and-why-startups-call-it-a-growth-penalty/)
- [Auth0 Pulumi Provider](https://www.pulumi.com/registry/packages/auth0/)
- [Auth0 Provisioning with Pulumi](https://auth0.com/blog/provisioning-auth0-resources-with-type-script-and-pulumi/)

### Clerk

- [Clerk Pricing](https://clerk.com/pricing)
- [Clerk New Plans (February 2026)](https://clerk.com/changelog/2026-02-05-new-plans-more-value)
- [Clerk Auth0 Migration Tool](https://github.com/clerk/migration-tool)
- [Clerk React Authentication](https://clerk.com/react-authentication)
- [Clerk OIDC/OAuth Overview](https://clerk.com/docs/guides/configure/auth-strategies/oauth/overview)

### WorkOS

- [WorkOS Pricing](https://workos.com/pricing)
- [WorkOS AuthKit](https://www.authkit.com/)
- [WorkOS AuthKit Documentation](https://workos.com/docs/authkit/overview)
- [WorkOS AuthKit — GitHub](https://github.com/workos/authkit)
- [WorkOS vs Auth0 — Security Boulevard](https://securityboulevard.com/2025/12/auth0-vs-workos-which-ciam-platform-fits-your-saas-better-in-2026/)

### Supabase Auth

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Auth Overview](https://supabase.com/auth)
- [Supabase OAuth 2.1 Server (November 2025)](https://supabase.com/docs/guides/auth/oauth-server)

### Firebase Auth

- [Firebase Pricing](https://firebase.google.com/pricing)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Firebase Auth Pricing — Logto Blog](https://blog.logto.io/firebase-authentication-pricing)
- [FirebaseUI Web — GitHub](https://github.com/firebase/firebaseui-web)

### AWS Cognito

- [AWS Cognito Pricing](https://aws.amazon.com/cognito/pricing/)
- [Cognito Pricing Calculator — CostGoat](https://costgoat.com/pricing/amazon-cognito)
- [Cognito Pricing Simplified — Frontegg](https://frontegg.com/guides/aws-cognito-pricing)
- [Pulumi AWS Cognito Registry](https://www.pulumi.com/registry/packages/aws/api-docs/cognito/)

### Stytch

- [Stytch Pricing](https://stytch.com/pricing)
- [Stytch New Pricing Announcement](https://stytch.com/blog/announcing-new-pricing-and-self-serve-options/)
- [Stytch Pricing Guide — SuperTokens](https://supertokens.com/blog/stytch-pricing)
- [Stytch Connected Apps / OIDC](https://stytch.com/docs/api/oauth-authenticate)

### Kinde

- [Kinde Pricing](https://kinde.com/pricing/)
- [Kinde Plan Details — Docs](https://docs.kinde.com/billing/manage-plans/about-plans/)
- [Kinde React SDK](https://docs.kinde.com/developer-tools/sdks/frontend/react-sdk/)
- [Kinde Feature Flags](https://docs.kinde.com/developer-tools/feature-flags/about-feature-flags/)

### Lucia / Oslo / Arctic

- [Lucia Auth — Deprecation Discussion](https://github.com/lucia-auth/lucia/discussions/1714)
- [Lucia Auth (Educational Resource)](https://lucia-auth.com/)
- [Arctic OAuth Library](https://arcticjs.dev)
- [Oslo Crypto Library](https://oslojs.dev)

### Keycloak

- [Keycloak Documentation](https://www.keycloak.org/)
- [Keycloak Memory Sizing Guide](https://www.keycloak.org/high-availability/multi-cluster/concepts-memory-and-cpu-sizing)
- [Keycloak OpenID Certification](https://www.keycloak.org/2023/12/openid-certification)
- [Keycloak Terraform Provider](https://registry.terraform.io/providers/mrparkers/keycloak/)
- [Keycloak Self-Hosting Cost — Skycloak](https://skycloak.io/blog/what-is-the-cost-of-self-hosting-keycloak/)

### Comparisons

- [Auth Provider Comparison 2026 — DesignRevision](https://designrevision.com/blog/auth-providers-compared)
- [Authentication Platforms for B2B SaaS — Security Boulevard](https://securityboulevard.com/2025/12/authentication-platforms-for-b2b-saas-complete-comparison-guide/)
