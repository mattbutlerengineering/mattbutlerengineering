import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";

vi.mock("../services/database.js", () => ({ db: { prisma: {} } }));
vi.mock("../services/demo-venue.js", () => ({
  DEMO_VENUE_SLUG: "demo-bistro",
  ensureDemoVenue: vi.fn(),
}));

const { runSeedDemoVenue } = await import("./seed-demo-venue.js");
const { ensureDemoVenue } = await import("../services/demo-venue.js");

describe("runSeedDemoVenue", () => {
  it("seeds the demo venue and logs the slug and venue id", async () => {
    vi.mocked(ensureDemoVenue).mockResolvedValueOnce({ venueId: "demo-venue-bistro" });
    const lines: string[] = [];
    const result = await runSeedDemoVenue({} as PrismaClient, (l) => lines.push(l));

    expect(result).toEqual({ ok: true, slug: "demo-bistro", venueId: "demo-venue-bistro" });
    expect(lines.join("\n")).toContain("demo-bistro");
  });

  it("logs a failure and reports it instead of throwing", async () => {
    vi.mocked(ensureDemoVenue).mockRejectedValueOnce(new Error("db down"));
    const lines: string[] = [];
    const result = await runSeedDemoVenue({} as PrismaClient, (l) => lines.push(l));

    expect(result).toEqual({ ok: false, slug: "demo-bistro", message: "db down" });
    expect(lines.join("\n")).toContain("db down");
  });
});
