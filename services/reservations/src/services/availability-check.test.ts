import { describe, expect, it, vi } from "vitest";
import type * as AssertBookable from "./assert-bookable.js";

vi.mock("./database.js", () => ({ prisma: { tag: "prisma" } }));
vi.mock("./assert-bookable.js", async (importOriginal) => {
  const actual = await importOriginal<typeof AssertBookable>();
  return { ...actual, judgeBooking: vi.fn() };
});

import { judgeBooking } from "./assert-bookable.js";
import { prisma } from "./database.js";
import { checkAvailability } from "./availability-check.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const body = { start: "2026-11-06T19:00:00.000Z", partySize: 4, channel: "phone" } as const;

describe("checkAvailability", () => {
  it("judges a phone booking at the start instant, with no override", async () => {
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "ok" });

    const result = await checkAvailability("v1", { ...body, tableId: "t1" }, NOW);

    expect(result).toEqual({ kind: "ok" });
    expect(judgeBooking).toHaveBeenCalledWith(
      prisma,
      {
        venueId: "v1",
        tableId: "t1",
        start: new Date(body.start),
        partySize: 4,
        channel: "phone",
      },
      NOW
    );
  });

  it("describes a soft limit with its limits and a human message", async () => {
    vi.mocked(judgeBooking).mockResolvedValueOnce({
      kind: "rejected",
      rejection: { code: "soft-limit", limits: ["pacing"] },
    });
    expect(await checkAvailability("v1", body, NOW)).toEqual({
      kind: "soft",
      limits: ["pacing"],
      message: "This booking is over the pacing limit.",
    });
  });

  it("describes a closure as hard, with the venue's message", async () => {
    vi.mocked(judgeBooking).mockResolvedValueOnce({
      kind: "rejected",
      rejection: { code: "outside-availability", reason: "closed", message: "Private event" },
    });
    expect(await checkAvailability("v1", body, NOW)).toEqual({
      kind: "hard",
      reason: "closed",
      message: "Private event",
    });
  });

  it("reports a taken table as a hard conflict", async () => {
    vi.mocked(judgeBooking).mockResolvedValueOnce({ kind: "conflict" });
    expect(await checkAvailability("v1", body, NOW)).toEqual({
      kind: "hard",
      reason: "conflict",
      message: "This table is not available at this time.",
    });
  });
});
