import { describe, it, expect } from "vitest";
import enUS from "../../i18n/catalogs/en-US.json";
import esMX from "../../i18n/catalogs/es-MX.json";
import frCA from "../../i18n/catalogs/fr-CA.json";
import {
  BRIEFING_LINE_IDS,
  BRIEFING_LINE_MAX,
  ROADMAP,
  ROADMAP_ROW_MAX,
  RUSH_SLOT_COUNT,
  RUSH_TABLES,
  SCENES,
  skyThemeFor,
} from "./service-night.js";

const CATALOGS = { "en-US": enUS, "es-MX": esMX, "fr-CA": frCA } as const;

/** Every string under `showcase.*` in a catalog. */
function leaves(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") return Object.values(node).flatMap(leaves);
  return [];
}

describe("service-night structure", () => {
  it("tells the night in clock order, crossing midnight exactly once", () => {
    const times = SCENES.map((scene) => scene.time);
    const wraps = times.filter((time, index) => index > 0 && time < (times[index - 1] ?? ""));
    expect(wraps).toEqual(["00:00"]);
    expect(times[0]).toBe("15:00");
    expect(times.at(-1)).toBe("07:00");
  });

  it("gives every scene and claim a unique id", () => {
    const sceneIds = SCENES.map((scene) => scene.id);
    expect(new Set(sceneIds).size).toBe(sceneIds.length);
    const claimIds = [...SCENES.flatMap((scene) => scene.claims), ...ROADMAP].map((c) => c.id);
    expect(new Set(claimIds).size).toBe(claimIds.length);
  });

  it("marks every roadmap idea, the assistant follow-up and the night summary as concepts", () => {
    expect(ROADMAP.length).toBeGreaterThan(0);
    expect(ROADMAP.every((idea) => idea.status === "concept")).toBe(true);
    const byId = new Map(SCENES.flatMap((scene) => scene.claims).map((c) => [c.id, c.status]));
    expect(byId.get("tonightAutopilot")).toBe("concept");
    expect(byId.get("nightInNumbers")).toBe("concept");
    expect(byId.get("lostDemandLedger")).toBe("concept");
  });

  it("turns the lights down from doors until after hours and up again for morning", () => {
    expect(Object.fromEntries(SCENES.map((scene) => [scene.id, skyThemeFor(scene.id)]))).toEqual({
      hero: "light",
      prep: "light",
      doors: "dark",
      rush: "dark",
      assistant: "dark",
      guest: "dark",
      close: "dark",
      roadmap: "dark",
      morning: "light",
    });
  });

  it("keeps every rush booking inside the charted service window", () => {
    for (const table of RUSH_TABLES) {
      for (const booking of table.bookings) {
        expect(booking.startSlot).toBeGreaterThanOrEqual(0);
        expect(booking.startSlot + booking.slots).toBeLessThanOrEqual(RUSH_SLOT_COUNT);
      }
    }
  });
});

describe.each(Object.entries(CATALOGS))("showcase copy in %s", (_tag, catalog) => {
  const showcase = catalog.showcase;

  it("has a name, heading and body for every scene, and a label and detail for every claim", () => {
    for (const scene of SCENES) {
      expect(Object.keys(showcase.scenes[scene.id]).sort()).toEqual(["body", "heading", "name"]);
    }
    for (const claim of [...SCENES.flatMap((scene) => scene.claims), ...ROADMAP]) {
      expect(Object.keys(showcase.claims[claim.id]).sort()).toEqual(["detail", "label"]);
    }
  });

  it("keeps the board lines within what the boards can show: short, unaccented", () => {
    for (const id of BRIEFING_LINE_IDS) {
      const line = showcase.prep.board[id];
      expect(line.length, line).toBeLessThanOrEqual(BRIEFING_LINE_MAX);
      expect(line, line).toMatch(/^[\x20-\x7E]+$/);
    }
    for (const row of [showcase.roadmap.boardHeading, ...Object.values(showcase.roadmap.board)]) {
      expect(row.length, row).toBeLessThanOrEqual(ROADMAP_ROW_MAX);
      expect(row, row).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it("never promises a stated product non-goal", () => {
    // PRODUCT.md non-goals: POS integration, payroll/staffing, native mobile apps.
    const banned =
      /\b(pos|tpv|payroll|nómina|paie|staffing|rota|native app|app store|aplicación nativa|application native)\b/i;
    expect(leaves(showcase).filter((text) => banned.test(text))).toEqual([]);
  });
});
