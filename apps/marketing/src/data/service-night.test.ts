import { describe, it, expect } from "vitest";
import {
  SCENES,
  BRIEFING_LINES,
  BRIEFING_LINE_MAX,
  RUSH_TABLES,
  ROADMAP,
  NIGHT_TOTALS,
  skyThemeFor,
} from "./service-night.js";

/** Every piece of visitor-facing copy the page renders from this module. */
function allCopy(): string[] {
  return [
    ...SCENES.flatMap((scene) => [
      scene.name,
      scene.heading,
      scene.body,
      ...scene.claims.flatMap((claim) => [claim.label, claim.detail]),
    ]),
    ...BRIEFING_LINES,
    ...RUSH_TABLES.flatMap((table) => [table.label, ...table.bookings.map((b) => b.party)]),
    ...ROADMAP.flatMap((idea) => [idea.label, idea.detail]),
    ...NIGHT_TOTALS.map((total) => total.label),
  ];
}

describe("service-night scene data", () => {
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
    const claimIds = SCENES.flatMap((scene) => scene.claims.map((claim) => claim.id));
    expect(new Set(claimIds).size).toBe(claimIds.length);
  });

  it("marks every roadmap idea as a concept, never as shipped", () => {
    expect(ROADMAP.length).toBeGreaterThan(0);
    expect(ROADMAP.every((idea) => idea.status === "concept")).toBe(true);
  });

  it("keeps the unbuilt assistant follow-up and night summary labelled as concepts", () => {
    const byId = new Map(
      SCENES.flatMap((scene) => scene.claims).map((claim) => [claim.id, claim.status])
    );
    expect(byId.get("tonight-autopilot")).toBe("concept");
    expect(byId.get("night-in-numbers")).toBe("concept");
  });

  it("never promises a stated product non-goal", () => {
    // PRODUCT.md non-goals: POS integration, payroll/staffing, native mobile apps.
    const banned = /\b(pos|payroll|staffing|rota|native app|app store)\b/i;
    expect(allCopy().filter((text) => banned.test(text))).toEqual([]);
  });

  it("turns the lights down from doors until close and up again for morning", () => {
    const themes = Object.fromEntries(SCENES.map((scene) => [scene.id, skyThemeFor(scene.id)]));
    expect(themes).toEqual({
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

  it("keeps every briefing line short enough for the board on a phone", () => {
    expect(BRIEFING_LINES.filter((line) => line.length > BRIEFING_LINE_MAX)).toEqual([]);
  });

  it("keeps every rush booking inside the charted service window", () => {
    for (const table of RUSH_TABLES) {
      for (const booking of table.bookings) {
        expect(booking.startSlot).toBeGreaterThanOrEqual(0);
        expect(booking.startSlot + booking.slots).toBeLessThanOrEqual(16);
      }
    }
  });
});
