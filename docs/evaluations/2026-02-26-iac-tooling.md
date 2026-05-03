# IaC Tooling Evaluation — February 2026

## Current State

| Dimension             | Value                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| **IaC tool**          | Pulumi (TypeScript)                                                                                          |
| **State backend**     | Pulumi Cloud (managed, default)                                                                              |
| **Codebase size**     | ~255 lines of TypeScript across 2 files (`index.ts`, `auth0.ts`)                                             |
| **Providers**         | DigitalOcean, Auth0, Cloudflare, Neon (via config secret)                                                    |
| **Managed resources** | ~10 (1 App Platform app, 2 DNS records, 1 Auth0 API, 1 Auth0 client, 1 client grant, plus nested components) |
| **CI/CD integration** | GitHub Actions (`pulumi-preview.yml` on PRs, `pulumi-up.yml` on push to main)                                |
| **Monthly IaC cost**  | $0 (Pulumi Cloud Individual free tier)                                                                       |
| **Stack**             | Single stack (`prod`)                                                                                        |
| **Config management** | `Pulumi.prod.yaml` with encrypted secrets (Pulumi Cloud passphrase)                                          |

### Architecture

```
┌──────────────┐                               ┌──────────────────┐
│  Developer   │──── git push / PR ────────────►│  GitHub Actions  │
└──────────────┘                                └────────┬─────────┘
                                                         │
                               ┌─────────────────────────┼─────────────────────────┐
                               │                         │                         │
                               ▼                         ▼                         ▼
                    ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
                    │  pulumi-preview    │    │  pulumi-up         │    │  Pulumi Cloud      │
                    │  (PRs, infra/)     │    │  (main, infra/)    │    │  (state backend)   │
                    └────────────────────┘    └────────┬───────────┘    └────────────────────┘
                                                       │
                              ┌─────────────────────────┼─────────────────────────┐
                              │                         │                         │
                              ▼                         ▼                         ▼
                    ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
                    │  DigitalOcean    │     │  Auth0           │     │  Cloudflare      │
                    │  App Platform    │     │  API + Client    │     │  DNS Records     │
                    └──────────────────┘     └──────────────────┘     └──────────────────┘
```

### What's Working Well

- **TypeScript IaC** in a TypeScript monorepo -- single language across frontend, backend, and infrastructure
- **Encrypted secrets** managed in config without external secret manager
- **Zero cost** -- well within Pulumi Cloud's free tier (200 resources, 500 deployment minutes)
- **GitHub Actions integration** -- preview on PR, deploy on merge, working smoothly
- **Small footprint** -- 255 lines is trivially maintainable

### Pain Points

None significant. The current setup is small, working, and free. This evaluation is forward-looking: should we stay on Pulumi as infrastructure grows, or switch while the codebase is small?

---

## Evaluation Criteria

| Criterion                 | Why It Matters                                                                  |
| ------------------------- | ------------------------------------------------------------------------------- |
| **Language & DX**         | TypeScript developer writing TypeScript infra -- how natural is the experience? |
| **Provider coverage**     | Must support DigitalOcean, Auth0, Cloudflare, Neon; future: Vercel, GitHub      |
| **State management**      | Reliability, encryption, locking, cost at solo scale                            |
| **Pricing**               | Solo developer; must be free or near-free                                       |
| **CI/CD integration**     | GitHub Actions preview/deploy workflow quality                                  |
| **Community & ecosystem** | Documentation, support, job market relevance                                    |
| **License & longevity**   | Open source status, vendor risk, long-term viability                            |
| **Migration cost**        | Effort to switch away from or between tools                                     |

---

## Tool Profiles

### 1. Pulumi (Current)

Open-source IaC platform using general-purpose programming languages (TypeScript, Python, Go, C#, Java, YAML). Founded 2017 in Seattle. $99M total funding (Series C, October 2023). ~100 employees. $17.3M revenue in 2024. Ranked #154 on Deloitte's 2025 Technology Fast 500.

| Criterion            | Details                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Language**         | TypeScript, Python, Go, C#, Java, YAML                                                                        |
| **License**          | Apache 2.0 (engine + CLI); Pulumi Cloud is proprietary SaaS                                                   |
| **State backend**    | Pulumi Cloud (default, free for individuals), S3, Azure Blob, GCS, local filesystem, PostgreSQL               |
| **Free tier**        | Individual: 200 IaC resources, 25 secrets, 500 deployment minutes/mo, unlimited stacks                        |
| **Team pricing**     | $0.37/resource/mo + $0.50/secret/mo; 150K free credits/mo (~200 resources free); $0.01/deploy minute after 3K |
| **Registry**         | 190+ packages (native + bridged); can use ANY Terraform provider via `pulumi package add`                     |
| **Provider quality** | Native providers for AWS, Azure, GCP, Kubernetes; bridged from Terraform for everything else                  |
| **IDE support**      | Full TypeScript: autocomplete, type checking, refactoring, go-to-definition, inline documentation             |
| **Testing**          | Unit tests with standard test frameworks (Vitest, Jest, pytest, Go testing); integration test support         |
| **CI/CD**            | Official GitHub Action (`pulumi/actions`); PR preview comments; 500 free deploy minutes                       |
| **Secrets**          | Built-in encryption; per-stack keys; extensible to AWS KMS, Azure Key Vault, GCP KMS, HashiCorp Vault         |

**Recent developments (2025-2026):**

- Native HCL support (private beta, GA expected Q1 2026) -- run Terraform/OpenTofu HCL directly in Pulumi engine
- Terraform state management in Pulumi Cloud (private beta) -- serve as state backend for Terraform/OpenTofu
- `pulumi convert` improvements -- 90-95% automated conversion from HCL to TypeScript/Python/Go/C#
- Any Terraform Provider support -- `pulumi package add terraform-provider <name>` generates typed SDK locally
- Neo AI agent with Terraform migration skills
- 27 new providers added to Pulumi Registry (March 2025)

**Key strength for this project:** TypeScript IaC in a TypeScript monorepo. Full IDE support, type safety, and the ability to use standard language constructs (loops, conditionals, functions, classes) for infrastructure code. The existing ~255 lines of TypeScript are clean, readable, and use typed provider SDKs.

**Key weakness:** Smaller community than Terraform. When searching for solutions to provider-specific issues, Terraform examples are 10-20x more common on Stack Overflow and in blog posts. You often need to mentally translate Terraform examples into Pulumi equivalents.

---

### 2. Terraform / OpenTofu

Terraform: the original IaC tool by HashiCorp (now IBM, acquired February 2025 for $6.4B). OpenTofu: community fork (Linux Foundation, MPL 2.0) created after HashiCorp changed Terraform's license to BSL in August 2023. Both use the HashiCorp Configuration Language (HCL).

| Criterion                   | Details                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Language**                | HCL (domain-specific); CDK-TF was available for TypeScript but deprecated December 2025                                         |
| **Terraform license**       | Business Source License 1.1 (BSL) -- free for most uses; restricts competitive commercial offerings                             |
| **OpenTofu license**        | Mozilla Public License 2.0 (MPL) -- truly open source, Linux Foundation governance                                              |
| **State backend**           | S3 + DynamoDB (locking), Azure Blob, GCS, Terraform Cloud, Consul, local filesystem                                             |
| **HCP Terraform Free tier** | 500 managed resources, unlimited users, 1 concurrent run; SSO, Sentinel/OPA policy, run tasks                                   |
| **HCP Terraform paid**      | Standard: $0.47/resource/mo; Premium: $0.99/resource/mo                                                                         |
| **Registry**                | 6,100+ providers, 21,380+ modules -- the largest IaC ecosystem by a wide margin                                                 |
| **Provider quality**        | First-party and community providers; most providers are Terraform-native (Pulumi bridges from these)                            |
| **IDE support**             | HCL: VS Code extension with autocomplete and validation; no type-checking comparable to TypeScript                              |
| **Testing**                 | `terraform test` (HCL-native, added 2023); Terratest (Go); `terraform validate` and `terraform plan`                            |
| **CI/CD**                   | HCP Terraform: native GitHub integration with PR plan comments; GHA: `hashicorp/setup-terraform` action                         |
| **Secrets**                 | HCP Terraform encrypts state at rest; OpenTofu has built-in client-side state encryption; Terraform OSS requires backend config |

**Terraform/OpenTofu split considerations:**

- Terraform BSL: HashiCorp announced open-source Terraform under BSL will be discontinued after July 2025. Organizations must pay for Terraform Enterprise or migrate to OpenTofu/alternatives.
- OpenTofu 1.x: feature parity with Terraform 1.x plus additions (state encryption, early variable evaluation, for_each on providers). Community-driven development under Linux Foundation governance.
- Provider compatibility: OpenTofu uses the same provider protocol; all Terraform providers work with OpenTofu.

**Key strength:** Ecosystem dominance. 6,100+ providers vs Pulumi's 190+. Every cloud service, SaaS tool, and API has a Terraform provider. Documentation, blog posts, Stack Overflow answers, and community modules are vastly more abundant. If you hit a problem, someone has already solved it in Terraform.

**Key weakness for this project:** HCL is a domain-specific language that requires learning new syntax, patterns, and idioms. For a TypeScript developer, switching from TypeScript IaC to HCL is a downgrade in expressiveness, type safety, and IDE support. CDK-TF (TypeScript for Terraform) was deprecated in December 2025, removing the TypeScript option entirely.

---

## Head-to-Head Comparison

### 1. Language & Developer Experience

| Dimension                       | Pulumi (TypeScript)                 | Terraform (HCL)                                        |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| **Native TypeScript**           | Yes                                 | No (HCL)                                               |
| **IDE autocomplete**            | Full (native TS)                    | Limited (HCL extension)                                |
| **Type checking**               | Compile-time errors                 | `terraform validate` (runtime)                         |
| **Loops & conditionals**        | Standard TS (`for`, `if`, `.map()`) | `count`, `for_each`, `dynamic` blocks (DSL constructs) |
| **Code reuse**                  | Functions, classes, npm packages    | Modules (HCL-specific, file-based)                     |
| **Refactoring**                 | IDE rename, extract function        | Manual search-replace                                  |
| **Debugging**                   | Standard Node.js debugging          | `terraform console`, log inspection                    |
| **Testing**                     | Vitest/Jest (unit), Pulumi mocks    | `terraform test`, Terratest (Go)                       |
| **Learning curve (for TS dev)** | Near zero -- it is TypeScript       | Moderate -- new DSL, new patterns                      |

**Example comparison -- creating a Cloudflare DNS record:**

Pulumi (TypeScript):

```typescript
const dnsRecord = new cloudflare.Record("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "CNAME",
  content: appHostname,
  proxied: true,
  ttl: 1,
});
```

Terraform (HCL):

```hcl
resource "cloudflare_record" "mattbutlerengineering_dns" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CNAME"
  content = digitalocean_app.mattbutlerengineering_app.default_ingress
  proxied = true
  ttl     = 1
}
```

The syntax is similar for simple resources. The difference becomes significant with complex logic -- iterating over lists, conditional resource creation, string manipulation, and sharing code between stacks. In TypeScript, these are standard language features. In HCL, they require learning `count`, `for_each`, `dynamic` blocks, `lookup()`, `try()`, and other HCL-specific constructs.

**Verdict:** For a TypeScript developer, Pulumi provides the most natural experience. HCL requires learning a new language that is deliberately less expressive than TypeScript.

### 2. Provider Coverage

| Provider            | Terraform Registry        | Pulumi Registry                         | Notes                                    |
| ------------------- | ------------------------- | --------------------------------------- | ---------------------------------------- |
| **DigitalOcean**    | Yes (official)            | Yes (bridged, v4.56.0, Dec 2025)        | Pulumi bridges from Terraform provider   |
| **Auth0**           | Yes (official)            | Yes (bridged)                           | Both actively maintained                 |
| **Cloudflare**      | Yes (official)            | Yes (bridged)                           | Both actively maintained                 |
| **Neon**            | Yes (community, kislerdm) | Yes (bridged, v0.12.0, Nov 2025)        | Community-maintained in both ecosystems  |
| **Vercel**          | Yes (official)            | Yes (bridged, v3.15.1, Sep 2025)        | Both actively maintained                 |
| **GitHub**          | Yes (official)            | Yes (bridged)                           | Both actively maintained                 |
| **Total providers** | ~6,100+                   | ~190+ in registry; unlimited via bridge | Pulumi can bridge ANY Terraform provider |

**The bridge story is critical:** Pulumi's `pulumi package add terraform-provider <name>` generates a fully typed local SDK for any Terraform provider. This means Pulumi has effective access to the entire Terraform provider ecosystem, though bridged providers may lag behind the source Terraform provider's releases and occasionally have edge-case bugs in type translation.

**Provider quality reality:**

- Native Pulumi providers (AWS, Azure, GCP, Kubernetes) are excellent -- built from cloud APIs, complete coverage, same-day updates
- Bridged providers (DigitalOcean, Auth0, Cloudflare, Neon, Vercel) are good but are derivatives. When the upstream Terraform provider has a bug, the Pulumi bridge inherits it. When the Terraform provider ships a new resource, the Pulumi bridge must be updated to expose it.
- For the 6 providers this project uses, all have working Pulumi bridged providers with active maintenance

**Verdict:** Provider coverage is a non-issue for this project's current and planned providers. The gap matters for exotic or niche providers, but DigitalOcean, Auth0, Cloudflare, Neon, Vercel, and GitHub are all well-supported in both ecosystems.

### 3. State Management

| Dimension                    | Pulumi Cloud            | HCP Terraform (Free) | Terraform + S3              | OpenTofu + S3              |
| ---------------------------- | ----------------------- | -------------------- | --------------------------- | -------------------------- |
| **Cost**                     | $0 (Individual)         | $0 (500 resources)   | ~$1/mo (S3 + DynamoDB)      | ~$1/mo (S3 + DynamoDB)     |
| **State encryption at rest** | Yes (default)           | Yes (default)        | Configurable (S3 SSE)       | Yes (built-in client-side) |
| **State locking**            | Yes (default)           | Yes (default)        | DynamoDB (manual setup)     | DynamoDB (manual setup)    |
| **Secrets in state**         | Encrypted per-stack     | Encrypted at rest    | Plaintext unless configured | Encrypted (built-in)       |
| **Concurrent access**        | Handled by Pulumi Cloud | Handled by HCP       | DynamoDB lock table         | DynamoDB lock table        |
| **History/audit**            | Full deployment history | Run history          | Manual (S3 versioning)      | Manual (S3 versioning)     |
| **Setup effort**             | Zero (default backend)  | Account creation     | S3 bucket + DynamoDB + IAM  | S3 bucket + DynamoDB + IAM |

**Solo developer reality:** For ~10 managed resources, state management is trivially simple with any option. Pulumi Cloud and HCP Terraform free tiers are both massively over-provisioned for this use case. The operational burden of self-hosted S3 state is not justified at this scale.

**OpenTofu's built-in state encryption** is a notable differentiator over Terraform -- it encrypts the entire state file client-side before sending to any backend, with keys that never leave your machine. This is the strongest security posture of the four options, but only matters if state file security is a primary concern.

**Verdict:** Pulumi Cloud's zero-setup managed state is the simplest option and is free. No reason to change.

### 4. Pricing Comparison

#### Free Tier Comparison

| Feature                | Pulumi Cloud Individual | HCP Terraform Free           | OpenTofu (self-hosted) |
| ---------------------- | ----------------------- | ---------------------------- | ---------------------- |
| **IaC resources**      | 200                     | 500                          | Unlimited (you host)   |
| **Secrets**            | 25                      | N/A (managed by variables)   | N/A                    |
| **Users**              | 1                       | Unlimited                    | N/A                    |
| **Deployment minutes** | 500/mo                  | Unlimited (1 concurrent run) | N/A                    |
| **State encryption**   | Yes                     | Yes                          | Yes (built-in)         |
| **Policy as code**     | No                      | Yes (Sentinel + OPA)         | No (community tools)   |
| **SSO**                | No                      | Yes                          | N/A                    |
| **Cost**               | $0                      | $0                           | $0 + hosting costs     |

#### Paid Tier Comparison (Team/Standard)

| Feature                      | Pulumi Team                         | HCP Terraform Standard               |
| ---------------------------- | ----------------------------------- | ------------------------------------ |
| **Base cost**                | $0.37/resource/mo + $0.50/secret/mo | $0.47/resource/mo                    |
| **Free credits**             | 150K/mo (~200 resources)            | 500 resources on Free tier           |
| **Deploy minutes**           | 3,000/mo free, then $0.01/min       | Unlimited (3 concurrent runs)        |
| **Price at 50 resources**    | ~$0/mo (within free credits)        | ~$0/mo (within free tier)            |
| **Price at 500 resources**   | ~$111/mo                            | ~$0/mo (Free) or ~$235/mo (Standard) |
| **Price at 1,000 resources** | ~$296/mo                            | ~$470/mo                             |

**Note on HCP Terraform Free tier transition:** The legacy Free plan reaches end of life on March 31, 2026. Remaining organizations will be automatically transitioned to the enhanced Free tier (500 managed resources, unlimited users, SSO, Sentinel/OPA policy).

#### Solo Developer Cost Analysis

At ~10 managed resources with the current Pulumi Cloud Individual free tier: **$0/mo**. This project would need to grow to 200+ resources before hitting any payment threshold on Pulumi, or 500+ on HCP Terraform.

**Verdict:** Both are free at this scale. Pulumi's free tier (200 resources) is sufficient for substantial growth. HCP Terraform's free tier (500 resources) is more generous on resource count but the practical difference is irrelevant for a solo developer managing ~10 resources.

### 5. CI/CD Integration

| Dimension                | Pulumi                                          | Terraform / OpenTofu                               |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------- |
| **GitHub Action**        | `pulumi/actions` (official)                     | `hashicorp/setup-terraform` (official)             |
| **PR preview comments**  | Yes (`comment-on-pr-number`, `edit-pr-comment`) | Yes (with scripting or HCP Terraform)              |
| **Auto-apply on merge**  | Yes (`pulumi up` in workflow)                   | Yes (`terraform apply` in workflow)                |
| **Managed deployments**  | Pulumi Deployments ($0.01/min, 500 free min)    | HCP Terraform (runs included in plan)              |
| **Setup complexity**     | Add `PULUMI_ACCESS_TOKEN` secret + cloud creds  | Add cloud creds; optionally `TF_API_TOKEN` for HCP |
| **This project's setup** | Working (`pulumi-preview.yml`, `pulumi-up.yml`) | Would need rewrite                                 |

**Current GitHub Actions workflow quality:** The existing Pulumi GHA workflows are clean and functional. Preview runs on PRs touching `infrastructure/pulumi/**`, deploy runs on push to main. This is the correct pattern and would be nearly identical in structure with Terraform.

**Pulumi's PR comment support:** The `pulumi/actions` GitHub Action supports `comment-on-pr-number` to post preview results directly to PRs, and `edit-pr-comment` to update existing comments instead of creating new ones. This is functionally equivalent to Terraform's PR plan comments (via HCP Terraform or community actions).

**Verdict:** Equivalent. Both have mature GitHub Actions integrations. The current Pulumi setup is working well.

### 6. Ecosystem & Community

| Dimension                    | Pulumi                                       | Terraform                              | OpenTofu                                    |
| ---------------------------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| **GitHub stars**             | ~22K                                         | ~43K                                   | ~25K                                        |
| **Stack Overflow questions** | ~1,500                                       | ~35,000+                               | ~500                                        |
| **Registry packages**        | 190+                                         | 6,100+ providers, 21,380+ modules      | Uses Terraform providers                    |
| **Documentation quality**    | Good; API docs auto-generated from providers | Excellent; most comprehensive IaC docs | Good; mirrors Terraform + additions         |
| **Community Slack/Discord**  | Active Pulumi Community Slack                | HashiCorp Community Forum              | OpenTofu Slack                              |
| **Job market demand**        | ~1,000 LinkedIn listings                     | ~10,000+ LinkedIn listings             | Emerging (included in "Terraform" listings) |
| **Blog posts & tutorials**   | Growing; hundreds of blog posts              | Dominant; thousands of tutorials       | Growing fork-specific content               |

**Job market reality:** Terraform dominates IaC hiring. For a solo developer this is irrelevant to the tool choice, but as a transferable skill, Terraform experience is ~10x more marketable. However, Pulumi experience demonstrates programming-language IaC skills that are increasingly valued.

**Support when stuck:** This is where Terraform's ecosystem advantage is tangible. When you encounter a provider bug or need a workaround, the probability of finding a Terraform solution (HCL example, GitHub issue, blog post) is much higher. With Pulumi, you often find the Terraform solution and translate it mentally to Pulumi TypeScript -- this works but adds friction.

**Verdict:** Terraform has a vastly larger ecosystem and community. For a solo developer who may need to debug provider issues, this matters. However, Pulumi's community is sufficient for mainstream use cases, and the "translate from Terraform examples" pattern is workable.

### 7. License & Risk Assessment

| Dimension                | Pulumi                                                                    | Terraform (BSL)                                                    | OpenTofu (MPL 2.0)                                         |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| **License**              | Apache 2.0 (engine/CLI)                                                   | Business Source License 1.1                                        | Mozilla Public License 2.0                                 |
| **Open source?**         | Engine: yes. Cloud: no.                                                   | No (BSL restricts commercial use)                                  | Yes (Linux Foundation)                                     |
| **Corporate backing**    | Pulumi Corp ($99M raised, Series C)                                       | IBM/HashiCorp ($6.4B acquisition)                                  | Linux Foundation + community sponsors                      |
| **Revenue**              | $17.3M (2024)                                                             | Part of IBM (HashiCorp ~$600M ARR pre-acquisition)                 | N/A (foundation project)                                   |
| **Employees**            | ~100                                                                      | ~3,000 (HashiCorp, pre-acquisition)                                | Community maintainers + corporate sponsors                 |
| **Vendor lock-in risk**  | Low -- Apache 2.0 CLI; state exportable; S3 backend available             | Low -- BSL still allows free use; HCL is open format               | Lowest -- fully open source, foundation-governed           |
| **Discontinuation risk** | Medium -- VC-funded startup; $17.3M revenue is healthy but not profitable | Low -- IBM backing, but IBM has history of neglecting acquisitions | Low -- foundation-governed, cannot be re-licensed          |
| **Key risk**             | Startup could be acquired or run out of runway                            | IBM could deprioritize, raise prices, or further restrict license  | Community velocity could slow without corporate investment |

**Pulumi's startup risk, honestly assessed:**

- $99M raised, $17.3M revenue (2024) = ~5.6x revenue-to-funding ratio, which is reasonable for a growth-stage startup
- Deloitte Fast 500 ranking (#154) suggests healthy growth
- ~100 employees is lean; burn rate appears sustainable
- The Apache 2.0 engine means the CLI and core could be community-maintained even if Pulumi Corp fails
- The Pulumi Cloud SaaS would be the at-risk component; but self-hosted S3 backend is a fallback

**IBM/HashiCorp risk, honestly assessed:**

- IBM's acquisition track record is mixed (Red Hat: successful; Weather Company, Kyndryl: mixed; Lotus Notes, Rational: decline)
- BSL license change already fragmented the community (OpenTofu fork)
- Terraform Enterprise pricing increases are likely under IBM ownership
- The free tier exists today but IBM could reduce it

**Verdict:** All three tools have acceptable risk profiles. Pulumi's Apache 2.0 engine provides a safety net. OpenTofu has the strongest open-source guarantee. Terraform's BSL is the most uncertain long-term.

### 8. Migration Paths

| Migration                  | Effort   | Tooling                                                                                                                                                                          |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pulumi -> Terraform**    | High     | No automated tool. Manual rewrite of TypeScript to HCL. `pulumi stack export` to get state, then `terraform import` for each resource. For 255 lines / ~10 resources: 4-8 hours. |
| **Pulumi -> OpenTofu**     | High     | Same as Pulumi -> Terraform (OpenTofu uses HCL).                                                                                                                                 |
| **Terraform -> Pulumi**    | Medium   | `pulumi convert --from terraform` handles 90-95% of HCL. `pulumi import` for state. Neo AI agent assists. For a small project: 2-4 hours.                                        |
| **Terraform -> OpenTofu**  | Very Low | Drop-in replacement. `s/terraform/tofu/g` in CI. Same HCL, same state format, same providers. 30-60 minutes.                                                                     |
| **OpenTofu -> Terraform**  | Very Low | Reverse of above, minus OpenTofu-specific features (state encryption config). 30-60 minutes.                                                                                     |
| **Any -> Import existing** | Low      | All three support importing existing cloud resources: `pulumi import`, `terraform import`, `tofu import`.                                                                        |

**Migration cost from current Pulumi setup:**

- 2 files, ~255 lines, ~10 resources
- At this scale, migration to any tool is 4-8 hours of work
- The "switching cost" argument does not apply -- the codebase is trivially small
- The real question is: which tool is the best choice going forward, not which avoids migration

**Verdict:** Migration cost is negligible at current scale. This should not be a factor in the decision.

### 9. Solo Developer Perspective

| Dimension                     | Pulumi                                                     | Terraform/OpenTofu                                        |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| **Single language stack**     | Yes -- TypeScript everywhere                               | No -- HCL is a separate language                          |
| **Maintenance burden**        | Low -- TypeScript is the one language you already maintain | Medium -- HCL proficiency is a separate skill to maintain |
| **Debugging provider issues** | Translate Terraform solutions to Pulumi TS                 | Direct access to the largest solution pool                |
| **Code reuse with app code**  | Natural -- share types, use same tooling                   | Separate ecosystem -- no code sharing                     |
| **Cognitive load**            | Low -- one language, one set of patterns                   | Higher -- context-switch between HCL and TypeScript       |
| **Community help**            | Smaller but growing; Pulumi Slack is responsive            | Massive -- every question has been asked                  |

**The honest solo developer question:** Is the TypeScript DX advantage worth the smaller community?

For this project: **yes.** The infrastructure is simple (10 resources, 2 files). The providers are mainstream (all well-supported in Pulumi). The community size disadvantage manifests primarily with exotic provider configurations or edge cases -- not with basic DigitalOcean App Platform + Auth0 + Cloudflare setups.

If this project were managing 50+ AWS services with complex networking, IAM policies, and multi-account setups, the Terraform ecosystem advantage would be decisive. At the current scale, the TypeScript-native experience is the more impactful factor.

### 10. 2025-2026 Market Trends

**Terraform remains dominant but fragmenting:**

- BSL license change (August 2023) created permanent community distrust
- IBM acquisition (February 2025, $6.4B) adds enterprise uncertainty
- HashiCorp announced Terraform open-source under BSL discontinued after July 2025
- Organizations must choose: pay for Terraform Enterprise, migrate to OpenTofu, or adopt alternatives

**OpenTofu is gaining institutional backing:**

- Linux Foundation governance provides long-term stability
- Feature innovations (state encryption, early variable evaluation) are differentiating from Terraform
- Drop-in Terraform compatibility makes migration trivial
- Unclear if community velocity can match HashiCorp/IBM's investment long-term

**Pulumi is growing but from a smaller base:**

- $17.3M revenue in 2024, Deloitte Fast 500 ranking
- "Any Terraform Provider" support effectively eliminates the provider gap
- HCL support (Q1 2026 GA) positions Pulumi as a platform for all IaC, not just programming-language IaC
- Terraform state management in Pulumi Cloud is a bold play to attract Terraform users

**The broader trend:** The IaC market is moving from "one tool" to "platforms that support multiple approaches." Pulumi's HCL support and Terraform state management in Pulumi Cloud is the clearest signal of this convergence. Organizations in 2025 averaged 2.6 cloud providers (up from 1.9 in 2023), forcing IaC tools to handle cross-platform state management and unified governance.

---

## Comparison Tables

### Overall Scoring

| Criterion                      | Pulumi                  | Terraform (HCL) | OpenTofu (HCL)      |
| ------------------------------ | ----------------------- | --------------- | ------------------- |
| **Language & DX (for TS dev)** | 10/10                   | 5/10            | 5/10                |
| **Provider coverage**          | 8/10 (9/10 with bridge) | 10/10           | 10/10               |
| **State management**           | 9/10                    | 8/10            | 9/10 (encryption)   |
| **Free tier generosity**       | 9/10                    | 9/10            | 10/10 (self-hosted) |
| **Community & ecosystem**      | 6/10                    | 10/10           | 6/10                |
| **License & longevity**        | 8/10                    | 6/10 (BSL)      | 9/10 (MPL)          |
| **CI/CD integration**          | 9/10                    | 9/10            | 8/10                |
| **Solo developer fit**         | 9/10                    | 6/10            | 6/10                |
| **Weighted total**             | **8.5**                 | **7.9**         | **7.9**             |

### Pricing at Scale

| Resources Managed | Pulumi Cloud | HCP Terraform (Free)  | HCP Terraform (Standard) | Self-hosted (S3) |
| ----------------- | ------------ | --------------------- | ------------------------ | ---------------- |
| 10                | $0           | $0                    | $4.70/mo                 | ~$1/mo           |
| 50                | $0           | $0                    | $23.50/mo                | ~$1/mo           |
| 200               | $0           | $0                    | $94/mo                   | ~$1/mo           |
| 500               | ~$111/mo     | $0                    | $235/mo                  | ~$1/mo           |
| 1,000             | ~$296/mo     | N/A (over free limit) | $470/mo                  | ~$1/mo           |

Note: HCP Terraform Free tier caps at 500 resources. Pulumi Individual caps at 200 resources. Both require paid plans beyond those thresholds.

---

## Eliminated Options

| Tool               | Elimination Reason                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CDK-TF**         | Deprecated by HashiCorp in December 2025. Was the TypeScript-on-Terraform option; no longer a viable path.                                                                         |
| **AWS CDK**        | AWS-only. This project uses DigitalOcean, Auth0, Cloudflare, Neon -- none of which are AWS services. Not viable.                                                                   |
| **SST (Ion)**      | Built on Pulumi, focused on AWS serverless. No SST components for DigitalOcean or Auth0. Requires AWS account for state storage. Only makes sense on AWS with serverless patterns. |
| **Crossplane**     | Kubernetes-native IaC. Requires a running Kubernetes cluster as the control plane. Massive over-engineering for a solo developer managing ~10 cloud resources.                     |
| **Ansible**        | Configuration management tool, not infrastructure provisioning. Different use case entirely.                                                                                       |
| **CloudFormation** | AWS-only, YAML/JSON syntax. Not relevant for non-AWS infrastructure.                                                                                                               |

---

## Recommended Shortlist

### #1 Pulumi (TypeScript) -- Stay (Recommended)

**The recommendation is to stay on Pulumi.** The current setup is working well, costs nothing, and provides the best developer experience for a TypeScript monorepo. There is no compelling reason to switch.

**Why stay:**

1. **TypeScript-native DX** -- the decisive advantage. Full IDE support, type safety, standard language constructs. Infrastructure code is just TypeScript code in a TypeScript monorepo.
2. **Zero migration cost** -- the setup is already done, working, and integrated with GitHub Actions.
3. **Zero monetary cost** -- well within the free tier with room to grow 20x before hitting payment thresholds.
4. **Provider coverage is sufficient** -- all current and planned providers (DigitalOcean, Auth0, Cloudflare, Neon, Vercel, GitHub) have actively maintained Pulumi providers.
5. **Any Terraform Provider bridge** eliminates the long-tail provider risk -- if a new provider is needed that only exists in Terraform's registry, `pulumi package add` generates a typed Pulumi SDK.
6. **Apache 2.0 engine** provides a safety net if Pulumi Corp has financial difficulties.
7. **Pulumi Cloud self-hosted fallback** -- `pulumi login s3://bucket` switches state to S3 if the managed service becomes untenable.

**Action items:**
| Action | Effort | Impact |
|--------|--------|--------|
| No changes needed | 0 min | Current setup is optimal for project scale |
| Bookmark Pulumi self-hosted backend docs | 5 min | Fallback plan if Pulumi Cloud ever becomes untenable |
| Monitor Pulumi HCL GA (Q1 2026) | Passive | Indicates platform health and strategic direction |

### #2 OpenTofu -- Best Alternative (If Switching)

If switching away from Pulumi for any reason, OpenTofu is the recommended target:

1. **Truly open source** (MPL 2.0, Linux Foundation) -- no licensing uncertainty
2. **Full Terraform ecosystem** -- 6,100+ providers, 21,380+ modules, massive community knowledge base
3. **Built-in state encryption** -- strongest security posture for state files
4. **Drop-in Terraform compatibility** -- every Terraform tutorial, blog post, and Stack Overflow answer applies

**When to reconsider:**

- If Pulumi Corp shows signs of financial distress (layoffs, reduced update cadence, pricing increases)
- If a critical provider is poorly maintained in the Pulumi bridge but well-maintained in Terraform
- If hiring a team becomes a priority (Terraform/HCL skills are 10x more common in the job market)

**Trade-offs:**

- Lose TypeScript DX; must learn HCL
- Lose integrated secrets encryption (OpenTofu has state encryption but not per-value)
- CDK-TF deprecation means no TypeScript option in the HCL ecosystem
- 4-8 hours migration effort for the current 255-line codebase

### #3 Terraform (HCP) -- Not Recommended (License Risk)

Terraform itself is not recommended due to the BSL license uncertainty under IBM ownership. If choosing the HCL ecosystem, OpenTofu is the better choice -- same language, same providers, open-source license, community governance, plus additional features (state encryption).

The only scenario where Terraform (specifically HCP Terraform) would be preferred over OpenTofu is if you need HCP Terraform's managed features (Sentinel policies, run tasks, private registry) and are willing to pay for them. At solo developer scale, this is not the case.

---

## Decision Matrix

| Scenario                                              | Recommended Action                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Current state** (10 resources, 255 lines, solo dev) | Stay on Pulumi. No changes needed.                                                                    |
| **Growing to 50-200 resources**                       | Stay on Pulumi. Still within free tier. Consider Pulumi component resources for organization.         |
| **Growing to 500+ resources**                         | Evaluate Pulumi Team pricing vs self-hosted S3 backend vs HCP Terraform Free tier                     |
| **Hiring a team**                                     | Re-evaluate. Terraform/HCL is more widely known. Team onboarding friction matters.                    |
| **Critical provider issue in Pulumi bridge**          | Use `pulumi package add terraform-provider` to generate local SDK; or contribute fix upstream         |
| **Pulumi Corp financial distress**                    | Migrate state to S3 backend (`pulumi login s3://bucket`); engine is Apache 2.0, continues working     |
| **Need Terraform ecosystem for complex AWS**          | Consider OpenTofu for that specific stack; Pulumi and OpenTofu can coexist (different state backends) |

---

## Re-Evaluation Triggers

Watch for these events that should trigger a fresh evaluation:

1. **Pulumi pricing changes** -- any reduction in the free tier (currently 200 resources) or introduction of mandatory paid features
2. **Pulumi Corp financial signals** -- significant layoffs, reduced release cadence, acquisition rumors
3. **Hiring a team** -- HCL/Terraform skills are 10x more common; team onboarding cost changes the calculus
4. **Infrastructure complexity spike** -- moving to 50+ resources or complex multi-cloud setups where Terraform's ecosystem depth matters
5. **Provider quality issues** -- if bridged providers consistently lag behind Terraform providers for critical resources
6. **Pulumi HCL GA (Q1 2026)** -- if Pulumi becomes a universal IaC platform supporting both TypeScript and HCL, the comparison changes fundamentally
7. **OpenTofu ecosystem maturity** -- as OpenTofu develops unique features beyond Terraform, it may become the clear HCL-ecosystem choice
8. **IBM/HashiCorp pricing actions** -- any changes to HCP Terraform free tier or BSL terms

---

## Sources

### Pulumi

- [Pulumi Pricing](https://www.pulumi.com/pricing/)
- [Pulumi Registry](https://www.pulumi.com/registry/)
- [Pulumi State and Backends](https://www.pulumi.com/docs/iac/concepts/state-and-backends/)
- [Pulumi vs Terraform Comparison (Pulumi Docs)](https://www.pulumi.com/docs/iac/comparisons/terraform/)
- [Any Terraform Provider Support](https://www.pulumi.com/blog/any-terraform-provider/)
- [Expanding the Pulumi Registry: 27 New Providers](https://www.pulumi.com/blog/registry-wave-2/)
- [Using Any Terraform Provider in Pulumi](https://www.pulumi.com/docs/iac/concepts/providers/any-terraform-provider/)
- [Pulumi GitHub Actions](https://www.pulumi.com/docs/iac/guides/continuous-delivery/github-actions/)
- [Pulumi for All Your IaC -- Including Terraform and HCL](https://www.pulumi.com/blog/all-iac-including-terraform-and-hcl/)
- [Converting Full Terraform Programs to Pulumi](https://www.pulumi.com/blog/converting-full-terraform-programs-to-pulumi/)
- [Pulumi Year in Review 2024](https://www.pulumi.com/blog/pulumi-year-in-review/)
- [Pulumi State Management (Spacelift)](https://spacelift.io/blog/pulumi-state-management)
- [Pulumi Pricing Editions Overview 2026 (Spacelift)](https://spacelift.io/blog/pulumi-pricing)
- [Pulumi Crunchbase Profile](https://www.crunchbase.com/organization/pulumi-corporation)
- [Pulumi Revenue Data (Latka)](https://getlatka.com/companies/pulumi)

### Terraform & HCP Terraform

- [Terraform Registry](https://registry.terraform.io/)
- [HCP Terraform Plans and Features](https://developer.hashicorp.com/terraform/cloud-docs/overview)
- [HCP Terraform Enhanced Free Tier](https://www.hashicorp.com/en/blog/continuing-hcp-terraform-s-enhanced-free-tier-experience)
- [HCP Terraform Free Tier Changes (Spacelift)](https://spacelift.io/blog/terraform-cloud-free-tier)
- [Terraform Cloud Pricing (Spacelift)](https://spacelift.io/blog/terraform-cloud-pricing)
- [IaC Tools Pricing Comparison](https://dev.to/mechcloud_academy/iac-tool-pricing-comparison-terraform-crossplane-and-pulumi-3oe5)
- [HashiCorp Terraform Ecosystem Passes 3,000 Providers](https://www.hashicorp.com/en/blog/hashicorp-terraform-ecosystem-passes-3-000-providers-with-over-250-partners)

### OpenTofu

- [OpenTofu vs Terraform (Pulumi Docs)](https://www.pulumi.com/docs/iac/comparisons/terraform/opentofu/)
- [OpenTofu vs Terraform (Spacelift)](https://spacelift.io/blog/opentofu-vs-terraform)
- [Terraform vs OpenTofu 2025 (Platform Engineering)](https://platformengineering.org/blog/terraform-vs-opentofu-iac-tool)

### IBM/HashiCorp Acquisition

- [IBM Closes $6.4B HashiCorp Acquisition (TechCrunch)](https://techcrunch.com/2025/02/27/ibm-closes-6-4b-hashicorp-acquisition/)
- [IBM Acquires HashiCorp Announcement](https://newsroom.ibm.com/2024-04-24-IBM-to-Acquire-HashiCorp-Inc-Creating-a-Comprehensive-End-to-End-Hybrid-Cloud-Platform)

### License Comparison

- [Terraform BSL License Analysis](https://dev.to/terraformmonkey/terraform-licensing-the-2023-change-still-shaping-your-2025-strategy-4mfb)
- [Terraform vs Pulumi vs OpenTofu: 2025 IaC Showdown](https://toolshelf.tech/blog/terraform-vs-pulumi-vs-opentofu-2025-iac-showdown/)
- [IaC Comparison 2026 (dasroot.net)](https://dasroot.net/posts/2026/01/infrastructure-as-code-terraform-opentofu-pulumi-comparison-2026/)
- [How To Choose Between Terraform, Pulumi, and OpenTofu](https://www.opensourceforu.com/2025/10/how-to-choose-between-terraform-pulumi-and-opentofu/)

### Market & Adoption

- [DevOps Job Market 2025 Trends](https://prepare.sh/articles/the-devops-job-market-in-2025-trends-tools-and-how-to-stand-out)
- [Top 10 IaC Tools for DevOps 2026](https://dev.to/inboryn_99399f96579fcd705/top-10-iac-tools-for-devops-in-2026-which-one-wins-for-multi-cloud-terraform-pulumi-opentofu-hfb)

### Provider-Specific

- [DigitalOcean Pulumi Provider](https://www.pulumi.com/registry/packages/digitalocean/)
- [Cloudflare Pulumi Provider](https://www.pulumi.com/registry/packages/cloudflare/)
- [Neon Pulumi Provider](https://www.pulumi.com/registry/packages/neon/api-docs/provider/)
- [Neon Pulumi Guide](https://neon.com/guides/neon-pulumi)
- [Vercel Pulumi Provider](https://www.pulumi.com/registry/packages/vercel/api-docs/provider/)
- [Vercel Terraform Provider Releases](https://github.com/vercel/terraform-provider-vercel/releases)
- [Pulumi Adds Native Support for Terraform and HCL (InfoQ)](https://www.infoq.com/news/2026/01/pulumi-adds-terraform-hcl/)

### Comparison Articles

- [Pulumi vs Terraform (Spacelift)](https://spacelift.io/blog/pulumi-vs-terraform)
- [Pulumi vs Terraform (env0)](https://www.env0.com/blog/pulumi-vs-terraform-an-in-depth-comparison)
- [Terraform vs Pulumi 2025 Guide (Atmosly)](https://atmosly.com/knowledge/iac-tools-comparison-terraform-vs-pulumi-2025-guide)
- [Terraform vs Pulumi Unfiltered Guide 2025 (Medium)](https://medium.com/devpulse/terraform-vs-pulumi-the-unfiltered-guide-to-choosing-the-right-infrastructure-as-code-tool-in-2025-e734fb5d8afc)
- [Why I Choose Pulumi Over Terraform (Tech Watching)](https://techwatching.dev/posts/pulumi-vs-terraform)
- [Terraform vs Pulumi vs AWS CDK: 2025 Benchmark](https://sanj.dev/post/terraform-pulumi-aws-cdk-iac-comparison)
