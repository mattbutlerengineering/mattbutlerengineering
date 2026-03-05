import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as cloudflare from "@pulumi/cloudflare";
import { auth0Outputs } from "./auth0";

// Configuration
const config = new pulumi.Config();
const domain = config.require("domain");
const environment = config.get("environment") || "production";
const cloudflareZoneId = config.require("cloudflareZoneId");

// Database (Neon - managed externally, connection string in config)
const databaseUrl = config.requireSecret("databaseUrl");

// Auth0 exports
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.hospitalityClientId;

// DigitalOcean App Platform
const app = new digitalocean.App("mattbutlerengineering-app", {
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

    // Ingress routing (most-specific-first)
    ingress: {
      rules: [
        // Users API — specific prefix, path preserved (service registers at /api/v1/users)
        {
          match: {
            path: {
              prefix: "/api/v1/users",
            },
          },
          component: {
            name: "users-api",
            preservePathPrefix: true,
          },
        },
        // Reservations API — catch-all for /api, prefix stripped (service registers at /v1/...)
        {
          match: {
            path: {
              prefix: "/api",
            },
          },
          component: {
            name: "reservations-api",
            preservePathPrefix: false,
          },
        },
        // 301 redirect from old /dashboard path
        {
          match: {
            path: {
              prefix: "/dashboard",
            },
          },
          redirect: {
            uri: "/hospitality",
            redirectCode: 301,
          },
        },
        // Hospitality app (renamed from dashboard)
        {
          match: {
            path: {
              prefix: "/hospitality",
            },
          },
          component: {
            name: "hospitality",
            preservePathPrefix: false,
          },
        },
        {
          match: {
            path: {
              prefix: "/rialto",
            },
          },
          component: {
            name: "rialto-web",
            preservePathPrefix: false,
          },
        },
        {
          match: {
            path: {
              prefix: "/",
            },
          },
          component: {
            name: "marketing",
          },
        },
      ],
    },

    // Main website (static React app)
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
            value: `https://${domain}/api`,
            scope: "BUILD_TIME",
          },
        ],
      },
    ],

    // Database migration jobs (run before service deployment)
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
          {
            key: "DATABASE_URL",
            value: databaseUrl,
            type: "SECRET",
          },
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
          {
            key: "DATABASE_URL",
            value: databaseUrl,
            type: "SECRET",
          },
        ],
        runCommand: "npx prisma migrate deploy",
      },
    ],

    // API services
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
          {
            key: "NODE_ENV",
            value: "production",
          },
          {
            key: "PORT",
            value: "3001",
          },
          {
            key: "API_BASE_URL",
            value: `https://${domain}/api`,
          },
          {
            key: "AUTH0_DOMAIN",
            value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
          },
          {
            key: "AUTH0_AUDIENCE",
            value: `https://api.${domain}`,
          },
          {
            key: "DATABASE_URL",
            value: databaseUrl,
            type: "SECRET",
          },
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
          {
            key: "NODE_ENV",
            value: "production",
          },
          {
            key: "PORT",
            value: "3004",
          },
          {
            key: "API_BASE_URL",
            value: `https://${domain}/api`,
          },
          {
            key: "AUTH_AUTHORITY",
            value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
          },
          {
            key: "AUTH_AUDIENCE",
            value: `https://api.${domain}`,
          },
          {
            key: "DATABASE_URL",
            value: databaseUrl,
            type: "SECRET",
          },
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

// Get the app's default domain for DNS setup
export const appDefaultDomain = app.defaultIngress;
export const appLiveUrl = app.liveUrl;

// Extract hostname from the full URL (remove https://)
const appHostname = app.defaultIngress.apply(url => url.replace("https://", ""));

// Cloudflare DNS - Point domain to DigitalOcean App Platform
const dnsRecord = new cloudflare.Record("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "CNAME",
  content: appHostname,
  proxied: true,
  ttl: 1, // Auto TTL when proxied
});

// WWW redirect
const wwwRecord = new cloudflare.Record("mattbutlerengineering-www-dns", {
  zoneId: cloudflareZoneId,
  name: "www",
  type: "CNAME",
  content: domain,
  proxied: true,
  ttl: 1,
});

// Exports
export const appUrl = pulumi.interpolate`https://${domain}`;
export const apiUrl = pulumi.interpolate`https://${domain}/api`;
export const hospitalityUrl = pulumi.interpolate`https://${domain}/hospitality`;
export const rialtoUrl = pulumi.interpolate`https://${domain}/rialto`;
