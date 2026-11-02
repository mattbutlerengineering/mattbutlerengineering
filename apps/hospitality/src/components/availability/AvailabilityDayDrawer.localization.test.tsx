import { afterAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveDay } from "@mbe/availability";
import { localeRuntime } from "../../i18n/runtime.js";
import esMX from "../../i18n/catalogs/es-MX.json";
import frCA from "../../i18n/catalogs/fr-CA.json";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  PARTY_CLOSURE,
  TONIGHT_STOP,
  VENUE_CLOSURE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

// "Why this day" renders the engine's layers, which the engine words in en-US.
// The first schedule is seeded as "Regular week" by the quick setup.
function seededDay(...rules: Parameters<typeof fixtureConfig>) {
  const config = fixtureConfig(...rules);
  const schedules = config.schedules.map((s) => ({ ...s, name: "Regular week" }));
  return resolveDay({ timezone: FIXTURE_TIMEZONE, config: { ...config, schedules } }, FIXTURE_DATE);
}

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

function renderDrawer(day: ReturnType<typeof seededDay>) {
  return render(
    <main>
      <AvailabilityDayDrawer
        date={FIXTURE_DATE}
        day={day}
        isLoading={false}
        error={null}
        viewerRole="manager"
        onClose={() => undefined}
      />
    </main>
  );
}

const CASES = [
  {
    tag: "fr-CA" as const,
    catalog: frCA,
    labels: ["Semaine habituelle", "Horaire spécial", "Fermé", "Ce soir"],
    allDay: "Toute la journée",
    closed: "Fermé",
  },
  {
    tag: "es-MX" as const,
    catalog: esMX,
    labels: ["Semana habitual", "Horario especial", "Cerrado", "Esta noche"],
    allDay: "Todo el día",
    closed: "Cerrado",
  },
];

describe("AvailabilityDayDrawer layer labels", () => {
  for (const c of CASES) {
    it(`reads the engine's layer labels in ${c.tag}`, async () => {
      await useLocale(c.tag, c.catalog);
      renderDrawer(seededDay(EARLY_DINNER, VENUE_CLOSURE, TONIGHT_STOP));
      const shown = Array.from(document.querySelectorAll("[data-layer-label]")).map(
        (el) => el.textContent
      );
      expect(shown).toEqual(c.labels);
      expect(screen.getByText(c.allDay)).toBeTruthy();
      expect(screen.queryByText("Regular week")).toBeNull();
      expect(screen.queryByText("Closed")).toBeNull();
      expect(screen.queryByText("All day")).toBeNull();
    });

    it(`reads a timed closure's window in ${c.tag}`, async () => {
      await useLocale(c.tag, c.catalog);
      renderDrawer(seededDay(EARLY_DINNER, PARTY_CLOSURE));
      expect(screen.getByText(c.closed)).toBeTruthy();
      expect(screen.queryByText("10:00 PM – 11:00 PM")).toBeNull();
      expect(screen.queryByText("Closed")).toBeNull();
    });
  }
});
