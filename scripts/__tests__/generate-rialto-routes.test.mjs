import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepoIo } from "../ui-quality/routes.mjs";
import {
  RIALTO_ROUTES_PATH,
  buildRialtoRoutes,
  collectRialtoRoutes,
} from "../generate-rialto-routes.mjs";
import { FAMILIES } from "../regen-manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const page = (route) => ({ route, kind: "page", source_files: [] });

describe("collectRialtoRoutes", () => {
  it("keeps concrete and dynamic pages, drops the catch-all, sorts and dedupes", () => {
    const routes = collectRialtoRoutes([
      page("privacy"),
      page("/"),
      page("demos/drivers/:id"),
      page("privacy"),
      { route: "*", kind: "not-found", source_files: [] },
    ]);
    expect(routes).toEqual(["/", "/demos/drivers/:id", "/privacy"]);
  });
});

describe("committed rialto routes", () => {
  it("match the generator output", () => {
    expect(readFileSync(resolve(ROOT, RIALTO_ROUTES_PATH), "utf8")).toBe(
      buildRialtoRoutes(createRepoIo(ROOT))
    );
  });

  it("is registered as a regen family", () => {
    expect(FAMILIES.find((f) => f.id === "rialto-edge-routes")?.outputs).toEqual([
      RIALTO_ROUTES_PATH,
    ]);
  });
});
