# Hosting/PaaS Provider Evaluation — February 2026

## Current State

| Dimension              | Value                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| **Hosting**            | DigitalOcean App Platform                                                 |
| **Static sites**       | 2 (web, dashboard) — free on App Platform                                 |
| **Container services** | 1 (users-api) — `apps-s-1vcpu-0.5gb` ($5/mo)                              |
| **Pending deployment** | 2 (reservations-service, rialto-web)                                      |
| **Pre-deploy job**     | `npx prisma migrate deploy` via `kind: PRE_DEPLOY`                        |
| **Ingress**            | Path-based: `/api` → users-api, `/dashboard` → dashboard, `/` → web       |
| **DNS**                | Cloudflare (proxied CNAME → DO default ingress)                           |
| **IaC**                | Pulumi TypeScript (`@pulumi/digitalocean` + `@pulumi/cloudflare` + Auth0) |
| **Monthly infra cost** | ~$5 (static sites free, 1 container at $5)                                |
| **Dockerfiles**        | Multi-stage, node:22-alpine, pnpm workspace-aware, Prisma generate        |

### Architecture

```
                  ┌─────────────────────────────────────────┐
                  │        Cloudflare DNS (proxied)         │
                  │     mattbutlerengineering.com → CNAME   │
                  └─────────────┬───────────────────────────┘
                                │
                  ┌─────────────▼───────────────────────────┐
                  │   DigitalOcean App Platform (nyc)       │
                  │                                         │
                  │   Ingress Rules:                        │
                  │     /api/*       → users-api (container)│
                  │     /dashboard/* → dashboard (static)   │
                  │     /*           → web (static)         │
                  │                                         │
                  │   Pre-deploy: prisma migrate deploy     │
                  └─────────────────────────────────────────┘
                                │
                  ┌─────────────▼───────────────────────────┐
                  │   Neon (PostgreSQL Serverless)           │
                  │   External, managed via connection string│
                  └─────────────────────────────────────────┘
```

### Pain Points & Motivations

- **Single region** — App Platform apps are confined to one region (currently `nyc`); no multi-region redundancy
- **No scale-to-zero** — Container services run 24/7 at minimum $5/mo each; adding reservations-service doubles cost
- **No preview environments** — PR previews require GitHub Actions setup with full instance costs per PR
- **pnpm caching issues** — Reported build cache corruption with pnpm workspaces; empty `node_modules` on rebuilds
- **Cost planning** — At 5 services ($25/mo minimum), want to evaluate pay-per-use alternatives

---

## Evaluation Criteria

| Criterion                        | Why It Matters                                       |
| -------------------------------- | ---------------------------------------------------- |
| **Pricing at 1/2/5/10 services** | Budget planning as monorepo grows                    |
| **Monorepo deployment support**  | pnpm workspaces + Turborepo builds                   |
| **Container support**            | Existing multi-stage Dockerfiles must work unchanged |
| **Static site hosting**          | Free/included for marketing site and dashboard       |
| **Pre-deploy job support**       | `npx prisma migrate deploy` before service starts    |
| **Pulumi IaC provider**          | Current stack managed via Pulumi TypeScript          |
| **Custom domain + SSL**          | `mattbutlerengineering.com` with automatic HTTPS     |
| **Scale-to-zero**                | Pay nothing when services have no traffic            |
| **Preview environments**         | PR-based isolated deployments for testing            |
| **Multi-region / edge**          | Low-latency globally; redundancy                     |
| **Migration friction**           | Effort and risk to move from current setup           |
| **DX and ease of use**           | Solo developer; time is the scarcest resource        |

---

## Provider Classification

| Category            | Providers                                      | Characteristics                                                                 |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| **Full-Stack PaaS** | DigitalOcean, Railway, Render                  | Managed platform; static + containers + databases; opinionated defaults         |
| **Container-First** | Fly.io, Google Cloud Run, Azure Container Apps | Docker-native; scale-to-zero containers; more control, less bundled             |
| **Frontend-First**  | Vercel, Netlify, Cloudflare Pages/Workers      | Static/edge-optimized; serverless functions only; cannot run Fastify containers |
| **Cloud Platform**  | AWS (Amplify + App Runner + ECS)               | Full cloud ecosystem; maximum flexibility; highest operational complexity       |
| **Self-Hosted**     | Coolify, Dokku                                 | Open-source PaaS on your own VPS; full control; ops overhead                    |

---

## Provider Profiles

### 1. DigitalOcean App Platform (Current)

Managed PaaS with path-based ingress routing, static sites, container services, and pre-deploy jobs. Currently running the production stack.

| Criterion               | Details                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| **Pricing (1 svc)**     | ~$5/mo (static sites free, 1 container at $5)                      |
| **Pricing (2 svc)**     | ~$10/mo                                                            |
| **Pricing (5 svc)**     | ~$25/mo                                                            |
| **Pricing (10 svc)**    | ~$50/mo                                                            |
| **Monorepo**            | Supported via `sourceDir` config; pnpm caching issues reported     |
| **Containers**          | Full Dockerfile support; AMD64 Linux only; <1 GB image recommended |
| **Static sites**        | Free (up to 3 apps); 1 GB outbound/mo included                     |
| **Pre-deploy jobs**     | Native `kind: PRE_DEPLOY`; per-second billing                      |
| **Pulumi provider**     | `@pulumi/digitalocean` v4.56 — mature, actively maintained         |
| **Custom domain + SSL** | Free; automatic Let's Encrypt                                      |
| **Scale-to-zero**       | Not supported (manual archive only)                                |
| **Preview envs**        | Via GitHub Actions; full instance cost per PR                      |
| **Multi-region**        | Single region per app; 10 regions available                        |
| **Migration friction**  | None (already in use)                                              |
| **DX**                  | Good dashboard; limited CLI; deploy-on-push from GitHub            |

**Key risk:** No scale-to-zero means linear cost growth. At 5 services, paying $25/mo for containers that may see minimal traffic. pnpm build caching issues may worsen as monorepo grows.

---

### 2. Railway

Monorepo-first PaaS with visual canvas UI. Pay-per-use pricing with no per-service fees — you pay for actual CPU/RAM consumption across all services in a project.

| Criterion               | Details                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Pricing (1 svc)**     | ~$5/mo (Hobby plan with $5 included credit)                                            |
| **Pricing (2 svc)**     | ~$5–10/mo (shared resource pool)                                                       |
| **Pricing (5 svc)**     | ~$10–20/mo (Pro plan: $20/mo with $20 credit)                                          |
| **Pricing (10 svc)**    | ~$20–40/mo (Pro plan, usage-based)                                                     |
| **Monorepo**            | Excellent — auto-detects pnpm/Turborepo; creates services per package                  |
| **Containers**          | Full Dockerfile support; custom paths via env var                                      |
| **Static sites**        | Supported; bundled with plan (not free standalone)                                     |
| **Pre-deploy jobs**     | Native pre-deploy command; runs between build and deploy                               |
| **Pulumi provider**     | No official provider; community options unmaintained; use `railway.json` instead       |
| **Custom domain + SSL** | Free Let's Encrypt; automatic provisioning and renewal                                 |
| **Scale-to-zero**       | Yes ("Serverless" mode); ~10 min inactivity → stops; cold start on next request        |
| **Preview envs**        | Excellent — auto per PR; focused mode deploys only changed services                    |
| **Multi-region**        | 4 regions (US West, US East, EU West, Singapore)                                       |
| **Migration friction**  | Medium — rewrite Pulumi to `railway.json`; remap path-based routing to service routing |
| **DX**                  | Best-in-class visual canvas; fast CLI; deploy in 30–90 seconds                         |

**Key risk:** No Pulumi provider means abandoning IaC for Railway resources (or using community providers). Scale-to-zero may not work reliably if Prisma keeps database connection pools alive. Hobby plan prohibits team use.

**Verdict:** Best monorepo DX and most natural fit for the project structure. Pay-per-use pricing is compelling at low traffic.

---

### 3. Fly.io

Container-native platform running Firecracker microVMs globally. Docker-first with multi-region deployment and per-second billing.

| Criterion               | Details                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **Pricing (1 svc)**     | ~$2–5/mo (shared-cpu-1x, 256 MB)                                                              |
| **Pricing (2 svc)**     | ~$4–10/mo                                                                                     |
| **Pricing (5 svc)**     | ~$10–25/mo                                                                                    |
| **Pricing (10 svc)**    | ~$20–50/mo + $2/mo per dedicated IPv4                                                         |
| **Monorepo**            | Supported via multiple `fly.toml` files or `--build-target`                                   |
| **Containers**          | Excellent — runs any Dockerfile as Firecracker microVM                                        |
| **Static sites**        | Via nginx container (not free; runs as a service)                                             |
| **Pre-deploy jobs**     | `release_command` in `fly.toml`; runs in temp Machine before deploy                           |
| **Pulumi provider**     | Community only (`dirien/pulumi-fly`); not official                                            |
| **Custom domain + SSL** | Free Let's Encrypt; $0.10/mo management fee per hostname                                      |
| **Scale-to-zero**       | Yes (`auto_stop_machines`); per-second billing; ~5s cold start                                |
| **Preview envs**        | Via `superfly/fly-pr-review-apps` GitHub Action; not built-in                                 |
| **Multi-region**        | 18+ regions globally; anycast routing to nearest edge                                         |
| **Migration friction**  | Medium — Dockerfiles work unchanged; path-based routing becomes separate apps + reverse proxy |
| **DX**                  | Strong CLI (`flyctl`); Machines API for fine-grained control                                  |

**Key risk:** No free static site hosting (each site is a paid service). Path-based routing requires manual reverse proxy setup. Preview environments need GitHub Actions configuration. IPv4 addresses cost $2/mo each.

**Verdict:** Best multi-region story and true Docker-native deployment. Ideal if global distribution matters more than integrated PaaS features.

---

### 4. Render

Heroku alternative with permanent free tier, predictable pricing, and simple Docker deployments.

| Criterion               | Details                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| **Pricing (1 svc)**     | $0 (free tier: 512 MB, 0.1 CPU, scale-to-zero) or $7/mo (Starter)              |
| **Pricing (2 svc)**     | $14/mo (2× Starter)                                                            |
| **Pricing (5 svc)**     | $35–125/mo (Starter to Standard mix)                                           |
| **Pricing (10 svc)**    | $70–250/mo                                                                     |
| **Monorepo**            | Excellent — root directory config per service; build filters via glob patterns |
| **Containers**          | Full Dockerfile support; BuildKit-based; zero-downtime deploys                 |
| **Static sites**        | Free with 100 GB/mo bandwidth; global CDN                                      |
| **Pre-deploy jobs**     | Supported; runs after build, before deploy                                     |
| **Pulumi provider**     | Not available — significant gap for IaC workflow                               |
| **Custom domain + SSL** | Free; automatic Let's Encrypt + Google Trust Services                          |
| **Scale-to-zero**       | Free tier only; paid tiers (Starter+) are always-on                            |
| **Preview envs**        | Supported on Professional tier ($19/user/mo); auto per PR                      |
| **Multi-region**        | 5 regions (Oregon, Ohio, Virginia, Frankfurt, Singapore)                       |
| **Migration friction**  | Low — Dockerfiles work; `render.yaml` blueprints for IaC                       |
| **DX**                  | Clean dashboard; GitHub integration; `render.yaml` config                      |

**Key risk:** No Pulumi provider is a hard blocker for the current IaC workflow. No scale-to-zero on paid tiers means same cost model as DigitalOcean. Preview environments require expensive Professional tier.

**Verdict:** Good Heroku replacement but doesn't solve the core pain points (no scale-to-zero on paid, no Pulumi). Free static hosting is a plus.

---

### 5. Vercel

Frontend-first platform optimized for React/Next.js. Serverless functions and edge middleware — not designed for long-running container workloads.

| Criterion           | Details                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **Pricing**         | Free (Hobby, non-commercial); $20/user/mo (Pro)                                                     |
| **Monorepo**        | Excellent — maintains Turborepo; best-in-class monorepo builds                                      |
| **Containers**      | Not supported — explicitly no Docker deployments                                                    |
| **Static sites**    | Excellent; 100 GB/mo bandwidth free; global edge CDN                                                |
| **Pre-deploy jobs** | Not applicable (serverless model)                                                                   |
| **Pulumi provider** | Yes — `@pulumi/vercel` v4.6 actively maintained                                                     |
| **Scale-to-zero**   | Serverless functions: yes; "Scale to One" on Pro (always-warm)                                      |
| **Preview envs**    | Best-in-class — automatic per branch/PR; 1–2 min builds                                             |
| **Fastify support** | Requires rewrite to serverless function adapter; loses streaming, WebSocket, persistent connections |

**Key risk:** Cannot run Fastify containers. Hobby tier prohibits commercial use. Would require splitting architecture: Vercel for frontends, another platform for backends.

---

### 6. Netlify

Static hosting pioneer with edge functions and serverless capabilities. Similar limitations to Vercel for container workloads.

| Criterion           | Details                                                            |
| ------------------- | ------------------------------------------------------------------ |
| **Pricing**         | Free (100 GB bandwidth, 300 build min); $20/member/mo (Pro)        |
| **Monorepo**        | Good — pnpm workspace support; site picker for deployable packages |
| **Containers**      | Not supported — no Docker deployment                               |
| **Static sites**    | Excellent; free tier allows commercial use (unlike Vercel Hobby)   |
| **Pre-deploy jobs** | Not applicable                                                     |
| **Pulumi provider** | Yes — `@pulumi/netlify` v0.4                                       |
| **Scale-to-zero**   | Serverless functions: yes                                          |
| **Preview envs**    | Good — Deploy Previews per PR                                      |
| **Fastify support** | Requires rewrite to serverless function handler                    |

**Key risk:** Same fundamental limitation as Vercel — cannot run Fastify containers natively.

---

### 7. Cloudflare Pages/Workers

Edge compute platform using V8 isolates. Unlimited free static hosting bandwidth. Workers provide serverless compute at the edge.

| Criterion           | Details                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Pricing**         | Free (unlimited static bandwidth, 100K worker requests/day); $5/mo (Paid Workers)                                               |
| **Monorepo**        | Good — monorepo structure supported                                                                                             |
| **Containers**      | Beta only — Cloudflare Containers (announced mid-2025) with `sleepAfter` shutdown; not production-ready for persistent services |
| **Static sites**    | Best-in-class — unlimited bandwidth on free tier                                                                                |
| **Pre-deploy jobs** | Not applicable                                                                                                                  |
| **Pulumi provider** | Yes — `@pulumi/cloudflare` v6.13 (already used for DNS)                                                                         |
| **Scale-to-zero**   | Workers: <1ms cold start (V8 isolates)                                                                                          |
| **Preview envs**    | Supported — branch-based preview deployments                                                                                    |
| **Fastify support** | Experimental `nodejs_compat` flag; not designed for traditional HTTP servers                                                    |

**Key risk:** Cloudflare Containers is in beta and designed for on-demand workloads, not persistent services. Workers use V8 isolates, not Node.js — significant compatibility constraints.

---

### 8. AWS (Amplify + App Runner + ECS)

Full cloud platform with three relevant sub-products at different abstraction levels.

| Criterion           | Amplify (Static)                                            | App Runner (Simple Containers) | ECS/Fargate (Full Control)                |
| ------------------- | ----------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| **Pricing**         | $0.023/GB storage; $0.15/GB transfer                        | ~$55–65/mo idle per container  | ~$13–15/mo per container (0.5 vCPU, 1 GB) |
| **Free tier**       | 5 GB + 1K build min (12 mo)                                 | None meaningful                | None meaningful                           |
| **Containers**      | Not applicable                                              | Full Docker support            | Full Docker support                       |
| **Static sites**    | Yes — CDN on 450+ edge locations                            | Not applicable                 | Not applicable                            |
| **Pre-deploy jobs** | Not applicable                                              | Pre-deploy command             | Via CodeBuild/CodeDeploy                  |
| **Scale-to-zero**   | N/A                                                         | No (idle provisioned cost)     | Yes (Fargate Spot: 70% off)               |
| **Preview envs**    | Yes — PR previews built-in                                  | Not built-in                   | Not built-in                              |
| **Pulumi provider** | `@pulumi/aws` — very mature; Crosswalk abstractions for ECS | `@pulumi/aws`                  | `@pulumi/aws` with Crosswalk              |

| Criterion              | Details (combined)                                                |
| ---------------------- | ----------------------------------------------------------------- |
| **Pricing (1 svc)**    | ~$55–65/mo (App Runner) or ~$13–15/mo (ECS Fargate)               |
| **Pricing (5 svc)**    | ~$65–325/mo                                                       |
| **Monorepo**           | Supported via standard Docker patterns; `turbo prune` recommended |
| **Multi-region**       | 27+ regions; most mature multi-region story                       |
| **Migration friction** | High — completely different paradigm; VPC, IAM, load balancers    |
| **DX**                 | Lowest — steep learning curve; many services to configure         |

**Key risk:** Operational complexity is disproportionate to the scale of this project. App Runner has no true scale-to-zero. ECS/Fargate is powerful but requires VPC networking, load balancers, service discovery, and IAM configuration. A solo developer would spend more time on AWS operations than on application code.

---

### 9. Google Cloud Run

Serverless container platform. Deploy any Docker container; pay per request and compute time. True scale-to-zero with fast cold starts.

| Criterion               | Details                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Pricing (1 svc)**     | ~$0–5/mo (generous free tier: 180K vCPU-sec, 2M requests)                     |
| **Pricing (2 svc)**     | ~$5–15/mo                                                                     |
| **Pricing (5 svc)**     | ~$15–40/mo                                                                    |
| **Pricing (10 svc)**    | ~$30–80/mo                                                                    |
| **Monorepo**            | Via standard Docker; `turbo prune` for build optimization                     |
| **Containers**          | Excellent — any Docker container; Cloud Build integration                     |
| **Static sites**        | Not built-in; use Cloud Storage + CDN or separate service                     |
| **Pre-deploy jobs**     | Cloud Run Jobs (separate resource); runs before service deploy                |
| **Pulumi provider**     | `@pulumi/gcp` — mature, native                                                |
| **Custom domain + SSL** | Google-managed SSL; 15 min–24 hr provisioning                                 |
| **Scale-to-zero**       | Yes — core value prop; 300ms–1s cold start; Startup CPU Boost available       |
| **Preview envs**        | Not built-in; requires Cloud Build + GitHub Actions                           |
| **Multi-region**        | Multiple regions; requires Cloud Load Balancer for global                     |
| **Migration friction**  | Medium — Dockerfiles work unchanged; GCP account setup; no path-based routing |
| **DX**                  | Good CLI (`gcloud`); simpler than ECS but still a cloud platform              |

**Key risk:** No built-in static hosting, preview environments, or path-based routing. Requires stitching together multiple GCP products. Cloud Load Balancer adds complexity for multi-region. GCP billing complexity.

---

### 10. Azure Container Apps

Serverless container platform built on Kubernetes (abstracted). Generous free tier matching Cloud Run. Scale-to-zero with consumption-based pricing.

| Criterion               | Details                                                        |
| ----------------------- | -------------------------------------------------------------- |
| **Pricing (1 svc)**     | ~$0–5/mo (free tier: 180K vCPU-sec, 2M requests)               |
| **Pricing (2 svc)**     | ~$5–15/mo                                                      |
| **Pricing (5 svc)**     | ~$15–40/mo                                                     |
| **Pricing (10 svc)**    | ~$30–80/mo                                                     |
| **Monorepo**            | Via standard Docker patterns                                   |
| **Containers**          | Full Docker support; Azure Container Registry integration      |
| **Static sites**        | Not built-in; use Azure Static Web Apps (separate service)     |
| **Pre-deploy jobs**     | Supported via pre-deployment commands                          |
| **Pulumi provider**     | `@pulumi/azure-native` — mature                                |
| **Custom domain + SSL** | Free managed certificates; auto-renewal                        |
| **Scale-to-zero**       | Yes; idle instances at 1/8 vCPU cost; 5–10s cold start         |
| **Preview envs**        | Not built-in; requires GitHub Actions                          |
| **Multi-region**        | Via Azure Front Door or Traffic Manager                        |
| **Migration friction**  | Medium–High — Azure account setup; multi-service orchestration |
| **DX**                  | Azure Portal + CLI; moderate learning curve                    |

**Key risk:** 5–10s cold starts are significantly slower than Cloud Run's 300ms–1s. Azure ecosystem complexity. No integrated developer experience for static sites + containers.

---

### 11. Coolify

Open-source, self-hosted PaaS alternative to Vercel/Netlify/Heroku. Web dashboard for managing apps, databases, and 280+ one-click services on your own VPS.

| Criterion                | Details                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| **Pricing**              | Free (self-hosted) or $5/mo (Coolify Cloud); VPS cost: ~$7–14/mo    |
| **Total cost (2–5 svc)** | ~$7–14/mo (single VPS handles all services)                         |
| **Monorepo**             | Supported via directory-based deployment configuration              |
| **Containers**           | Full Docker + Docker Compose support; Nixpacks auto-detection       |
| **Static sites**         | Built-in; Nginx-based; SPA support                                  |
| **Pre-deploy jobs**      | Partial — Docker Compose one-off services flagged as "unhealthy"    |
| **Pulumi provider**      | None — Coolify is the deployment layer, not IaC-managed             |
| **Custom domain + SSL**  | Free Let's Encrypt via Traefik; automatic renewal; wildcard support |
| **Scale-to-zero**        | Not supported — VPS runs 24/7                                       |
| **Preview envs**         | Yes — auto-deploy per PR; auto-cleanup on merge/close               |
| **Multi-region**         | Not natively; connect multiple servers possible                     |
| **Migration friction**   | Medium — Dockerfiles work; manual setup of routing and services     |
| **DX**                   | Good web dashboard; one-minute installer; GitHub/GitLab integration |

**Key risk:** January 2026 disclosure of 11 critical vulnerabilities (CVSS up to 10.0) affecting ~52,000 instances. Self-hosted means you manage OS updates, security patches, backups, and monitoring. Pre-deploy job support is incomplete.

---

### 12. Dokku

Lightweight open-source PaaS ("the smallest PaaS you've ever seen"). Heroku-compatible buildpacks on a single VPS. Git-push deployment workflow.

| Criterion                | Details                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| **Pricing**              | Free (self-hosted); VPS cost: ~$5–7/mo                                   |
| **Total cost (2–5 svc)** | ~$5–7/mo (single VPS)                                                    |
| **Monorepo**             | Partial — `dokku-monorepo` plugin; requires per-app setup                |
| **Containers**           | Dockerfile support; Heroku buildpacks (default)                          |
| **Static sites**         | No built-in support; requires deploying as app (workaround)              |
| **Pre-deploy jobs**      | Excellent — `release` process in Procfile; `scripts.dokku.predeploy`     |
| **Pulumi provider**      | None                                                                     |
| **Custom domain + SSL**  | Via `dokku-letsencrypt` plugin; automatic renewal via cron               |
| **Scale-to-zero**        | Not supported — VPS always running                                       |
| **Preview envs**         | Not supported                                                            |
| **Multi-region**         | Not supported — single server only                                       |
| **Migration friction**   | Medium — Heroku-style workflow differs from current Pulumi-managed setup |
| **DX**                   | CLI-only; minimal overhead; git-push deploys                             |

**Key risk:** Single-server constraint means no redundancy. No web dashboard. Monorepo support requires plugin with limitations. No preview environments. You manage the full server stack.

---

## Comparison Table

| Provider         | Pricing (5 svc) | Monorepo       | Containers   | Free Static   | Pre-deploy     | Pulumi       | Scale-to-Zero     | Preview Envs     | Multi-Region   | DX        |
| ---------------- | --------------- | -------------- | ------------ | ------------- | -------------- | ------------ | ----------------- | ---------------- | -------------- | --------- |
| **DigitalOcean** | ~$25/mo         | ⚠️ pnpm issues | ✅           | ✅ Free       | ✅ Native      | ✅ Mature    | ❌                | ⚠️ Manual        | ❌ Single      | Good      |
| **Railway**      | ~$10–20/mo      | ✅ Excellent   | ✅           | ⚠️ Paid       | ✅ Native      | ❌ None      | ✅                | ✅ Excellent     | ⚠️ 4 regions   | Excellent |
| **Fly.io**       | ~$10–25/mo      | ✅ Good        | ✅ Excellent | ❌ Paid       | ✅ release_cmd | ❌ Community | ✅                | ⚠️ via GH Action | ✅ 18+ regions | Good      |
| **Render**       | ~$35–125/mo     | ✅ Excellent   | ✅           | ✅ Free       | ✅             | ❌ None      | ❌ Paid=always-on | ✅ Pro tier      | ⚠️ 5 regions   | Good      |
| **Vercel**       | N/A             | ✅ Best        | ❌ None      | ✅ Free       | N/A            | ✅           | ✅ Serverless     | ✅ Best          | ✅ Edge        | Excellent |
| **Netlify**      | N/A             | ✅ Good        | ❌ None      | ✅ Free       | N/A            | ✅           | ✅ Serverless     | ✅ Good          | ✅ Edge        | Good      |
| **Cloudflare**   | N/A             | ✅ Good        | ⚠️ Beta      | ✅ Best       | N/A            | ✅ (DNS)     | ✅ <1ms           | ✅ Good          | ✅ Edge        | Good      |
| **AWS**          | ~$65–325/mo     | ✅ Standard    | ✅           | ✅ Amplify    | ✅             | ✅ Best      | ⚠️ ECS only       | ⚠️ Amplify only  | ✅ 27+ regions | Low       |
| **Cloud Run**    | ~$15–40/mo      | ✅ Standard    | ✅ Excellent | ❌ Separate   | ✅ Jobs        | ✅ Mature    | ✅ Best           | ❌ Manual        | ✅ via LB      | Medium    |
| **Azure CApps**  | ~$15–40/mo      | ✅ Standard    | ✅           | ❌ Separate   | ✅             | ✅ Mature    | ✅ Slow start     | ❌ Manual        | ✅ via FD      | Medium    |
| **Coolify**      | ~$7–14/mo       | ✅ Good        | ✅           | ✅ Built-in   | ⚠️ Partial     | ❌ None      | ❌                | ✅               | ❌             | Good      |
| **Dokku**        | ~$5–7/mo        | ⚠️ Plugin      | ✅           | ❌ Workaround | ✅ Excellent   | ❌ None      | ❌                | ❌               | ❌             | Medium    |

---

## Eliminated Providers

Nine providers do not fit the current requirements:

### Frontend-First Platforms (Cannot Run Fastify Containers)

| Provider                     | Primary Elimination Reason                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**                   | Cannot run Docker containers; Fastify requires rewrite to serverless function adapter; Hobby tier prohibits commercial use                                              |
| **Netlify**                  | Cannot run Docker containers; no custom container deployment; serverless functions only                                                                                 |
| **Cloudflare Pages/Workers** | Cloudflare Containers in beta, designed for on-demand workloads with `sleepAfter` shutdown; V8 isolates ≠ Node.js; not production-ready for persistent Fastify services |

These platforms excel at static hosting and edge functions. If the architecture ever splits frontends and backends onto separate platforms, Vercel (for React apps) + a container platform (for Fastify) would be a viable hybrid — but adds operational complexity for a solo developer.

### Cloud Platforms (Complexity Disproportionate to Scale)

| Provider                             | Primary Elimination Reason                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS (Amplify + App Runner + ECS)** | Requires stitching 3+ services; VPC, IAM, load balancer configuration; App Runner has no scale-to-zero; ECS Fargate is powerful but operationally heavy; a solo developer would spend more time on infrastructure than code |
| **Google Cloud Run**                 | No built-in static hosting, preview environments, or path-based routing; requires Cloud Load Balancer for multi-region; GCP account + billing complexity; compelling features but too many pieces to assemble               |
| **Azure Container Apps**             | 5–10s cold starts (vs Cloud Run's 300ms); no integrated static hosting; Azure portal complexity; requires Azure Front Door for global routing                                                                               |

These platforms are excellent for teams with dedicated platform engineers. For a solo developer with 2–5 services, the operational overhead outweighs the benefits of cloud-native features.

### Other

| Provider    | Primary Elimination Reason                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Render**  | No scale-to-zero on paid tiers (same problem as DigitalOcean); no Pulumi provider (loses IaC workflow); preview environments require $19/user/mo Professional tier                     |
| **Coolify** | Self-hosted ops overhead; January 2026 critical security vulnerabilities (CVSS 10.0); pre-deploy job support incomplete; no scale-to-zero; requires managing server security patches   |
| **Dokku**   | Single-server with no redundancy; no preview environments; no web dashboard; monorepo support requires plugin with limitations; CLI-only management; ops overhead for a solo developer |

---

## Recommended Shortlist

### #1 Railway (Recommended)

Railway addresses the most pain points simultaneously:

1. **Pay-per-use pricing** — No per-service fees; shared resource pool means 5 light services could cost $10–20/mo vs $25/mo on DigitalOcean.
2. **Best monorepo DX** — Auto-detects pnpm + Turborepo; creates services per package; focused PR environments deploy only changed services.
3. **Scale-to-zero** — "Serverless" mode stops services after ~10 min inactivity; only pay for actual compute.
4. **Preview environments** — Automatic per PR with isolated databases; monorepo-aware.
5. **Pre-deploy commands** — Native support; ideal for `npx prisma migrate deploy`.
6. **Visual canvas** — Multi-service management in a drag-and-drop UI; shows service connections at a glance.

**Trade-offs:** No Pulumi provider (use `railway.json` config-as-code instead). Scale-to-zero may not trigger if Prisma connection pools keep services awake. Static sites are not free (bundled with plan). Only 4 regions.

**Migration path:**

1. Create Railway project, connect GitHub repo
2. Railway auto-detects monorepo, creates services for web, dashboard, users-api, rialto-web
3. Configure pre-deploy command: `npx prisma migrate deploy`
4. Add environment variables (DATABASE_URL, AUTH0_DOMAIN, etc.)
5. Update Cloudflare DNS CNAME to Railway's domain
6. Rewrite `infrastructure/pulumi/index.ts` to remove DO App Platform resources; keep Cloudflare DNS + Auth0; add `railway.json` files per service
7. Test with one service first (web), migrate incrementally

**Estimated migration effort:** 1–2 days. Dockerfiles work unchanged. Main effort is rewriting Pulumi config and remapping path-based routing.

### #2 Fly.io (Strong Alternative)

Fly.io is the strongest alternative if multi-region or Docker-native deployment matters most:

1. **Docker-native** — Existing Dockerfiles work without modification; Firecracker microVMs.
2. **Multi-region** — 18+ regions with anycast routing; deploy close to users globally.
3. **Scale-to-zero** — `auto_stop_machines` with per-second billing; ~5s cold start.
4. **Pre-deploy** — `release_command` in `fly.toml` runs migrations before service starts.
5. **Fine-grained control** — Machines API for individual VM management when needed.

**Trade-offs:** No free static hosting (each site is a paid service). Path-based routing requires separate apps. Preview environments need GitHub Actions setup. IPv4 costs $2/mo per address. No official Pulumi provider.

**Migration path:**

1. Create separate Fly apps for each service (web, dashboard, users-api, rialto-web)
2. Add `fly.toml` per service with Dockerfile path and config
3. Configure `release_command` for Prisma migrations
4. Set up reverse proxy or separate domains (no built-in path-based routing)
5. Update Cloudflare DNS to point at Fly.io
6. Set up `superfly/fly-pr-review-apps` GitHub Action for preview environments

**Estimated migration effort:** 2–3 days. Main complexity is replacing path-based routing with separate apps/domains and setting up preview environment automation.

### #3 DigitalOcean (Stay + Optimize)

Staying on DigitalOcean avoids all migration risk:

1. **Zero migration cost** — Already running in production.
2. **Pulumi integration** — Existing `infrastructure/pulumi/index.ts` continues to work.
3. **Path-based routing** — Ingress rules already configured for `/api`, `/dashboard`, `/`.
4. **Known entity** — Debugging, logs, and deployment workflow are familiar.

**Optimization strategies:**

- Pre-build Docker images via GitHub Actions to avoid pnpm caching issues
- Use DigitalOcean Functions for scale-to-zero lightweight endpoints
- Set up GitHub Actions for PR preview environments (accept per-instance cost)
- Accept $25/mo at 5 services as a known cost ceiling

**When to stay:** If the current setup works and the main motivation is planning ahead rather than solving an immediate problem. Migration has real cost in time and risk.

---

## Self-Hosted vs Managed Analysis

| Factor             | Self-Hosted (Coolify/Dokku)                                | Managed PaaS (Railway/Fly.io/DO)  |
| ------------------ | ---------------------------------------------------------- | --------------------------------- |
| **Monthly cost**   | $5–14/mo (VPS only)                                        | $5–40/mo (usage-based)            |
| **Time cost**      | 2–5 hrs/mo (updates, patches, monitoring, debugging)       | ~0 hrs/mo                         |
| **Scaling**        | Manual (resize VPS or add servers)                         | Automatic (platform-managed)      |
| **Reliability**    | Your responsibility (uptime, backups, disaster recovery)   | Platform SLA (99.9%+)             |
| **Security**       | You patch CVEs (Coolify had 11 critical vulns in Jan 2026) | Platform handles patches          |
| **Preview envs**   | Coolify: yes; Dokku: no                                    | Built-in or easy setup            |
| **Scale-to-zero**  | Not possible (VPS always running)                          | Available (Railway, Fly.io)       |
| **Multi-region**   | Requires multiple VPS + load balancer                      | Built-in (Fly.io) or available    |
| **Recovery time**  | Hours (manual intervention)                                | Minutes (platform auto-recovery)  |
| **Vendor lock-in** | None (you own the server)                                  | Medium (platform-specific config) |

**Verdict for a solo developer:** Managed PaaS wins decisively. The 2–5 hours/month spent on server maintenance is better invested in building features. The cost difference ($5–14/mo self-hosted vs $10–25/mo managed) is small compared to the value of your time. Self-hosted makes sense for teams with dedicated ops capacity or specific compliance requirements.

---

## Decision Matrix

| Scenario                                          | Recommended Path                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Best monorepo DX, pay-per-use pricing             | **Railway** — auto-detects Turborepo; shared resource pool; visual canvas         |
| Multi-region, Docker-native, fine-grained control | **Fly.io** — 18+ regions; Firecracker microVMs; Machines API                      |
| Zero migration effort, known costs                | **Stay on DigitalOcean** — optimize builds via GitHub Actions; accept linear cost |
| Minimize cost at all costs                        | **Dokku** on $5/mo VPS — but accept ops overhead and no preview envs              |
| Need scale-to-zero + cloud ecosystem              | **Google Cloud Run** — but accept multi-service orchestration complexity          |
| Static sites only (split architecture)            | **Vercel** for frontends + Railway/Fly.io for backends                            |
| Enterprise scale, multiple teams                  | **AWS ECS/Fargate** with Pulumi Crosswalk — not justified at current scale        |

---

## Sources

### Provider Pricing & Documentation

- [DigitalOcean App Platform Pricing](https://www.digitalocean.com/pricing/app-platform)
- [DigitalOcean App Platform Features](https://docs.digitalocean.com/products/app-platform/details/features/)
- [DigitalOcean App Platform Limits](https://docs.digitalocean.com/products/app-platform/details/limits/)
- [Railway Pricing Plans](https://docs.railway.com/reference/pricing/plans)
- [Railway Monorepo Guide](https://docs.railway.com/guides/monorepo)
- [Railway Pre-Deploy Commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway Deployment Regions](https://docs.railway.com/reference/deployment-regions)
- [Railway Serverless/Scale-to-Zero](https://docs.railway.com/reference/app-sleeping)
- [Railway Preview Environments](https://docs.railway.com/guides/environments)
- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly.io Monorepo Deployment](https://fly.io/docs/launch/monorepo/)
- [Fly.io Autostop/Autostart](https://fly.io/docs/launch/autostop-autostart/)
- [Fly.io PR Review Apps](https://fly.io/docs/blueprints/review-apps-guide/)
- [Fly.io Regions](https://fly.io/docs/reference/regions/)
- [Render Pricing](https://render.com/pricing)
- [Render Monorepo Support](https://render.com/docs/monorepo-support)
- [Render Docker Deployment](https://render.com/docs/docker)
- [Render Preview Environments](https://render.com/docs/preview-environments)

### Frontend-First Platforms

- [Vercel Pricing](https://vercel.com/pricing)
- [Vercel Docker FAQ](https://vercel.com/kb/guide/does-vercel-support-docker-deployments)
- [Vercel Monorepo Support](https://vercel.com/docs/monorepos)
- [Netlify Pricing](https://www.netlify.com/pricing/)
- [Netlify Monorepo Documentation](https://docs.netlify.com/build/configure-builds/monorepos/)
- [Cloudflare Pages Pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Containers Overview](https://developers.cloudflare.com/containers/)
- [Fastify Serverless Deployment Guide](https://fastify.dev/docs/latest/Guides/Serverless/)

### Cloud Platforms

- [AWS Amplify Pricing](https://aws.amazon.com/amplify/pricing/)
- [AWS App Runner Pricing](https://aws.amazon.com/apprunner/pricing/)
- [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [Google Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Azure Container Apps Pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/)
- [Cloud Run Startup CPU Boost](https://cloud.google.com/blog/products/serverless/announcing-startup-cpu-boost-for-cloud-run--cloud-functions)

### Self-Hosted PaaS

- [Coolify Documentation](https://coolify.io/docs/get-started/introduction)
- [Coolify Preview Deployments](https://coolify.io/docs/applications/ci-cd/github/preview-deploy)
- [Coolify Security Disclosure (January 2026)](https://thehackernews.com/2026/01/coolify-discloses-11-critical-flaws.html)
- [Dokku Official Documentation](https://dokku.com/)
- [Dokku Deployment Tasks](https://dokku.com/docs/advanced-usage/deployment-tasks/)
- [Dokku SSL Configuration](https://dokku.com/docs/configuration/ssl/)

### IaC Providers

- [Pulumi DigitalOcean Provider](https://www.pulumi.com/registry/packages/digitalocean/)
- [Pulumi Vercel Provider](https://www.pulumi.com/registry/packages/vercel/)
- [Pulumi Cloudflare Provider](https://www.pulumi.com/registry/packages/cloudflare/)
- [Pulumi AWS Provider](https://www.pulumi.com/registry/packages/aws/)
- [Pulumi GCP Provider](https://www.pulumi.com/registry/packages/gcp/)

### Comparisons

- [DigitalOcean Monorepo Deployment](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-monorepo/)
- [Railway Introducing Plans](https://blog.railway.com/p/introducing-trial-hobby-pro-plans)
- [Vercel vs Netlify 2026](https://www.clarifai.com/blog/vercel-vs-netlify)
- [Turborepo Docker Guide](https://turbo.build/repo/docs/handbook/deploying-with-docker)
