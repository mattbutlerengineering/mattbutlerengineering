import * as pulumi from "@pulumi/pulumi";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Pulumi
pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: Record<string, unknown> } => {
    const state: Record<string, unknown> = { ...args.inputs };
    if (args.type === "digitalocean:index/app:App") {
      state.defaultIngress = "https://api.test.com";
      state.liveUrl = "https://api.test.com";
    }
    return {
      id: args.name + "_id",
      state: state,
    };
  },
  call: (args: pulumi.runtime.MockCallArgs): Record<string, unknown> => {
    return args.inputs;
  },
});

// Mock dependencies
vi.mock("./auth0", () => ({
  auth0Outputs: {
    apiIdentifier: "https://api.test",
    hospitalityClientId: "client-123",
  },
}));

vi.mock("./github", () => ({
  branchProtectionId: "bp-123",
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "mock-content"),
}));

describe("Infrastructure Pulumi", () => {
  let infra: Record<string, unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set config
    const config: Record<string, string> = {
      "domain": "test.com",
      "cloudflareZoneId": "zone-1",
      "cloudflareAccountId": "acc-1",
      "databaseUrl": "db-url",
    };

    for (const [key, value] of Object.entries(config)) {
      pulumi.runtime.setConfig(`mbe-infrastructure:${key}`, value);
      pulumi.runtime.setConfig(`project:${key}`, value);
    }
    
    // Use dynamic import and clear cache to re-execute Pulumi logic
    infra = await import("./index.js?t=" + Date.now());
  });

  it("exports correct Auth0 identifiers", () => {
    expect(infra.auth0ApiIdentifier).toBe("https://api.test");
    expect(infra.auth0ClientId).toBe("client-123");
  });

  it("creates state bucket", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await new Promise(resolve => (infra.pulumiStateBucketId as any).apply(resolve));
    expect(id).toContain("mattbutlerengineering-pulumi-state");
  });

  it("exports URLs correctly", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [appUrl, apiUrl] = await new Promise<string[]>(resolve => 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pulumi.all([infra.appUrl as any, infra.apiUrl as any]).apply(resolve)
    );
    expect(appUrl).toBe("https://test.com");
    expect(apiUrl).toBe("https://api.test.com/api");
  });
});
