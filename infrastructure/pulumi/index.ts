import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as cloudflare from "@pulumi/cloudflare";
import { readFileSync } from "node:fs";
import { auth0Outputs } from "./auth0";

// ── Configuration ───────────────────────────────────────────────────
const config = new pulumi.Config();
const domain = config.require("domain");
const cloudflareZoneId = config.require("cloudflareZoneId");
const cloudflareAccountId = config.require("cloudflareAccountId");

const databaseUrl = config.requireSecret("databaseUrl");
const aiGatewayApiKey = config.requireSecret("aiGatewayApiKey");

// ── Auth0 Exports ───────────────────────────────────────────────────
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.hospitalityClientId;

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

    // Single pre-deploy job runs both migrations sequentially to avoid
    // concurrent lock conflicts on the shared _prisma_migrations table.
    jobs: [
      {
        name: "db-migrate",
        kind: "PRE_DEPLOY",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: false, // CI triggers deploys via doctl
        },
        sourceDir: "/",
        dockerfilePath: "infrastructure/migrate/Dockerfile",
        envs: [
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
        ],
        runCommand: "/migrate.sh",
      },
    ],

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
        ],
        healthCheck: {
          httpPath: "/health",
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
        ],
        healthCheck: {
          httpPath: "/health",
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
          { key: "AI_GATEWAY_API_KEY", value: aiGatewayApiKey, type: "SECRET" },
          { key: "DEFAULT_MODEL", value: "anthropic/claude-haiku-4.5" },
        ],
        healthCheck: {
          httpPath: "/health",
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
const apiDns = new cloudflare.Record("mattbutlerengineering-api-dns", {
  zoneId: cloudflareZoneId,
  name: "api",
  type: "CNAME",
  content: apiApp.defaultIngress.apply((url) => url.replace("https://", "")),
  proxied: false,
  ttl: 300,
});

// ── Cloudflare Worker Edge Router ────────────────────────────────────
// Routes traffic by path prefix to Workers Static Assets (via Service
// Bindings) or DO API app (via HTTP subrequest).
//
// Static site Workers are created by `wrangler deploy` in CI — Pulumi
// only manages the edge-router and its bindings. Service Bindings call
// app Workers in-process, bypassing the CDN entirely.

const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/edge-router.js", "utf-8"),
  module: true,
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

// ── Worker Routes ───────────────────────────────────────────────────
// Worker intercepts all traffic to mattbutlerengineering.com and www.
// Rollback: delete these routes in CF dashboard (instant).
const workerRoute = new cloudflare.WorkersRoute("edge-router-route", {
  zoneId: cloudflareZoneId,
  pattern: `${domain}/*`,
  scriptName: workerScript.name,
});

const wwwWorkerRoute = new cloudflare.WorkersRoute("edge-router-www-route", {
  zoneId: cloudflareZoneId,
  pattern: `www.${domain}/*`,
  scriptName: workerScript.name,
});

// ── DNS Records ─────────────────────────────────────────────────────
// Root domain uses AAAA 100:: (Cloudflare proxy placeholder) so the
// Worker edge-router handles all traffic.
const dnsRecord = new cloudflare.Record("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "AAAA",
  content: "100::",
  proxied: true,
  ttl: 1,
});

// WWW subdomain: proxied CNAME → root domain (Worker handles redirect)
const wwwRecord = new cloudflare.Record("mattbutlerengineering-www-dns", {
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
