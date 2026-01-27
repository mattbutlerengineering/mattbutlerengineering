import * as pulumi from "@pulumi/pulumi";
import * as auth0 from "@pulumi/auth0";

const config = new pulumi.Config();
const domain = config.require("domain");
const environment = config.get("environment") || "production";

// Determine callback URLs based on environment
const localCallbacks = [
  "http://localhost:3000/callback",
  "http://localhost:3002/dashboard/callback",
];
const prodCallbacks = [
  `https://${domain}/callback`,
  `https://${domain}/dashboard/callback`,
];
const callbackUrls = [...localCallbacks, ...prodCallbacks];

const localLogoutUrls = ["http://localhost:3000", "http://localhost:3002", "http://localhost:3002/dashboard"];
const prodLogoutUrls = [`https://${domain}`, `https://${domain}/dashboard`];
const logoutUrls = [...localLogoutUrls, ...prodLogoutUrls];

const localWebOrigins = ["http://localhost:3000", "http://localhost:3002"];
const prodWebOrigins = [`https://${domain}`, `https://${domain}/dashboard`];
const webOrigins = [...localWebOrigins, ...prodWebOrigins];

// Auth0 API (Resource Server)
export const api = new auth0.ResourceServer("mattbutlerengineering-api", {
  name: "mattbutlerengineering-api",
  identifier: `https://api.${domain}`,
  signingAlg: "RS256",
  allowOfflineAccess: true,
  tokenLifetime: 86400, // 24 hours
  tokenLifetimeForWeb: 7200, // 2 hours
});

// Auth0 SPA Application (Dashboard)
export const dashboardApp = new auth0.Client("mattbutlerengineering-app", {
  name: "mattbutlerengineering-app",
  description: "Matt Butler Engineering Dashboard",
  appType: "spa",
  callbacks: callbackUrls,
  allowedLogoutUrls: logoutUrls,
  webOrigins: webOrigins,
  allowedOrigins: webOrigins,
  oidcConformant: true,
  jwtConfiguration: {
    alg: "RS256",
    lifetimeInSeconds: 36000,
  },
  grantTypes: ["authorization_code", "refresh_token"],
  refreshToken: {
    rotationType: "rotating",
    expirationType: "expiring",
    leeway: 0,
    tokenLifetime: 2592000, // 30 days
    infiniteIdleTokenLifetime: false,
    infiniteTokenLifetime: false,
    idleTokenLifetime: 1296000, // 15 days
  },
});

// Grant the dashboard app access to the API
export const dashboardApiGrant = new auth0.ClientGrant("mattbutlerengineering-app-api-grant", {
  clientId: dashboardApp.clientId,
  audience: api.identifier,
  scopes: ["openid", "profile", "email"],
});

// Exports for use in other files and .env generation
export const auth0Outputs = {
  apiIdentifier: api.identifier,
  dashboardClientId: dashboardApp.clientId,
};
