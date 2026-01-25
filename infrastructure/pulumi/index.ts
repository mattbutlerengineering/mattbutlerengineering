import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";
import * as cloudflare from "@pulumi/cloudflare";
import { auth0Outputs } from "./auth0";

// Configuration
const config = new pulumi.Config();
const domain = config.require("domain");
const environment = config.get("environment") || "production";
const cloudflareZoneId = config.require("cloudflareZoneId");

// Auth0 exports
export const auth0ApiIdentifier = auth0Outputs.apiIdentifier;
export const auth0ClientId = auth0Outputs.dashboardClientId;

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

    // Main website (static React app)
    staticSites: [
      {
        name: "web",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        buildCommand: "npm install -g pnpm && pnpm install && pnpm build --filter=@mbe/web",
        outputDir: "apps/web/dist",
        routes: [
          {
            path: "/",
            preservePathPrefix: false,
          },
        ],
        envs: [
          {
            key: "VITE_AUTH_AUTHORITY",
            value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
          },
          {
            key: "VITE_AUTH_CLIENT_ID",
            value: auth0Outputs.dashboardClientId,
          },
          {
            key: "VITE_AUTH_AUDIENCE",
            value: `https://api.${domain}`,
          },
          {
            key: "VITE_AUTH_REDIRECT_URI",
            value: `https://${domain}/callback`,
          },
        ],
      },
      {
        name: "dashboard",
        github: {
          repo: "mattbutlerengineering/mattbutlerengineering",
          branch: "main",
          deployOnPush: true,
        },
        sourceDir: "/",
        buildCommand: "npm install -g pnpm && pnpm install && pnpm build --filter=@mbe/dashboard",
        outputDir: "apps/dashboard/dist",
        routes: [
          {
            path: "/dashboard",
            preservePathPrefix: true,
          },
        ],
        envs: [
          {
            key: "VITE_AUTH_AUTHORITY",
            value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
          },
          {
            key: "VITE_AUTH_CLIENT_ID",
            value: auth0Outputs.dashboardClientId,
          },
          {
            key: "VITE_AUTH_AUDIENCE",
            value: `https://api.${domain}`,
          },
          {
            key: "VITE_AUTH_REDIRECT_URI",
            value: `https://${domain}/dashboard/callback`,
          },
          {
            key: "VITE_API_URL",
            value: `https://${domain}/api`,
          },
        ],
      },
    ],

    // Users API service
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
        routes: [
          {
            path: "/api",
            preservePathPrefix: false,
          },
        ],
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
            key: "AUTH0_DOMAIN",
            value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com",
          },
          {
            key: "AUTH0_AUDIENCE",
            value: `https://api.${domain}`,
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

// Cloudflare DNS - Point domain to DigitalOcean App Platform
const dnsRecord = new cloudflare.Record("mattbutlerengineering-dns", {
  zoneId: cloudflareZoneId,
  name: "@",
  type: "CNAME",
  content: app.defaultIngress,
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
export const dashboardUrl = pulumi.interpolate`https://${domain}/dashboard`;
