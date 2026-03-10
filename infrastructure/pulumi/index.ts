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

// ── Auth0 Exports ───────────────────────────────────────────────────
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.hospitalityClientId;

// ── Legacy DO App (REMOVE AFTER CUTOVER) ────────────────────────────
// Keep the old app alive during transition. Once the Worker + CF Pages
// are verified, delete this block and run `pulumi up` to remove it.
const _legacyApp = new digitalocean.App("mattbutlerengineering-app", {
  spec: {
    name: "mattbutlerengineering",
    region: "nyc",
    domainNames: [
      {
        name: domain,
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
        {
          match: { path: { prefix: "/api" } },
          component: { name: "reservations-api", preservePathPrefix: true },
        },
        {
          match: { path: { prefix: "/dashboard" } },
          redirect: { uri: "/hospitality", redirectCode: 301 },
        },
        {
          match: { path: { prefix: "/hospitality" } },
          component: { name: "hospitality", preservePathPrefix: false },
        },
        {
          match: { path: { prefix: "/rialto" } },
          component: { name: "rialto-web", preservePathPrefix: false },
        },
        {
          match: { path: { prefix: "/" } },
          component: { name: "marketing" },
        },
      ],
    },
    staticSites: [
      {
        name: "marketing",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        buildCommand: "pnpm build --filter=@mbe/marketing",
        outputDir: "apps/marketing/dist",
        catchallDocument: "index.html",
      },
      {
        name: "rialto-web",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        buildCommand: "pnpm build --filter=@mbe/rialto-web",
        outputDir: "apps/rialto-web/dist",
        catchallDocument: "index.html",
      },
      {
        name: "hospitality",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        buildCommand: "pnpm build --filter=@mbe/hospitality",
        outputDir: "apps/hospitality/dist",
        catchallDocument: "index.html",
        envs: [
          {
            key: "VITE_AUTH_AUTHORITY",
            value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
            scope: "BUILD_TIME",
          },
          {
            key: "VITE_AUTH_CLIENT_ID",
            value: auth0Outputs.hospitalityClientId,
            scope: "BUILD_TIME",
          },
          {
            key: "VITE_AUTH_AUDIENCE",
            value: `https://api.${domain}`,
            scope: "BUILD_TIME",
          },
          {
            key: "VITE_AUTH_REDIRECT_URI",
            value: `https://${domain}/hospitality/callback`,
            scope: "BUILD_TIME",
          },
          {
            key: "VITE_API_URL",
            value: `https://${domain}`,
            scope: "BUILD_TIME",
          },
        ],
      },
    ],
    jobs: [
      {
        name: "db-migrate-users",
        kind: "PRE_DEPLOY",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        dockerfilePath: "services/users/Dockerfile",
        envs: [
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
        ],
        runCommand: "npx prisma migrate deploy",
      },
      {
        name: "db-migrate-reservations",
        kind: "PRE_DEPLOY",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        dockerfilePath: "services/reservations/Dockerfile",
        envs: [
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
        ],
        runCommand: "npx prisma migrate deploy",
      },
    ],
    services: [
      {
        name: "users-api",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        dockerfilePath: "services/users/Dockerfile",
        instanceCount: 1,
        instanceSizeSlug: "apps-s-1vcpu-0.5gb",
        httpPort: 3001,
        envs: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "3001" },
          { key: "API_BASE_URL", value: `https://${domain}/api` },
          { key: "AUTH0_DOMAIN", value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com" },
          { key: "AUTH0_AUDIENCE", value: `https://api.${domain}` },
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
          deployOnPush: true,
        },
        sourceDir: "/",
        dockerfilePath: "services/reservations/Dockerfile",
        instanceCount: 1,
        instanceSizeSlug: "apps-s-1vcpu-0.5gb",
        httpPort: 3004,
        envs: [
          { key: "NODE_ENV", value: "production" },
          { key: "PORT", value: "3004" },
          { key: "API_BASE_URL", value: `https://${domain}/api` },
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
    ],
  },
});

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

    // Pre-deploy migration jobs
    jobs: [
      {
        name: "db-migrate-users",
        kind: "PRE_DEPLOY",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: false, // CI triggers deploys via doctl
        },
        sourceDir: "/",
        dockerfilePath: "services/users/Dockerfile",
        envs: [
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
        ],
        runCommand: "npx prisma migrate deploy",
      },
      {
        name: "db-migrate-reservations",
        kind: "PRE_DEPLOY",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: false,
        },
        sourceDir: "/",
        dockerfilePath: "services/reservations/Dockerfile",
        envs: [
          { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
        ],
        runCommand: "npx prisma migrate deploy",
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

// ── CF Pages Projects ───────────────────────────────────────────────
// Static sites deployed via CI (wrangler pages deploy), not CF GitHub integration.

const marketingPages = new cloudflare.PagesProject("mattbutlerengineering-marketing", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-marketing",
  productionBranch: "main",
  deploymentConfigs: {
    production: {
      compatibilityDate: "2024-09-23",
    },
    preview: {
      compatibilityDate: "2024-09-23",
    },
  },
});

const hospitalityPages = new cloudflare.PagesProject("mattbutlerengineering-hospitality", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-hospitality",
  productionBranch: "main",
  deploymentConfigs: {
    production: {
      compatibilityDate: "2024-09-23",
      environmentVariables: {
        VITE_AUTH_AUTHORITY: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
        VITE_AUTH_AUDIENCE: `https://api.${domain}`,
        VITE_AUTH_REDIRECT_URI: `https://${domain}/hospitality/callback`,
        VITE_API_URL: `https://${domain}`,
      },
    },
    preview: {
      compatibilityDate: "2024-09-23",
      environmentVariables: {
        VITE_AUTH_AUTHORITY: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
        VITE_AUTH_AUDIENCE: `https://api.${domain}`,
        VITE_AUTH_REDIRECT_URI: `https://${domain}/hospitality/callback`,
        VITE_API_URL: `https://${domain}`,
      },
    },
  },
});

const rialtoPages = new cloudflare.PagesProject("mattbutlerengineering-rialto-web", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-rialto-web",
  productionBranch: "main",
  deploymentConfigs: {
    production: {
      compatibilityDate: "2024-09-23",
    },
    preview: {
      compatibilityDate: "2024-09-23",
    },
  },
});

// ── Cloudflare Worker Edge Router ────────────────────────────────────
// Routes traffic by path prefix to CF Pages origins or DO API app.

const workerScript = new cloudflare.WorkersScript("mattbutlerengineering-edge-router", {
  accountId: cloudflareAccountId,
  name: "mattbutlerengineering-edge-router",
  content: readFileSync("../worker/edge-router.js", "utf-8"),
  module: true,
  compatibilityDate: "2024-09-23",
  plainTextBindings: [
    { name: "API_ORIGIN", text: `https://api.${domain}` },
    {
      name: "HOSPITALITY_ORIGIN",
      text: hospitalityPages.subdomain.apply((s) => `https://${s}`),
    },
    {
      name: "RIALTO_ORIGIN",
      text: rialtoPages.subdomain.apply((s) => `https://${s}`),
    },
    {
      name: "MARKETING_ORIGIN",
      text: marketingPages.subdomain.apply((s) => `https://${s}`),
    },
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
// Root domain still points to legacy DO App. Once confident in Worker,
// change to AAAA 100:: and remove the legacy app block above.
const legacyHostname = _legacyApp.defaultIngress.apply((url) =>
  url.replace("https://", "")
);
const dnsRecord = new cloudflare.Record("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "CNAME",
  content: legacyHostname,
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
// Legacy exports (REMOVE AFTER CUTOVER)
export const appDefaultDomain = _legacyApp.defaultIngress;
export const appLiveUrl = _legacyApp.liveUrl;

// New architecture exports
export const apiAppUrl = apiApp.liveUrl;
export const apiAppDefaultDomain = apiApp.defaultIngress;
export const appUrl = pulumi.interpolate`https://${domain}`;
export const apiUrl = pulumi.interpolate`https://api.${domain}/api`;
export const hospitalityUrl = pulumi.interpolate`https://${domain}/hospitality`;
export const rialtoUrl = pulumi.interpolate`https://${domain}/rialto`;
export const marketingPagesUrl = marketingPages.subdomain.apply((s) => `https://${s}`);
export const hospitalityPagesUrl = hospitalityPages.subdomain.apply((s) => `https://${s}`);
export const rialtoPagesUrl = rialtoPages.subdomain.apply((s) => `https://${s}`);
