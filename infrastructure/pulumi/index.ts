import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as cloudflare from "@pulumi/cloudflare";
import { readFileSync } from "node:fs";
import { auth0Outputs } from "./auth0";

// ── Env var builders ─────────────────────────────────────────────────
// Collapse the repeated DO App Platform env-var object shape into two
// builders: `secretEnv` for encrypted (SECRET) values and `extraEnv` for
// plain (GENERAL, no `type` field) values. Output is byte-identical to the
// inline literals these replace.
export function secretEnv(
  key: string,
  value: pulumi.Input<string>
): digitalocean.types.input.AppSpecServiceEnv {
  return { key, value, type: "SECRET" };
}

export function extraEnv(
  key: string,
  value: pulumi.Input<string>
): digitalocean.types.input.AppSpecServiceEnv {
  return { key, value };
}

// ── Configuration ───────────────────────────────────────────────────
const config = new pulumi.Config();
const domain = config.require("domain");
const cloudflareZoneId = config.require("cloudflareZoneId");
const cloudflareAccountId = config.require("cloudflareAccountId");

const databaseUrl = config.requireSecret("databaseUrl");
const aiGatewayApiKey = config.getSecret("aiGatewayApiKey");
const manageTokenSecret = config.getSecret("manageTokenSecret");
const unsubscribeTokenSecret = config.getSecret("unsubscribeTokenSecret");

// ── Observability (Grafana Cloud OTLP) ─────────────────────────────
const otelEndpoint = config.get("otelEndpoint") ?? "";
const otelHeaders = config.getSecret("otelHeaders");

// ── Remediation webhook ────────────────────────────────────────────
const remediationWebhookSecret = config.getSecret("remediationWebhookSecret");

const otelEnvs: digitalocean.types.input.AppSpecServiceEnv[] = [
  ...(otelEndpoint ? [extraEnv("OTEL_EXPORTER_OTLP_ENDPOINT", otelEndpoint)] : []),
  ...(otelHeaders ? [secretEnv("OTEL_EXPORTER_OTLP_HEADERS", otelHeaders)] : []),
];

// ── Auth0 Exports ───────────────────────────────────────────────────
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.hospitalityClientId;

// ── Cloudflare KV Namespaces ──────────────────────────────────────────
// Additional KV namespaces beyond the health-state namespace.
const sessionsKv = new cloudflare.WorkersKvNamespace("mattbutlerengineering-sessions", {
  accountId: cloudflareAccountId,
  title: "mattbutlerengineering-sessions",
});

const cacheKv = new cloudflare.WorkersKvNamespace("mattbutlerengineering-cache", {
  accountId: cloudflareAccountId,
  title: "mattbutlerengineering-cache",
});

// ── Exports ─────────────────────────────────────────────────────────
export const sessionsKvNamespaceId = sessionsKv.id;
export const cacheKvNamespaceId = cacheKv.id;

// ── Shared Constants ──────────────────────────────────────────────────
// AUTH_AUTHORITY is defined once and shared by all API services.
// Derived from `auth0:domain` in Pulumi config (Pulumi.prod.yaml).
// Falls back to the dev tenant when auth0:domain is not set (e.g. a fresh
// stack or local run without prod secrets). Flip auth0:domain in
// Pulumi.prod.yaml to the prod tenant when ready — no code change required.
const auth0Config = new pulumi.Config("auth0");
const AUTH_AUTHORITY = `https://${auth0Config.get("domain") ?? "dev-ytbgmz5ls3wh4xdx.us.auth0.com"}`;

export interface ApiServiceArgs {
  name: string;
  port: number;
  dockerfile: string;
  extraEnvs?: digitalocean.types.input.AppSpecServiceEnv[];
}

function sharedEnvs(port: number): digitalocean.types.input.AppSpecServiceEnv[] {
  return [
    extraEnv("NODE_ENV", "production"),
    extraEnv("PORT", String(port)),
    extraEnv("CORS_ORIGIN", `https://${domain}`),
    extraEnv("API_BASE_URL", `https://api.${domain}/api`),
    extraEnv("AUTH_AUTHORITY", AUTH_AUTHORITY),
    extraEnv("AUTH_AUDIENCE", `https://api.${domain}`),
    secretEnv("DATABASE_URL", databaseUrl),
  ];
}

export function apiService(args: ApiServiceArgs): digitalocean.types.input.AppSpecService {
  return {
    name: args.name,
    github: {
      repo: "mattbutlerengineering/mattbutlerengineering",
      branch: "main",
      deployOnPush: false,
    },
    sourceDir: "/",
    dockerfilePath: args.dockerfile,
    instanceCount: 1,
    instanceSizeSlug: "apps-s-1vcpu-0.5gb",
    httpPort: args.port,
    envs: [...sharedEnvs(args.port), ...(args.extraEnvs ?? []), ...otelEnvs],
    healthCheck: {
      httpPath: "/ready",
      initialDelaySeconds: 10,
      periodSeconds: 10,
      timeoutSeconds: 5,
      successThreshold: 1,
      failureThreshold: 3,
    },
  };
}

// ── Per-Service Migration Jobs ──────────────────────────────────────
// Each service gets its own pre-deploy job so a failure in one service's
// migrations does not block unrelated services from deploying.
const MIGRATED_SERVICES = ["users", "reservations", "agent"] as const;

const migrationJobs: digitalocean.types.input.AppSpecJob[] = MIGRATED_SERVICES.map((service) => ({
  name: `db-migrate-${service}`,
  kind: "PRE_DEPLOY" as const,
  github: {
    repo: "mattbutlerengineering/mattbutlerengineering",
    branch: "main",
    deployOnPush: false, // CI triggers deploys via doctl
  },
  sourceDir: "/",
  dockerfilePath: "infrastructure/migrate/Dockerfile",
  envs: [secretEnv("DATABASE_URL", databaseUrl), extraEnv("SERVICE_NAME", service)],
  runCommand: "/migrate.sh",
}));

// ── DO App Platform (API services only) ─────────────────────────────
// Services + migration jobs. Static sites are on CF Pages.
const apiApp = new digitalocean.App(
  "mattbutlerengineering-api-app",
  {
    spec: {
      name: "mattbutlerengineering-api",
      region: "nyc",
      domainNames: [
        {
          name: `api.${domain}`,
          type: "PRIMARY",
          zone: domain,
        },
      ],

      ingress: {
        rules: [
          {
            match: { path: { prefix: "/api/v1/users" } },
            component: { name: "users-api", preservePathPrefix: true },
          },
          // Agent-api routes — must come before /api catch-all
          {
            match: { path: { prefix: "/api/gen" } },
            component: { name: "agent-api", preservePathPrefix: true },
          },
          {
            match: { path: { prefix: "/v1/sessions" } },
            component: { name: "agent-api", preservePathPrefix: true },
          },
          {
            match: { path: { prefix: "/v1/orchestrate" } },
            component: { name: "agent-api", preservePathPrefix: true },
          },
          {
            match: { path: { prefix: "/v1/webhooks" } },
            component: { name: "agent-api", preservePathPrefix: true },
          },
          {
            match: { path: { prefix: "/api" } },
            component: { name: "reservations-api", preservePathPrefix: true },
          },
          // The public booking-widget and guest-self-service surface
          // (/public/v1/venues/**, /public/v1/reservations/manage|confirm,
          // /public/v1/guests/unsubscribe) lives only in reservations. Without
          // this rule those paths matched only the "/" catch-all below, landed
          // on users-api, and answered Fastify's default 404 — the entire
          // surface unreachable in production while every unit test passed.
          // ingress-coverage.test.ts fails if a registered prefix loses its rule.
          {
            match: { path: { prefix: "/public" } },
            component: { name: "reservations-api", preservePathPrefix: true },
          },
          // Catch-all (required by DO) — routes stray requests to users-api
          {
            match: { path: { prefix: "/" } },
            component: { name: "users-api", preservePathPrefix: true },
          },
        ],
      },

      // Per-service pre-deploy migration jobs — each service's deployment
      // depends only on its own migration succeeding (failure isolation).
      // Parameterized via SERVICE_NAME Docker build arg.
      jobs: migrationJobs,

      services: [
        apiService({
          name: "users-api",
          port: 3001,
          dockerfile: "services/users/Dockerfile",
        }),
        apiService({
          name: "reservations-api",
          port: 3004,
          dockerfile: "services/reservations/Dockerfile",
          extraEnvs: [
            ...(manageTokenSecret ? [secretEnv("MANAGE_TOKEN_SECRET", manageTokenSecret)] : []),
            ...(unsubscribeTokenSecret
              ? [secretEnv("UNSUBSCRIBE_TOKEN_SECRET", unsubscribeTokenSecret)]
              : []),
          ],
        }),
        apiService({
          name: "agent-api",
          port: 3003,
          dockerfile: "services/agent/Dockerfile",
          extraEnvs: [
            ...(aiGatewayApiKey ? [secretEnv("AI_GATEWAY_API_KEY", aiGatewayApiKey)] : []),
            extraEnv("DEFAULT_MODEL", "anthropic/claude-haiku-4.5"),
            ...(remediationWebhookSecret
              ? [secretEnv("REMEDIATION_WEBHOOK_SECRET", remediationWebhookSecret)]
              : []),
          ],
        }),
      ],
    },
  },
  {
    customTimeouts: { create: "15m", update: "15m" },
    // Ignore ingress's SIBLINGS, never `spec` itself.
    //
    // This was `ignoreChanges: ["spec"]`, to suppress the DO-injected default
    // fields (top-level `features`, `scope` on env entries, `instance_count` /
    // `instance_size_slug` on jobs and services) that diff on every run and
    // trigger a ~30min full deployment. It also silently made the ingress
    // rules unmanaged: PR #4511's `/public` rule sat correct in source while
    // `pulumi up` reported success with this App `unchanged`, and the entire
    // public booking surface 404ed in production for three months.
    //
    // Now MANAGED (and already byte-equal to the live spec, so narrowing this
    // is intended to produce exactly one diff — the `/public` ingress rule):
    //   name, region, domainNames, ingress
    // Still DELIBERATELY UNMANAGED — env vars, instance sizes and component
    // config remain exactly as unmanaged as they were, and this fix does not
    // claim otherwise (full reconciliation is issue #3277):
    //   spec.features, spec.jobs, spec.services
    //
    // Depth-2 object keys only: no `[*]`, no `[0]`, no array traversal, whose
    // support at this provider version is unvalidated. Whether the engine
    // honors these paths is settled by reading `pulumi preview --diff` — NOT
    // by a green `pulumi up`, which is precisely what meant nothing here.
    // See docs/fixes/public-ingress-never-applied/.
    ignoreChanges: ["spec.features", "spec.jobs", "spec.services"],
  }
);

// API subdomain DNS — proxied: false so DO can verify domain and provision TLS
const _apiDns = new cloudflare.DnsRecord("mattbutlerengineering-api-dns", {
  zoneId: cloudflareZoneId,
  name: "api",
  type: "CNAME",
  content: apiApp.defaultIngress.apply((url) => url.replace("https://", "")),
  proxied: false,
  ttl: 300,
});

// ── Health State KV Namespace ────────────────────────────────────────
// Stores CI and deploy status written by GitHub Actions workflows.
// Read by the edge router's /health/system aggregation endpoint.
const healthKv = new cloudflare.WorkersKvNamespace("mattbutlerengineering-health-state", {
  accountId: cloudflareAccountId,
  title: "mattbutlerengineering-health-state",
});

// ── Cloudflare Worker Edge Router ────────────────────────────────────
// Routes traffic by path prefix to Workers Static Assets (via Service
// Bindings) or DO API app (via HTTP subrequest).
//
// Static site Workers — marketing, hospitality, rialto-web, and gen —
// are all managed as Pulumi WorkersScript resources. Service Bindings
// call app Workers in-process, bypassing the CDN entirely.

// edge-router.js imports circuit-breaker.js, rate-limiter.js, and dep-graph.json.
// The Cloudflare Workers API rejects a worker whose modules are missing at
// initialization — which surfaces as HTTP 403 for every route the worker covers.
// The wrangler.toml `bundle` step (added to pulumi-up.yml) inlines all imports
// into a single ESM file before Pulumi reads it.
const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/dist/edge-router.js", "utf-8"),
  mainModule: "edge-router.js",
  compatibilityDate: "2026-03-25",
  bindings: [
    { name: "API_ORIGIN", text: `https://api.${domain}`, type: "plain_text" },
    { name: "MARKETING", service: "mattbutlerengineering-marketing", type: "service" },
    { name: "HOSPITALITY", service: "mattbutlerengineering-hospitality", type: "service" },
    { name: "RIALTO", service: "mattbutlerengineering-rialto-web", type: "service" },
    { name: "GEN", service: "mattbutlerengineering-gen", type: "service" },
    { name: "HEALTH_STATE", namespaceId: healthKv.id, type: "kv_namespace" },
  ],
});

// ── Gen App Worker (Static Assets) ───────────────────────────────────
// Pulumi-managed CF Worker for the gen playground app. Replaces the
// wrangler deploy in CI. Assets uploaded from apps/gen/dist/ at
// pulumi up time — requires `pnpm build --filter=@mbe/gen` first.
const _genWorker = new cloudflare.WorkersScript("mattbutlerengineering-gen", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-gen",
  compatibilityDate: "2026-03-25",
  assets: {
    directory: "../../apps/gen/dist",
    config: {
      notFoundHandling: "single-page-application",
    },
  },
});

// ── Worker Routes ───────────────────────────────────────────────────
// Worker intercepts all traffic to mattbutlerengineering.com and www.
// Rollback: delete these routes in CF dashboard (instant).
const _workerRoute = new cloudflare.WorkersRoute(
  "edge-router-route",
  {
    zoneId: cloudflareZoneId,
    pattern: `${domain}/*`,
    script: workerScript.scriptName,
  },
  { import: "dfed09378e547f95a3bd645c55ef777d/9ec4971bf1844e1da9c1b2a6fd6f5f94" }
);

const _wwwWorkerRoute = new cloudflare.WorkersRoute(
  "edge-router-www-route",
  {
    zoneId: cloudflareZoneId,
    pattern: `www.${domain}/*`,
    script: workerScript.scriptName,
  },
  { import: "dfed09378e547f95a3bd645c55ef777d/37cfa4e4200048148c4e8f1e7b29f8cb" }
);

// ── DNS Records ─────────────────────────────────────────────────────
// Root domain uses AAAA 100:: (Cloudflare proxy placeholder) so the
// Worker edge-router handles all traffic.
const _dnsRecord = new cloudflare.DnsRecord("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "AAAA",
  content: "100::",
  proxied: true,
  ttl: 1,
});

// WWW subdomain: proxied CNAME → root domain (Worker handles redirect)
const _wwwRecord = new cloudflare.DnsRecord("mattbutlerengineering-www-dns", {
  zoneId: cloudflareZoneId,
  name: "www",
  type: "CNAME",
  content: domain,
  proxied: true,
  ttl: 1,
});

// ── Exports ─────────────────────────────────────────────────────────
export const apiAppUrl = apiApp.liveUrl;
export const apiAppDefaultDomain = apiApp.defaultIngress;
export const appUrl = pulumi.interpolate`https://${domain}`;
export const apiUrl = pulumi.interpolate`https://api.${domain}/api`;
export const hospitalityUrl = pulumi.interpolate`https://${domain}/hospitality`;
export const rialtoUrl = pulumi.interpolate`https://${domain}/rialto`;
export const genUrl = pulumi.interpolate`https://${domain}/gen`;
export const healthKvNamespaceId = healthKv.id;
