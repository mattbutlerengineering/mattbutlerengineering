import { describe, expect, it } from "vitest";
import {
  OFFERED_CURRENCY_CODES,
  OFFERED_TIMEZONES,
  ROOM_SIZE_IDS,
  ROOM_TEMPLATE_IDS,
} from "@mbe/types";
import { ROOM_SIZES, ROOM_TEMPLATES } from "../floor-plan/room-templates.js";
import { isOfferedCurrency, isOfferedTimezone } from "./LocationTimeStep.js";

// The chat route (`services/agent`) validates against these same lists (#9475), so the form's
// pickers must be built from them, not from a second copy.

describe("the onboarding value sets shared with the chat route", () => {
  it("offers exactly the shared time zones and currencies in the form", () => {
    expect(OFFERED_TIMEZONES.every(isOfferedTimezone)).toBe(true);
    expect(OFFERED_CURRENCY_CODES.every(isOfferedCurrency)).toBe(true);
    expect(isOfferedTimezone("America/Detroit")).toBe(false);
    expect(isOfferedCurrency("CZK")).toBe(false);
  });

  it("matches the room templates and sizes the floor-plan step builds", () => {
    expect(ROOM_TEMPLATES.map((template) => template.id)).toEqual([...ROOM_TEMPLATE_IDS]);
    expect(ROOM_SIZES.map((size) => size.id)).toEqual([...ROOM_SIZE_IDS]);
  });
});
