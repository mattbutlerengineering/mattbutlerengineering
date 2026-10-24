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

  it("keeps the catalog's component rules, after the assistant guidance", () => {
    const prompt = buildAgentSystemPrompt({ venueId: "v", now: NOW, catalogPrompt: "CATALOG" });

    expect(prompt.endsWith("CATALOG")).toBe(true);
  });
});
