import * as pulumi from "@pulumi/pulumi";
import * as auth0 from "@pulumi/auth0";

const config = new pulumi.Config();
const domain = config.require("domain");
const _environment = config.get("environment") || "production";

// Determine callback URLs based on environment
const localCallbacks = [
  "http://localhost:3002/hospitality/callback",
  "http://localhost:3005/gen/callback",
];
const prodCallbacks = [`https://${domain}/hospitality/callback`, `https://${domain}/gen/callback`];
const callbackUrls = [...localCallbacks, ...prodCallbacks];

const localLogoutUrls = [
  "http://localhost:3002",
  "http://localhost:3002/hospitality",
  "http://localhost:3005",
  "http://localhost:3005/gen",
];
const prodLogoutUrls = [
  `https://${domain}`,
  `https://${domain}/hospitality`,
  `https://${domain}/gen`,
];
const logoutUrls = [...localLogoutUrls, ...prodLogoutUrls];

const localWebOrigins = ["http://localhost:3002", "http://localhost:3005"];
const prodWebOrigins = [
  `https://${domain}`,
  `https://${domain}/hospitality`,
  `https://${domain}/gen`,
];
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

// Auth0 SPA Application (Hospitality)
export const hospitalityApp = new auth0.Client("mattbutlerengineering-hospitality", {
  name: "mattbutlerengineering-hospitality",
  description: "Matt Butler Engineering Hospitality",
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
  grantTypes: [
    "authorization_code",
    "refresh_token",
    "password",
    "http://auth0.com/oauth/grant-type/password-realm",
  ],
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

// Grant the hospitality app access to the API
export const hospitalityApiGrant = new auth0.ClientGrant(
  "mattbutlerengineering-hospitality-api-grant",
  {
    clientId: hospitalityApp.clientId,
    audience: api.identifier,
    scopes: ["openid", "profile", "email"],
  }
);

// Dedicated E2E test user (ROPC auth, no MFA)
const e2ePassword = config.requireSecret("e2eUserPassword");

export const e2eUser = new auth0.User("e2e-test-user", {
  connectionName: "Username-Password-Authentication",
  email: "e2e-test@mattbutlerengineering.com",
  password: e2ePassword,
  emailVerified: true,
  name: "E2E Test User",
});

// A deliberately non-admin identity for the venue-bootstrap journey case
// (ADR-020's third case). It must stay separate from `e2eUser`, which carries
// the `admin` permission: `requireVenueCreateAccess` skips the membership
// lookup entirely for admins, so an admin would pass the case while exercising
// none of the behaviour it exists for. No role is assigned here, which is what
// makes it non-admin — see the guard in index.test.ts.
//
// `getSecret`, not `requireSecret`: the resource is skipped until the password
// is configured, so landing this file never breaks a `pulumi up` on a stack
// that has not set it yet. Set it with:
//   pulumi config set --secret e2eNonAdminUserPassword <value> --stack prod
const nonAdminPassword = config.getSecret("e2eNonAdminUserPassword");

export const e2eNonAdminUser = nonAdminPassword
  ? new auth0.User("e2e-nonadmin-user", {
      connectionName: "Username-Password-Authentication",
      email: "e2e-nonadmin@mattbutlerengineering.com",
      password: nonAdminPassword,
      emailVerified: true,
      name: "E2E Non-Admin Journey User",
    })
  : undefined;

// Exports for use in other files and .env generation
export const auth0Outputs = {
  apiIdentifier: api.identifier,
  hospitalityClientId: hospitalityApp.clientId,
  e2eUserEmail: e2eUser.email,
  e2eNonAdminUserEmail: e2eNonAdminUser?.email,
};
