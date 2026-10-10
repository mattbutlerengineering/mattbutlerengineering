import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { APP_RESERVATIONS_ROLE, appRoleSetStatement, assumeAppRole } from "./assume-app-role.js";

describe("assumeAppRole", () => {
  it("checks app_reservations against ^[a-z_]+$ and emits only that SET LOCAL ROLE statement", () => {
    expect(APP_RESERVATIONS_ROLE).toBe("app_reservations");
    expect(appRoleSetStatement()).toBe('SET LOCAL ROLE "app_reservations"');
    expect(() => appRoleSetStatement("app-reservations")).toThrow(/refusing SET LOCAL ROLE/);
    expect(() => appRoleSetStatement('app_reservations"; DROP ROLE postgres')).toThrow(
      /refusing SET LOCAL ROLE/
    );
  });

  it("runs $executeRawUnsafe with the checked constant and no bind values", async () => {
    const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(0) };

    await assumeAppRole(tx);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL ROLE "app_reservations"');
  });

  it("is not called by migrate, seed, health, or readiness", () => {
    const seed = readFileSync(new URL("../../prisma/seed.ts", import.meta.url), "utf8");
    const pulumi = readFileSync(
      new URL("../../../../infrastructure/pulumi/index.ts", import.meta.url),
      "utf8"
    );
    const health = readFileSync(new URL("../routes/health.ts", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
    const floorPlan = readFileSync(new URL("./floor-plan.ts", import.meta.url), "utf8");

    for (const source of [seed, pulumi, health, app]) {
      expect(source).not.toContain("assumeAppRole");
    }
    expect(floorPlan).not.toContain("assumeAppRole");
    expect(floorPlan).toContain("setVenueContext");
  });

  it("assumes the role inside a transaction at the four raw call sites and does not swallow 42704 or 42501", () => {
    const files = ["resolve-venue.ts", "venue.ts", "lapsed-guest-cron.ts", "reservation.ts"];
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source, file).toContain("assumeAppRole");
      expect(source, file).toContain("$transaction");
      expect(source, file).not.toContain("42704");
      expect(source, file).not.toContain("42501");
    }
  });
});
