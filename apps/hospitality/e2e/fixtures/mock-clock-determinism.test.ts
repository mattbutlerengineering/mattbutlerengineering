import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDepositsFixture, buildSlotsBody } from "../api-mocks.js";

// The visual suite pins the browser clock to FIXED_NOW, but api-mocks.ts runs in Node,
// where page.clock does not reach. These builders take the instant explicitly so the
// visual spec can hand them FIXED_NOW; they must never fall back to the ambient clock.
const FIXED_NOW = new Date("2026-06-15T17:30:00Z");

describe("mock builders are a pure function of the instant passed in", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buildDepositsFixture ignores the ambient clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T08:00:00Z"));
    const first = buildDepositsFixture(FIXED_NOW);
    vi.setSystemTime(new Date("2026-10-14T23:59:00Z"));
    const second = buildDepositsFixture(FIXED_NOW);

    expect(second).toEqual(first);
    expect(first[1]?.heldAt).toBe(FIXED_NOW.toISOString());
  });

  it("buildSlotsBody ignores the ambient clock and picks the next 17 May after FIXED_NOW", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T08:00:00Z"));
    const first = buildSlotsBody(FIXED_NOW);
    vi.setSystemTime(new Date("2027-08-01T08:00:00Z"));
    const second = buildSlotsBody(FIXED_NOW);

    expect(second).toBe(first);
    expect(first).toContain("2027-05-17");
    expect(first).not.toContain("2026-05-17");
  });
});
