import { describe, it, expect } from "vitest";
import { agentApiOrigin } from "./gen-agent.js";

describe("agentApiOrigin", () => {
  it("drops the /api suffix prod's API_BASE_URL carries, since api-client paths are absolute", () => {
    // Verbatim, this produced https://api.example.com/api/api/v1/reservations: a 404.
    expect(agentApiOrigin("https://api.example.com/api")).toBe("https://api.example.com");
  });

  it("keeps a local origin with its port", () => {
    expect(agentApiOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("falls back to the local reservations API when unset or invalid", () => {
    expect(agentApiOrigin(undefined)).toBe("http://localhost:3000");
    expect(agentApiOrigin("not a url")).toBe("http://localhost:3000");
  });
});
