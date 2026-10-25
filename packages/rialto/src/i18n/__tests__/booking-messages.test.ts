import { describe, expect, it } from "vitest";
import { enUS, type RialtoMessages } from "../messages";
import { enGB } from "../locales/en-GB";
import { esMX } from "../locales/es-MX";
import { frCA } from "../locales/fr-CA";

/** The words the chat elements (ReservationList, TimeSlots, GuestCards) render. */
const LOCALES: Record<string, RialtoMessages> = { enUS, enGB, esMX, frCA };

const STATUS_KEYS = ["pending", "confirmed", "cancelled", "completed", "noShow", "seated"];
const RISK_KEYS = ["trusted", "standard", "risky"];
const STRING_KEYS = ["walkIn", "noOpenTimes", "reservations", "openTimes", "guests"] as const;

describe("chat element words", () => {
  it.each(Object.entries(LOCALES))("%s has every status, risk and label word", (_n, m) => {
    expect(Object.keys(m.reservationStatus).sort()).toEqual([...STATUS_KEYS].sort());
    expect(Object.keys(m.guestRisk).sort()).toEqual([...RISK_KEYS].sort());
    for (const word of [
      ...Object.values(m.reservationStatus),
      ...Object.values(m.guestRisk),
      ...STRING_KEYS.map((k) => m[k]),
    ]) {
      expect(word.trim()).not.toBe("");
    }
    expect(m.partyOf(4)).toContain("4");
    expect(m.visitCount(3)).toContain("3");
  });

  it.each([
    ["enUS", enUS, "Party of 4", "1 visit", "2 visits", "0 visits"],
    ["esMX", esMX, "Grupo de 4", "1 visita", "2 visitas", "0 visitas"],
    // French takes the singular for 0 and 1.
    ["frCA", frCA, "Groupe de 4", "1 visite", "2 visites", "0 visite"],
  ] as const)("%s counts party size and visits", (_n, m, party, one, two, zero) => {
    expect(m.partyOf(4)).toBe(party);
    expect(m.visitCount(1)).toBe(one);
    expect(m.visitCount(2)).toBe(two);
    expect(m.visitCount(0)).toBe(zero);
  });

  it.each([
    ["esMX", esMX],
    ["frCA", frCA],
  ] as const)("%s translates the list names and the empty line", (_n, m) => {
    for (const key of STRING_KEYS) {
      expect(m[key]).not.toBe(enUS[key]);
    }
    expect(m.partyOf(2)).not.toBe(enUS.partyOf(2));
    expect(m.visitCount(2)).not.toBe(enUS.visitCount(2));
  });
});
