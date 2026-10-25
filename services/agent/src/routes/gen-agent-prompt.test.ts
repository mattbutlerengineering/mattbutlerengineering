import { describe, it, expect } from "vitest";
import { buildAgentSystemPrompt } from "./gen-agent-prompt.js";

const NOW = new Date("2026-10-25T02:00:00Z"); // Sat Oct 24, 7pm Pacific

describe("buildAgentSystemPrompt", () => {
  it("anchors relative dates to the venue's today, not UTC's", () => {
    const prompt = buildAgentSystemPrompt({
      venueId: "venue-1",
      timeZone: "America/Los_Angeles",
      now: NOW,
      catalogPrompt: "CATALOG",
    });

    expect(prompt).toContain("Saturday, 2026-10-24");
    expect(prompt).toContain("America/Los_Angeles");
    expect(prompt).not.toContain("2026-10-25");
  });

  it("tells the model the venue is already selected and never to ask for ids", () => {
    const prompt = buildAgentSystemPrompt({
      venueId: "venue-1",
      now: NOW,
      catalogPrompt: "CATALOG",
    });

    expect(prompt).toMatch(/venue is already selected/i);
    expect(prompt).toMatch(/never ask .*venue ID/i);
    expect(prompt).not.toMatch(/no venue is selected/i);
  });

  it("asks the user to pick a venue when none is selected", () => {
    const prompt = buildAgentSystemPrompt({ now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/no venue is selected/i);
  });

  it("tells the model its earlier replies were grounded, so it stops 'correcting' them", () => {
    // Live run 2026-10-24: history carries only reply text, not tool calls, so
    // every turn opened with "I hadn't checked the system before I answered".
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/earlier replies .*tool results/i);
    expect(prompt).toMatch(/don't apologize for or correct/i);
  });

  it("explains the table status lifecycle in staff terms", () => {
    // Live run 2026-10-24: "I can't tell whether READY tables are free to seat."
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toContain("AVAILABLE");
    expect(prompt).toMatch(/only an AVAILABLE table can be seated/i);
    expect(prompt).toMatch(/"clean", that means READY/i);
    expect(prompt).toMatch(/plain words/i);
  });

  it("points staff at the Confirm button, never at typing yes", () => {
    // Live run 2026-10-24: the model said "Reply yes to confirm", but typing a
    // message while a confirm is pending cancels it in the chat UI.
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt).toMatch(/Confirm or Cancel button/);
    expect(prompt).toMatch(/never ask them to type yes/i);
  });

  it("maps each kind of tool data to the element that shows it", () => {
    const prompt = buildAgentSystemPrompt({
      venueId: "venue-1",
      now: NOW,
      catalogPrompt: "CATALOG",
    });

    expect(prompt).toMatch(/counts .*Stat/i);
    expect(prompt).toMatch(/Timeline/);
    expect(prompt).toMatch(/table statuses? .*StatusLED/i);
    expect(prompt).toMatch(/dietary .*Tag/i);
  });

  it("keeps the catalog's component rules, after the assistant guidance", () => {
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt.endsWith("CATALOG")).toBe(true);
  });
});
