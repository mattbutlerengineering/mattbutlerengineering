import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as cloudflare from "@pulumi/cloudflare";
import { readFileSync } from "node:fs";
import { auth0Outputs } from "./auth0";
import { branchProtectionId } from "./github";

// ── Configuration ───────────────────────────────────────────────────
const config = new pulumi.Config();
const domain = config.require("domain");
const cloudflareZoneId = config.require("cloudflareZoneId");
const cloudflareAccountId = config.require("cloudflareAccountId");

const databaseUrl = config.requireSecret("databaseUrl");
const aiGatewayApiKey = config.getSecret("aiGatewayApiKey");

// ── Observability (Grafana Cloud OTLP) ─────────────────────────────
const otelEndpoint = config.get("otelEndpoint") ?? "";
const otelHeaders = config.getSecret("otelHeaders");

// ── Remediation webhook ────────────────────────────────────────────
const remediationWebhookSecret = config.getSecret("remediationWebhookSecret");

const otelEnvs: digitalocean.types.input.AppSpecServiceEnv[] = [
  ...(otelEndpoint ? [{ key: "OTEL_EXPORTER_OTLP_ENDPOINT", value: otelEndpoint }] : []),
  ...(otelHeaders
    ? [{ key: "OTEL_EXPORTER_OTLP_HEADERS", value: otelHeaders, type: "SECRET" as const }]
    : []),
];

// ── Auth0 Exports ───────────────────────────────────────────────────
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.hospitalityClientId;

// ── Cloudflare R2 State Bucket ───────────────────────────────────────
// Bucket for storing Pulumi state backend (S3-compatible).
// Note: Pulumi is pre-configured to use this bucket via AWS_ACCESS_KEY_ID
// and AWS_SECRET_ACCESS_KEY env vars pointing to R2's S3 API.
const pulumiStateBucket = new cloudflare.R2Bucket("mattbutlerengineering-pulumi-state", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-pulumi-state",
  location: "enam",
});

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
export const pulumiStateBucketId = pulumiStateBucket.id;
export const sessionsKvNamespaceId = sessionsKv.id;
export const cacheKvNamespaceId = cacheKv.id;

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
  envs: [
    { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" as const },
    { key: "SERVICE_NAME", value: service },
  ],
  runCommand: "/migrate.sh",
}));

// ── DO App Platform (API services only) ─────────────────────────────
// Services + migration jobs. Static sites are on CF Pages.
const apiApp = new digitalocean.App("mattbutlerengineering-api-app", {
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
      {
        name: "users-api",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: false,
        },
        sourceDir: "/",
        dockerfilePath: "services/users/Dockerfile",
        instanceCount: 1,
        instanceSizeSlug: "apps-s-1vcpu-0.5gb",
        httpPort: 3001,
        envs: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "3001" },
          { key: "CORS_ORIGIN", value: `https://${domain}` },
          { key: "API_BASE_URL", value: `https://api.${domain}/api` },
          { key: "AUTH_AUTHORITY", value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com" },
          { key: "AUTH_AUDIENCE", value: `https://api.${domain}` },
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
          ...otelEnvs,
        ],
        healthCheck: {
          httpPath: "/ready",
          initialDelaySeconds: 10,
          periodSeconds: 10,
          timeoutSeconds: 5,
          successThreshold: 1,
          failureThreshold: 3,
        },
      },
      {
        name: "reservations-api",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: false,
        },
        sourceDir: "/",
        dockerfilePath: "services/reservations/Dockerfile",
        instanceCount: 1,
        instanceSizeSlug: "apps-s-1vcpu-0.5gb",
        httpPort: 3004,
        envs: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "3004" },
          { key: "CORS_ORIGIN", value: `https://${domain}` },
          { key: "API_BASE_URL", value: `https://api.${domain}/api` },
          { key: "AUTH_AUTHORITY", value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com" },
          { key: "AUTH_AUDIENCE", value: `https://api.${domain}` },
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
          ...otelEnvs,
        ],
        healthCheck: {
          httpPath: "/ready",
          initialDelaySeconds: 10,
          periodSeconds: 10,
          timeoutSeconds: 5,
          successThreshold: 1,
          failureThreshold: 3,
        },
      },
      {
        name: "agent-api",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: false,
        },
        sourceDir: "/",
        dockerfilePath: "services/agent/Dockerfile",
        instanceCount: 1,
        instanceSizeSlug: "apps-s-1vcpu-0.5gb",
        httpPort: 3003,
        envs: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "3003" },
          { key: "CORS_ORIGIN", value: `https://${domain}` },
          { key: "API_BASE_URL", value: `https://api.${domain}/api` },
          { key: "AUTH_AUTHORITY", value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com" },
          { key: "AUTH_AUDIENCE", value: `https://api.${domain}` },
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
          ...(aiGatewayApiKey
            ? [{ key: "AI_GATEWAY_API_KEY", value: aiGatewayApiKey, type: "SECRET" as const }]
            : []),
          { key: "DEFAULT_MODEL", value: "anthropic/claude-haiku-4.5" },
          ...(remediationWebhookSecret
            ? [
                {
                  key: "REMEDIATION_WEBHOOK_SECRET",
                  value: remediationWebhookSecret,
                  type: "SECRET" as const,
                },
              ]
            : []),
          ...otelEnvs,
        ],
        healthCheck: {
          httpPath: "/ready",
          initialDelaySeconds: 10,
          periodSeconds: 10,
          timeoutSeconds: 5,
          successThreshold: 1,
          failureThreshold: 3,
        },
      },
    ],
  },
});

// API subdomain DNS — proxied: false so DO can verify domain and provision TLS
const apiDns = new cloudflare.DnsRecord("mattbutlerengineering-api-dns", {
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

const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  scriptName: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/edge-router.js", "utf-8"),
  mainModule: "edge-router.js",
  compatibilityDate: "2026-03-25",
  bindings: [
    { name: "API_ORIGIN", text: `https://api.${domain}`, type: "plain_text" },
    { name: "MARKETING", service: "mattbutlerengineering-marketing", type: "service" },
    { name: "HOSPITALITY", service: "mattbutlerengineering-hospitality", type: "service" },
    { name: "RIALTO", service: "mattbutlerengineering-rialto-web", type: "service" },
    { name: "GEN", service: "mattbutlerengineering-gen", type: "service" },
    {
      name: "MARKETING_CANARY",
      service: "mattbutlerengineering-marketing-canary",
      type: "service",
    },
    {
      name: "HOSPITALITY_CANARY",
      service: "mattbutlerengineering-hospitality-canary",
      type: "service",
    },
    { name: "RIALTO_CANARY", service: "mattbutlerengineering-rialto-web-canary", type: "service" },
    { name: "GEN_CANARY", service: "mattbutlerengineering-gen-canary", type: "service" },
    { name: "HEALTH_STATE", namespaceId: healthKv.id, type: "kv_namespace" },
  ],
});

// ── Gen App Worker (Static Assets) ───────────────────────────────────
// Pulumi-managed CF Worker for the gen playground app. Replaces the
// wrangler deploy in CI. Assets uploaded from apps/gen/dist/ at
// pulumi up time — requires `pnpm build --filter=@mbe/gen` first.
const genWorker = new cloudflare.WorkersScript("mattbutlerengineering-gen", {
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
const workerRoute = new cloudflare.WorkersRoute("edge-router-route", {
  zoneId: cloudflareZoneId,
  pattern: `${domain}/*`,
  script: workerScript.scriptName,
});

const wwwWorkerRoute = new cloudflare.WorkersRoute("edge-router-www-route", {
  zoneId: cloudflareZoneId,
  pattern: `www.${domain}/*`,
  script: workerScript.scriptName,
});

// ── DNS Records ─────────────────────────────────────────────────────
// Root domain uses AAAA 100:: (Cloudflare proxy placeholder) so the
// Worker edge-router handles all traffic.
const dnsRecord = new cloudflare.DnsRecord("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "AAAA",
  content: "100::",
  proxied: true,
  ttl: 1,
});

// WWW subdomain: proxied CNAME → root domain (Worker handles redirect)
const wwwRecord = new cloudflare.DnsRecord("mattbutlerengineering-www-dns", {
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
export { branchProtectionId };
