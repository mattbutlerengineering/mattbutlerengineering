import { describe, expect, it } from "vitest";
import { emptyDraft, type QuickSetupDraft } from "../availability/quick-setup-draft.js";
import { validateDraft } from "../availability/quick-setup-validate.js";
import { EMPTY_FLOOR_PLAN_DRAFT } from "./floor-plan-draft.js";
import { draftFromTemplate } from "./floor-plan-templates.js";
import {
  applyOnboardingPatch,
  onboardingDraftOf,
  type OnboardingPatchTarget,
} from "./onboarding-chat-patch.js";

// Hours and floor plan patches (#9475). Strings in, the step's own draft out, through the
// step's own validators.

const CURRENT: OnboardingPatchTarget = {
  locationTime: { ianaTimezone: "America/New_York", currencyCode: "USD" },
  settings: { defaultReservationDuration: "90", maxPartySize: "8", advanceBookingDays: "30" },
  hours: emptyDraft("onboarding-service-1"),
  floorPlan: EMPTY_FLOOR_PLAN_DRAFT,
};

function hoursOf(result: ReturnType<typeof applyOnboardingPatch>): QuickSetupDraft {
  if (result.kind !== "applied" || result.step !== "hours") throw new Error("not applied hours");
  return result.data;
}

describe("applyOnboardingPatch: hours", () => {
  it("fills a whole service and passes the card's own validator", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "hours",
      data: {
        serviceName: "Dinner",
        opens: "17:00",
        closes: "22:00",
        days: "tue,wed,thu,fri,sat",
      },
    });
    const draft = hoursOf(result);
    expect(draft.services[0]).toMatchObject({ name: "Dinner", opens: "17:00", closes: "22:00" });
    // Last seating follows the close while the owner has not set it.
    expect(draft.services[0]?.lastSeating).toBe("21:15");
    expect([...draft.days].sort()).toEqual([2, 3, 4, 5, 6]);
    expect(validateDraft(draft, { legacyReader: true })).toEqual([]);
  });

  it("sets an explicit last seating and stops it following the close", () => {
    const draft = hoursOf(
      applyOnboardingPatch(CURRENT, {
        step: "hours",
        data: { opens: "17:00", closes: "22:00", lastSeating: "21:00" },
      })
    );
    expect(draft.services[0]).toMatchObject({ lastSeating: "21:00", lastSeatingLinked: false });
  });

  it("applies a partial patch over what the owner already entered, leaving the rest", () => {
    const first = hoursOf(
      applyOnboardingPatch(CURRENT, {
        step: "hours",
        data: { serviceName: "Dinner", opens: "17:00", closes: "22:00", days: "mon,tue" },
      })
    );
    const second = applyOnboardingPatch(
      { ...CURRENT, hours: first },
      {
        step: "hours",
        data: { closes: "23:00" },
      }
    );
    const draft = hoursOf(second);
    expect(draft.services[0]).toMatchObject({ name: "Dinner", opens: "17:00", closes: "23:00" });
    expect([...draft.days].sort()).toEqual([1, 2]);
    expect(first.services[0]?.closes).toBe("22:00");
  });

  it("accepts an incomplete draft: a lone opening time is a start, not an error", () => {
    const result = applyOnboardingPatch(CURRENT, { step: "hours", data: { opens: "11:30" } });
    expect(result.kind).toBe("applied");
    expect(hoursOf(result).services[0]?.opens).toBe("11:30");
  });

  it("treats a close earlier than the open as past midnight", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "hours",
      data: { opens: "22:00", closes: "01:00", days: "fri,sat" },
    });
    expect(result.kind).toBe("applied");
  });

  it("rejects a time the picker cannot hold, naming it", () => {
    for (const opens of ["5pm", "25:00", "17:60", ""]) {
      const result = applyOnboardingPatch(CURRENT, { step: "hours", data: { opens } });
      expect(result.kind, opens).toBe("rejected");
      if (result.kind === "rejected") expect(Object.keys(result.errors)).toEqual(["opens"]);
    }
  });

  it("rejects an unknown day and a name over the service limit", () => {
    const day = applyOnboardingPatch(CURRENT, { step: "hours", data: { days: "mon,funday" } });
    expect(day.kind).toBe("rejected");
    const name = applyOnboardingPatch(CURRENT, {
      step: "hours",
      data: { serviceName: "x".repeat(41) },
    });
    expect(name.kind).toBe("rejected");
    if (name.kind === "rejected") expect(Object.keys(name.errors)).toEqual(["serviceName"]);
  });

  it("rejects hours the card's validator refuses (last seating after close)", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "hours",
      data: {
        serviceName: "Dinner",
        opens: "17:00",
        closes: "22:00",
        lastSeating: "23:30",
        days: "mon",
      },
    });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(Object.keys(result.errors)).toEqual(["lastSeating"]);
  });

  it("leaves the current draft untouched when rejected", () => {
    applyOnboardingPatch(CURRENT, { step: "hours", data: { opens: "nope" } });
    expect(CURRENT.hours.services[0]?.opens).toBeNull();
  });

  it("is malformed with an unknown field or a non-string value", () => {
    expect(applyOnboardingPatch(CURRENT, { step: "hours", data: { seats: "4" } }).kind).toBe(
      "malformed"
    );
    expect(applyOnboardingPatch(CURRENT, { step: "hours", data: { opens: 1700 } }).kind).toBe(
      "malformed"
    );
  });
});

describe("applyOnboardingPatch: floor plan", () => {
  it("picks a template and size like the picker does", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "floorPlan",
      data: { templateId: "cafe", roomSize: "standard" },
    });
    expect(result).toEqual({
      kind: "applied",
      step: "floorPlan",
      data: draftFromTemplate("cafe", "standard"),
    });
  });

  it("keeps the current size when only a template is given, and the template when only a size", () => {
    const withTemplate = applyOnboardingPatch(CURRENT, {
      step: "floorPlan",
      data: { templateId: "fine-dining" },
    });
    if (withTemplate.kind !== "applied" || withTemplate.step !== "floorPlan") throw new Error();
    expect(withTemplate.data).toEqual(draftFromTemplate("fine-dining", "cozy"));

    const resized = applyOnboardingPatch(
      { ...CURRENT, floorPlan: withTemplate.data },
      { step: "floorPlan", data: { roomSize: "grand" } }
    );
    if (resized.kind !== "applied" || resized.step !== "floorPlan") throw new Error();
    expect(resized.data).toEqual(draftFromTemplate("fine-dining", "grand"));
  });

  it("remembers a size picked before any template", () => {
    const result = applyOnboardingPatch(CURRENT, {
      step: "floorPlan",
      data: { roomSize: "spacious" },
    });
    if (result.kind !== "applied" || result.step !== "floorPlan") throw new Error();
    expect(result.data).toEqual({ ...EMPTY_FLOOR_PLAN_DRAFT, sizeId: "spacious" });
  });

  it("rejects a template or size the step does not offer", () => {
    const template = applyOnboardingPatch(CURRENT, {
      step: "floorPlan",
      data: { templateId: "ballroom" },
    });
    expect(template.kind).toBe("rejected");
    if (template.kind === "rejected") expect(Object.keys(template.errors)).toEqual(["templateId"]);
    const size = applyOnboardingPatch(CURRENT, { step: "floorPlan", data: { roomSize: "huge" } });
    expect(size.kind).toBe("rejected");
    if (size.kind === "rejected") expect(Object.keys(size.errors)).toEqual(["roomSize"]);
  });

  it("will not replace a layout the owner has edited by hand", () => {
    const edited = { ...draftFromTemplate("cafe", "cozy"), pristine: false };
    const result = applyOnboardingPatch(
      { ...CURRENT, floorPlan: edited },
      { step: "floorPlan", data: { templateId: "bar-lounge" } }
    );
    expect(result.kind).toBe("rejected");
  });

  it("is malformed with an unknown field", () => {
    expect(applyOnboardingPatch(CURRENT, { step: "floorPlan", data: { tables: "12" } }).kind).toBe(
      "malformed"
    );
  });
});

describe("onboardingDraftOf", () => {
  it("is the flat string draft the server schema takes, for every step", () => {
    expect(onboardingDraftOf("locationTime", CURRENT)).toEqual(CURRENT.locationTime);
    expect(onboardingDraftOf("settings", CURRENT)).toEqual(CURRENT.settings);
    expect(onboardingDraftOf("floorPlan", CURRENT)).toEqual({ templateId: "", roomSize: "cozy" });
    const hours = hoursOf(
      applyOnboardingPatch(CURRENT, {
        step: "hours",
        data: { serviceName: "Dinner", opens: "17:00", closes: "22:00", days: "sat,mon" },
      })
    );
    expect(onboardingDraftOf("hours", { ...CURRENT, hours })).toEqual({
      serviceName: "Dinner",
      opens: "17:00",
      closes: "22:00",
      lastSeating: "21:15",
      days: "mon,sat",
    });
  });
});
