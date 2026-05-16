import * as pulumi from "@pulumi/pulumi";
import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Pulumi Mocks ───────────────────────────────────────────────────────────
// Track all resources created during the test run so we can assert naming,
// tagging, and configuration conventions without hitting real providers.
interface MockedResource {
  name: string;
  type: string;
  inputs: Record<string, unknown>;
}

const createdResources: MockedResource[] = [];

pulumi.runtime.setMocks({
  newResource: (
    args: pulumi.runtime.MockResourceArgs
  ): { id: string; state: Record<string, unknown> } => {
    createdResources.push({
      name: args.name,
      type: args.type,
      inputs: args.inputs,
    });

    const state: Record<string, unknown> = { ...args.inputs };

    // Simulate outputs that other resources depend on
    if (args.type === "digitalocean:index/app:App") {
      state.defaultIngress = "https://mattbutlerengineering-api-abcde.ondigitalocean.app";
      state.liveUrl = "https://mattbutlerengineering-api-abcde.ondigitalocean.app";
    }
    if (args.type === "auth0:index/client:Client") {
      state.clientId = "mock-client-id-123";
    }
    if (args.type === "auth0:index/resourceServer:ResourceServer") {
      state.identifier = args.inputs.identifier;
    }
    if (args.type === "cloudflare:index/workersKvNamespace:WorkersKvNamespace") {
      state.id = `kv-${args.name}`;
    }

    return {
      id: `${args.name}_id`,
      state,
    };
  },
  call: (args: pulumi.runtime.MockCallArgs): Record<string, unknown> => {
    return args.inputs;
  },
});

// ── Module Mocks ───────────────────────────────────────────────────────────
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "// mock worker script content"),
}));

// ── Config Setup ───────────────────────────────────────────────────────────
const TEST_DOMAIN = "mattbutlerengineering.com";
const TEST_ZONE_ID = "zone-abc123";
const TEST_ACCOUNT_ID = "account-xyz789";
const TEST_DB_URL = "postgresql://user:pass@host:5432/db";

const configEntries: Record<string, string> = {
  domain: TEST_DOMAIN,
  cloudflareZoneId: TEST_ZONE_ID,
  cloudflareAccountId: TEST_ACCOUNT_ID,
  databaseUrl: TEST_DB_URL,
  otelEndpoint: "https://otlp.example.com",
  otelHeaders: "Authorization=Basic abc123",
  aiGatewayApiKey: "gw-key-123",
  remediationWebhookSecret: "webhook-secret-123",
};

for (const [key, value] of Object.entries(configEntries)) {
  pulumi.runtime.setConfig(`mbe-infrastructure:${key}`, value);
  pulumi.runtime.setConfig(`project:${key}`, value);
}

// ── Import after mocks and config ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let infra: typeof import("./index.js");

beforeAll(async () => {
  infra = await import("./index.js");

  // Wait for all async resource registration to complete by resolving
  // outputs that depend on the deepest resource chains. This ensures
  // createdResources is fully populated before tests run.
  await new Promise<void>((resolve) => {
    pulumi
      .all([
        infra.apiAppUrl,
        infra.apiAppDefaultDomain,
        infra.appUrl,
        infra.apiUrl,
        infra.healthKvNamespaceId,
        infra.pulumiStateBucketId,
        infra.branchProtectionId,
      ])
      .apply(() => {
        resolve();
      });
  });
});

// ── Helper: resolve Pulumi Output ──────────────────────────────────────────
function resolveOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

// ── Helper: find resources by type ─────────────────────────────────────────
function findResource(
  type: string,
  namePredicate?: (name: string) => boolean
): MockedResource | undefined {
  return createdResources.find(
    (r) => r.type === type && (namePredicate ? namePredicate(r.name) : true)
  );
}

function findResources(type: string): MockedResource[] {
  return createdResources.filter((r) => r.type === type);
}

// Pulumi wraps inputs containing secrets in a special envelope:
// { "4dabf18193072939515e22adb298388d": "...", "value": <actual data> }
// This helper unwraps it to get the actual value.
const PULUMI_SECRET_SIGKEY = "4dabf18193072939515e22adb298388d";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapSecret(obj: any): any {
  if (obj && typeof obj === "object" && PULUMI_SECRET_SIGKEY in obj) {
    return obj.value;
  }
  return obj;
}

// Get the DO App spec, unwrapping the Pulumi secret envelope
function getAppSpec() {
  const app = findResource("digitalocean:index/app:App");
  expect(app).toBeDefined();
  return unwrapSecret(app!.inputs.spec);
}

// ═══════════════════════════════════════════════════════════════════════════
// NAMING CONVENTIONS
// ═══════════════════════════════════════════════════════════════════════════
describe("Naming Conventions", () => {
  const PREFIX = "mattbutlerengineering";

  describe("Cloudflare Resources", () => {
    it("R2 bucket uses project prefix", () => {
      const bucket = findResource("cloudflare:index/r2Bucket:R2Bucket");
      expect(bucket).toBeDefined();
      expect(bucket!.name).toContain(PREFIX);
      expect(bucket!.inputs.name).toBe(`${PREFIX}-pulumi-state`);
    });

    it("KV namespaces use project prefix with descriptive suffix", () => {
      const kvNamespaces = findResources("cloudflare:index/workersKvNamespace:WorkersKvNamespace");
      expect(kvNamespaces.length).toBeGreaterThanOrEqual(3);

      for (const kv of kvNamespaces) {
        expect(kv.name).toMatch(new RegExp(`^${PREFIX}-`));
        expect(kv.inputs.title).toMatch(new RegExp(`^${PREFIX}-`));
      }
    });

    it("KV namespace Pulumi names match their Cloudflare titles", () => {
      const kvNamespaces = findResources("cloudflare:index/workersKvNamespace:WorkersKvNamespace");
      for (const kv of kvNamespaces) {
        expect(kv.name).toBe(kv.inputs.title);
      }
    });

    it("Worker scripts use project prefix in scriptName", () => {
      const workers = findResources("cloudflare:index/workersScript:WorkersScript");
      expect(workers.length).toBeGreaterThanOrEqual(1);

      for (const worker of workers) {
        expect(worker.inputs.scriptName).toMatch(new RegExp(`^${PREFIX}-`));
      }
    });

    it("edge router worker is named correctly", () => {
      const edgeRouter = findResource("cloudflare:index/workersScript:WorkersScript", (name) =>
        name.includes("edge-router")
      );
      expect(edgeRouter).toBeDefined();
      expect(edgeRouter!.inputs.scriptName).toBe(`${PREFIX}-edge-router`);
    });

    it("Worker routes cover domain and www subdomain", () => {
      const routes = findResources("cloudflare:index/workersRoute:WorkersRoute");
      expect(routes.length).toBeGreaterThanOrEqual(2);

      const patterns = routes.map((r) => r.inputs.pattern as string);
      expect(patterns).toContain(`${TEST_DOMAIN}/*`);
      expect(patterns).toContain(`www.${TEST_DOMAIN}/*`);
    });

    it("DNS records use descriptive logical names", () => {
      const dnsRecords = findResources("cloudflare:index/dnsRecord:DnsRecord");
      expect(dnsRecords.length).toBeGreaterThanOrEqual(3);

      const recordNames = dnsRecords.map((r) => r.name);
      expect(recordNames).toContain(`${PREFIX}-dns`);
      expect(recordNames).toContain(`${PREFIX}-www-dns`);
      expect(recordNames).toContain(`${PREFIX}-api-dns`);
    });
  });

  describe("DigitalOcean Resources", () => {
    it("API app uses project prefix", () => {
      const app = findResource("digitalocean:index/app:App");
      expect(app).toBeDefined();
      expect(app!.name).toBe(`${PREFIX}-api-app`);
    });

    it("API app spec name uses project prefix", () => {
      const spec = getAppSpec();
      expect(spec.name).toBe(`${PREFIX}-api`);
    });

    it("service names follow kebab-case convention", () => {
      const spec = getAppSpec();
      const serviceNames = spec.services.map((s: { name: string }) => s.name);

      for (const name of serviceNames) {
        expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    });

    it("migration job names follow db-migrate-{service} convention", () => {
      const spec = getAppSpec();
      const jobNames = spec.jobs.map((j: { name: string }) => j.name);

      for (const name of jobNames) {
        expect(name).toMatch(/^db-migrate-[a-z]+$/);
      }
    });
  });

  describe("Auth0 Resources", () => {
    it("API resource server uses project prefix", () => {
      const resourceServer = findResource("auth0:index/resourceServer:ResourceServer");
      expect(resourceServer).toBeDefined();
      expect(resourceServer!.name).toContain(PREFIX);
      expect(resourceServer!.inputs.name).toBe(`${PREFIX}-api`);
    });

    it("Auth0 client uses project prefix", () => {
      const client = findResource("auth0:index/client:Client");
      expect(client).toBeDefined();
      expect(client!.name).toContain(PREFIX);
      expect(client!.inputs.name).toBe(`${PREFIX}-hospitality`);
    });
  });

  describe("GitHub Resources", () => {
    it("branch protection has descriptive logical name", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      expect(bp).toBeDefined();
      expect(bp!.name).toBe("main-branch-protection");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Configuration Validation", () => {
  describe("DigitalOcean App Spec", () => {
    it("all services point to the correct repo", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        expect(service.github.repo).toBe("mattbutlerengineering/mattbutlerengineering");
        expect(service.github.branch).toBe("main");
      }
    });

    it("all services have deployOnPush disabled (CI-controlled)", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        expect(service.github.deployOnPush).toBe(false);
      }
    });

    it("all services have health checks configured", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        expect(service.healthCheck).toBeDefined();
        expect(service.healthCheck.httpPath).toBe("/ready");
        expect(service.healthCheck.periodSeconds).toBeGreaterThan(0);
        expect(service.healthCheck.timeoutSeconds).toBeGreaterThan(0);
        expect(service.healthCheck.failureThreshold).toBeGreaterThan(0);
      }
    });

    it("all services set NODE_ENV=production", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        const nodeEnv = service.envs.find((e: { key: string }) => e.key === "NODE_ENV");
        expect(nodeEnv).toBeDefined();
        expect(nodeEnv.value).toBe("production");
      }
    });

    it("all services have DATABASE_URL marked as SECRET", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        const dbUrl = service.envs.find((e: { key: string }) => e.key === "DATABASE_URL");
        expect(dbUrl).toBeDefined();
        expect(dbUrl.type).toBe("SECRET");
      }
    });

    it("services use correct ports matching their Dockerfiles", () => {
      const spec = getAppSpec();

      const expectedPorts: Record<string, number> = {
        "users-api": 3001,
        "reservations-api": 3004,
        "agent-api": 3003,
      };

      for (const service of spec.services) {
        expect(service.httpPort).toBe(expectedPorts[service.name]);
        // PORT env var matches httpPort
        const portEnv = service.envs.find((e: { key: string }) => e.key === "PORT");
        expect(portEnv).toBeDefined();
        expect(portEnv.value).toBe(String(expectedPorts[service.name]));
      }
    });

    it("app region is set to nyc", () => {
      const spec = getAppSpec();
      expect(spec.region).toBe("nyc");
    });

    it("instance size is consistent across services", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        expect(service.instanceSizeSlug).toBe("apps-s-1vcpu-0.5gb");
        expect(service.instanceCount).toBe(1);
      }
    });

    it("domain is configured on the app", () => {
      const spec = getAppSpec();
      expect(spec.domainNames).toHaveLength(1);
      expect(spec.domainNames[0].name).toBe(`api.${TEST_DOMAIN}`);
      expect(spec.domainNames[0].type).toBe("PRIMARY");
    });

    it("all services have CORS_ORIGIN set to the domain", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        const corsOrigin = service.envs.find((e: { key: string }) => e.key === "CORS_ORIGIN");
        expect(corsOrigin).toBeDefined();
        expect(corsOrigin.value).toBe(`https://${TEST_DOMAIN}`);
      }
    });

    it("all services have Auth0 authority and audience configured", () => {
      const spec = getAppSpec();

      for (const service of spec.services) {
        const authority = service.envs.find((e: { key: string }) => e.key === "AUTH_AUTHORITY");
        const audience = service.envs.find((e: { key: string }) => e.key === "AUTH_AUDIENCE");
        expect(authority).toBeDefined();
        expect(authority.value).toMatch(/^https:\/\/.+\.auth0\.com$/);
        expect(audience).toBeDefined();
        expect(audience.value).toBe(`https://api.${TEST_DOMAIN}`);
      }
    });

    it("OTEL env vars are included when configured", () => {
      const spec = getAppSpec();

      // At least one service should have OTEL endpoint
      const firstService = spec.services[0];
      const otelEndpointEnv = firstService.envs.find(
        (e: { key: string }) => e.key === "OTEL_EXPORTER_OTLP_ENDPOINT"
      );
      expect(otelEndpointEnv).toBeDefined();
      expect(otelEndpointEnv.value).toBe("https://otlp.example.com");
    });
  });

  describe("Ingress Rules", () => {
    it("ingress rules are ordered from most specific to least specific", () => {
      const spec = getAppSpec();
      const rules = spec.ingress.rules;

      // The catch-all "/" must be last
      const lastRule = rules[rules.length - 1];
      expect(lastRule.match.path.prefix).toBe("/");

      // More specific routes come before catch-all
      const prefixes = rules.map(
        (r: { match: { path: { prefix: string } } }) => r.match.path.prefix
      );
      const catchAllIndex = prefixes.indexOf("/");
      const apiIndex = prefixes.indexOf("/api");

      // /api/v1/users before /api
      const usersIndex = prefixes.indexOf("/api/v1/users");
      expect(usersIndex).toBeLessThan(apiIndex);

      // /api before /
      expect(apiIndex).toBeLessThan(catchAllIndex);
    });

    it("all ingress rules have preservePathPrefix enabled", () => {
      const spec = getAppSpec();

      for (const rule of spec.ingress.rules) {
        expect(rule.component.preservePathPrefix).toBe(true);
      }
    });

    it("each service is referenced by at least one ingress rule", () => {
      const spec = getAppSpec();
      const serviceNames = spec.services.map((s: { name: string }) => s.name);
      const referencedComponents = spec.ingress.rules.map(
        (r: { component: { name: string } }) => r.component.name
      );

      for (const name of serviceNames) {
        expect(referencedComponents).toContain(name);
      }
    });
  });

  describe("Migration Jobs", () => {
    it("each migrated service has a corresponding pre-deploy job", () => {
      const spec = getAppSpec();

      const expectedServices = ["users", "reservations", "agent"];
      const jobNames = spec.jobs.map((j: { name: string }) => j.name);

      for (const service of expectedServices) {
        expect(jobNames).toContain(`db-migrate-${service}`);
      }
    });

    it("all migration jobs use PRE_DEPLOY kind", () => {
      const spec = getAppSpec();

      for (const job of spec.jobs) {
        expect(job.kind).toBe("PRE_DEPLOY");
      }
    });

    it("all migration jobs use the shared migrate Dockerfile", () => {
      const spec = getAppSpec();

      for (const job of spec.jobs) {
        expect(job.dockerfilePath).toBe("infrastructure/migrate/Dockerfile");
        expect(job.sourceDir).toBe("/");
      }
    });

    it("each migration job has SERVICE_NAME env set to its service", () => {
      const spec = getAppSpec();

      for (const job of spec.jobs) {
        const serviceNameEnv = job.envs.find((e: { key: string }) => e.key === "SERVICE_NAME");
        expect(serviceNameEnv).toBeDefined();
        const expectedService = job.name.replace("db-migrate-", "");
        expect(serviceNameEnv.value).toBe(expectedService);
      }
    });

    it("all migration jobs have DATABASE_URL as SECRET", () => {
      const spec = getAppSpec();

      for (const job of spec.jobs) {
        const dbUrl = job.envs.find((e: { key: string }) => e.key === "DATABASE_URL");
        expect(dbUrl).toBeDefined();
        expect(dbUrl.type).toBe("SECRET");
      }
    });
  });

  describe("Cloudflare Configuration", () => {
    it("R2 bucket is in enam region", () => {
      const bucket = findResource("cloudflare:index/r2Bucket:R2Bucket");
      expect(bucket).toBeDefined();
      expect(bucket!.inputs.location).toBe("enam");
    });

    it("all Cloudflare resources use the correct account ID", () => {
      const cfResources = createdResources.filter((r) => r.type.startsWith("cloudflare:"));
      const resourcesWithAccount = cfResources.filter((r) => "accountId" in r.inputs);

      expect(resourcesWithAccount.length).toBeGreaterThan(0);
      for (const resource of resourcesWithAccount) {
        expect(resource.inputs.accountId).toBe(TEST_ACCOUNT_ID);
      }
    });

    it("edge router worker has a valid compatibility date", () => {
      const edgeRouter = findResource("cloudflare:index/workersScript:WorkersScript", (name) =>
        name.includes("edge-router")
      );
      expect(edgeRouter).toBeDefined();
      expect(edgeRouter!.inputs.compatibilityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("edge router has required service bindings for all static sites", () => {
      const edgeRouter = findResource("cloudflare:index/workersScript:WorkersScript", (name) =>
        name.includes("edge-router")
      );
      expect(edgeRouter).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings = edgeRouter!.inputs.bindings as any[];
      const serviceBindings = bindings.filter((b) => b.type === "service");
      const serviceNames = serviceBindings.map((b) => b.name);

      expect(serviceNames).toContain("MARKETING");
      expect(serviceNames).toContain("HOSPITALITY");
      expect(serviceNames).toContain("RIALTO");
      expect(serviceNames).toContain("GEN");
    });

    it("edge router has canary service bindings for traffic splitting", () => {
      const edgeRouter = findResource("cloudflare:index/workersScript:WorkersScript", (name) =>
        name.includes("edge-router")
      );
      expect(edgeRouter).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings = edgeRouter!.inputs.bindings as any[];
      const serviceBindings = bindings.filter((b) => b.type === "service");
      const serviceNames = serviceBindings.map((b) => b.name);

      expect(serviceNames).toContain("MARKETING_CANARY");
      expect(serviceNames).toContain("HOSPITALITY_CANARY");
      expect(serviceNames).toContain("RIALTO_CANARY");
      expect(serviceNames).toContain("GEN_CANARY");
    });

    it("edge router has API_ORIGIN text binding pointing to api subdomain", () => {
      const edgeRouter = findResource("cloudflare:index/workersScript:WorkersScript", (name) =>
        name.includes("edge-router")
      );
      expect(edgeRouter).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings = edgeRouter!.inputs.bindings as any[];
      const apiOrigin = bindings.find((b) => b.name === "API_ORIGIN");

      expect(apiOrigin).toBeDefined();
      expect(apiOrigin.type).toBe("plain_text");
      expect(apiOrigin.text).toBe(`https://api.${TEST_DOMAIN}`);
    });

    it("edge router has KV namespace binding for health state", () => {
      const edgeRouter = findResource("cloudflare:index/workersScript:WorkersScript", (name) =>
        name.includes("edge-router")
      );
      expect(edgeRouter).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bindings = edgeRouter!.inputs.bindings as any[];
      const kvBinding = bindings.find((b) => b.type === "kv_namespace");

      expect(kvBinding).toBeDefined();
      expect(kvBinding.name).toBe("HEALTH_STATE");
    });

    it("root DNS record is proxied AAAA 100::", () => {
      const rootDns = findResource(
        "cloudflare:index/dnsRecord:DnsRecord",
        (name) => name === "mattbutlerengineering-dns"
      );
      expect(rootDns).toBeDefined();
      expect(rootDns!.inputs.type).toBe("AAAA");
      expect(rootDns!.inputs.content).toBe("100::");
      expect(rootDns!.inputs.proxied).toBe(true);
    });

    it("www DNS record is proxied CNAME to root", () => {
      const wwwDns = findResource(
        "cloudflare:index/dnsRecord:DnsRecord",
        (name) => name === "mattbutlerengineering-www-dns"
      );
      expect(wwwDns).toBeDefined();
      expect(wwwDns!.inputs.type).toBe("CNAME");
      expect(wwwDns!.inputs.content).toBe(TEST_DOMAIN);
      expect(wwwDns!.inputs.proxied).toBe(true);
    });

    it("api DNS record is NOT proxied (DO needs domain verification)", () => {
      const apiDns = findResource(
        "cloudflare:index/dnsRecord:DnsRecord",
        (name) => name === "mattbutlerengineering-api-dns"
      );
      expect(apiDns).toBeDefined();
      expect(apiDns!.inputs.type).toBe("CNAME");
      expect(apiDns!.inputs.proxied).toBe(false);
    });

    it("gen worker has SPA not-found handling", () => {
      const genWorker = findResource(
        "cloudflare:index/workersScript:WorkersScript",
        (name) => name.includes("gen") && !name.includes("edge-router")
      );
      expect(genWorker).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assets = genWorker!.inputs.assets as any;
      expect(assets.config.notFoundHandling).toBe("single-page-application");
    });
  });

  describe("Auth0 Configuration", () => {
    it("API resource server uses RS256 signing algorithm", () => {
      const api = findResource("auth0:index/resourceServer:ResourceServer");
      expect(api!.inputs.signingAlg).toBe("RS256");
    });

    it("API resource server allows offline access", () => {
      const api = findResource("auth0:index/resourceServer:ResourceServer");
      expect(api!.inputs.allowOfflineAccess).toBe(true);
    });

    it("API identifier uses the domain", () => {
      const api = findResource("auth0:index/resourceServer:ResourceServer");
      expect(api!.inputs.identifier).toBe(`https://api.${TEST_DOMAIN}`);
    });

    it("hospitality app is configured as SPA", () => {
      const client = findResource("auth0:index/client:Client");
      expect(client!.inputs.appType).toBe("spa");
    });

    it("hospitality app uses OIDC conformant mode", () => {
      const client = findResource("auth0:index/client:Client");
      expect(client!.inputs.oidcConformant).toBe(true);
    });

    it("hospitality app has refresh token rotation enabled", () => {
      const client = findResource("auth0:index/client:Client");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refreshToken = client!.inputs.refreshToken as any;
      expect(refreshToken.rotationType).toBe("rotating");
      expect(refreshToken.expirationType).toBe("expiring");
    });

    it("hospitality app callbacks include both local and production URLs", () => {
      const client = findResource("auth0:index/client:Client");
      const callbacks = client!.inputs.callbacks as string[];
      expect(callbacks).toContain("http://localhost:3002/hospitality/callback");
      expect(callbacks).toContain(`https://${TEST_DOMAIN}/hospitality/callback`);
    });

    it("hospitality app grant types include authorization_code and refresh_token", () => {
      const client = findResource("auth0:index/client:Client");
      const grantTypes = client!.inputs.grantTypes as string[];
      expect(grantTypes).toContain("authorization_code");
      expect(grantTypes).toContain("refresh_token");
    });

    it("client grant provides openid, profile, and email scopes", () => {
      const grant = findResource("auth0:index/clientGrant:ClientGrant");
      expect(grant).toBeDefined();
      const scopes = grant!.inputs.scopes as string[];
      expect(scopes).toContain("openid");
      expect(scopes).toContain("profile");
      expect(scopes).toContain("email");
    });
  });

  describe("GitHub Configuration", () => {
    it("branch protection targets the main branch", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      expect(bp!.inputs.pattern).toBe("main");
    });

    it("branch protection requires PR reviews with stale dismissal", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviews = bp!.inputs.requiredPullRequestReviews as any[];
      expect(reviews).toHaveLength(1);
      expect(reviews[0].requiredApprovingReviewCount).toBe(1);
      expect(reviews[0].dismissStaleReviews).toBe(true);
    });

    it("branch protection requires strict status checks", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checks = bp!.inputs.requiredStatusChecks as any[];
      expect(checks).toHaveLength(1);
      expect(checks[0].strict).toBe(true);
      expect(checks[0].contexts.length).toBeGreaterThan(5);
    });

    it("branch protection enforces linear history", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      expect(bp!.inputs.requiredLinearHistory).toBe(true);
    });

    it("branch protection prevents force pushes and deletions", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      expect(bp!.inputs.allowsForcePushes).toBe(false);
      expect(bp!.inputs.allowsDeletions).toBe(false);
    });

    it("branch protection enforces admin rules", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      expect(bp!.inputs.enforceAdmins).toBe(true);
    });

    it("required status checks include critical CI jobs", () => {
      const bp = findResource("github:index/branchProtection:BranchProtection");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checks = bp!.inputs.requiredStatusChecks as any[];
      const contexts = checks[0].contexts as string[];

      expect(contexts).toContain("Lint");
      expect(contexts).toContain("Typecheck");
      expect(contexts).toContain("Build");
      expect(contexts).toContain("Validate Migrations");
      expect(contexts).toContain("Container Security Scan");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════
describe("Exported Outputs", () => {
  it("exports appUrl with https scheme", async () => {
    const url = await resolveOutput(infra.appUrl as pulumi.Output<string>);
    expect(url).toBe(`https://${TEST_DOMAIN}`);
  });

  it("exports apiUrl with /api suffix", async () => {
    const url = await resolveOutput(infra.apiUrl as pulumi.Output<string>);
    expect(url).toBe(`https://api.${TEST_DOMAIN}/api`);
  });

  it("exports hospitalityUrl under /hospitality path", async () => {
    const url = await resolveOutput(infra.hospitalityUrl as pulumi.Output<string>);
    expect(url).toBe(`https://${TEST_DOMAIN}/hospitality`);
  });

  it("exports rialtoUrl under /rialto path", async () => {
    const url = await resolveOutput(infra.rialtoUrl as pulumi.Output<string>);
    expect(url).toBe(`https://${TEST_DOMAIN}/rialto`);
  });

  it("exports genUrl under /gen path", async () => {
    const url = await resolveOutput(infra.genUrl as pulumi.Output<string>);
    expect(url).toBe(`https://${TEST_DOMAIN}/gen`);
  });

  it("exports KV namespace IDs", async () => {
    const sessionsId = await resolveOutput(infra.sessionsKvNamespaceId as pulumi.Output<string>);
    const cacheId = await resolveOutput(infra.cacheKvNamespaceId as pulumi.Output<string>);
    const healthId = await resolveOutput(infra.healthKvNamespaceId as pulumi.Output<string>);

    expect(sessionsId).toBeDefined();
    expect(cacheId).toBeDefined();
    expect(healthId).toBeDefined();
  });

  it("exports branchProtectionId", async () => {
    const bpId = await resolveOutput(infra.branchProtectionId as pulumi.Output<string>);
    expect(bpId).toBeDefined();
    expect(bpId).toContain("main-branch-protection");
  });

  it("exports auth0 identifiers", () => {
    expect(infra.auth0ApiIdentifier).toBeDefined();
    expect(infra.auth0ClientId).toBeDefined();
  });

  it("exports pulumiStateBucketId", async () => {
    const id = await resolveOutput(infra.pulumiStateBucketId as pulumi.Output<string>);
    expect(id).toContain("mattbutlerengineering-pulumi-state");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE INVENTORY (sanity check)
// ═══════════════════════════════════════════════════════════════════════════
describe("Resource Inventory", () => {
  it("creates expected number of Cloudflare resources", () => {
    const cfResources = createdResources.filter((r) => r.type.startsWith("cloudflare:"));
    // R2 bucket + 3 KV namespaces + 2 Workers + 2 routes + 3 DNS records = 11
    expect(cfResources.length).toBeGreaterThanOrEqual(10);
  });

  it("creates exactly one DigitalOcean App", () => {
    const doApps = findResources("digitalocean:index/app:App");
    expect(doApps).toHaveLength(1);
  });

  it("creates Auth0 resources (API + client + grant)", () => {
    const auth0Resources = createdResources.filter((r) => r.type.startsWith("auth0:"));
    expect(auth0Resources.length).toBeGreaterThanOrEqual(3);
  });

  it("creates branch protection rule", () => {
    const bp = findResources("github:index/branchProtection:BranchProtection");
    expect(bp).toHaveLength(1);
  });
});
