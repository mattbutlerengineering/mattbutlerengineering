import { describe, it, expect } from "vitest";
// Vite's ?raw import yields the module source text (declared in raw-imports.d.ts).
import guestsSource from "./guests.ts?raw";
import { guestsEndpoints } from "./guests.js";
import { successResponse } from "./define.js";

/**
 * defect.md's pilot table: 11 client methods ↔ 11 routes. Written as
 * "METHOD path" so each row reads like the table it pins.
 */
const PILOT_TABLE = [
  ["list", "GET /api/v1/guests"],
  ["search", "GET /api/v1/guests/search"],
  ["getSegments", "GET /api/v1/guests/segments"],
  ["get", "GET /api/v1/guests/:id"],
  ["create", "POST /api/v1/guests"],
  ["findOrCreate", "POST /api/v1/guests/find-or-create"],
  ["update", "PATCH /api/v1/guests/:id"],
  ["addNote", "POST /api/v1/guests/:id/notes"],
  ["getLapsing", "GET /api/v1/guests/lapsing"],
  ["sendWinBack", "POST /api/v1/guests/:id/win-back"],
  ["delete", "DELETE /api/v1/guests/:id"],
] as const;

describe("guestsEndpoints", () => {
  it("declares exactly the 11 pilot endpoints, one definition each", () => {
    const declared = Object.entries(guestsEndpoints).map(([name, def]) => [
      name,
      `${def.method} ${def.path}`,
    ]);
    expect(declared.sort()).toEqual(PILOT_TABLE.map(([n, r]) => [n, r]).sort());
  });

  it("has exactly one 2xx response per endpoint (runtime backstop)", () => {
    for (const def of Object.values(guestsEndpoints)) {
      expect(() => successResponse(def)).not.toThrow();
    }
  });

  it("states an RFC 7807 problem for every error status (ADR-002 Error# envelope)", () => {
    for (const def of Object.values(guestsEndpoints)) {
      for (const [status, response] of Object.entries(def.responses)) {
        if (Number(status) >= 400) expect(response).toHaveProperty("kind", "problem");
      }
    }
  });

  it("imports Zod and @mbe/types schemas only — no Fastify, no JSON Schema, safe for the client bundle", () => {
    const imports = [...guestsSource.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier).not.toMatch(/fastify|json-schema/);
    }
  });
});
