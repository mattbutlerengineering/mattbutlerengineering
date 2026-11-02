import { afterAll, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { localeRuntime } from "../../i18n/runtime.js";
import esMX from "../../i18n/catalogs/es-MX.json";
import frCA from "../../i18n/catalogs/fr-CA.json";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  LUNCH_WINDOW,
  ONLINE_CLOSURE,
  SKIP_WEEKLY,
  TONIGHT_CLOSE,
  TONIGHT_PACING,
  TONIGHT_STOP,
  VENUE_CLOSURE,
  WEEKLY_CLOSURE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

// "Why this day" renders the engine's layers. The engine words them in en-US and also hands over
// the facts as data; the drawer must read in the viewer's language from that data.

const USE_SUMMER: DateRule = {
  startsOn: FIXTURE_DATE,
  endsOn: FIXTURE_DATE,
  id: "r-use",
  kind: "use_schedule",
  targetKind: "venue",
  useScheduleId: "summer",
};

function withSchedules(config: AvailabilityConfig, regularName: string): AvailabilityConfig {
  return {
    ...config,
    schedules: [
      ...config.schedules.map((s) => ({ ...s, name: regularName })),
      { id: "summer", name: "Summer", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...config.scheduleServices,
      {
        id: "ss-summer",
        scheduleId: "summer",
        venueServiceId: "vs-lunch",
        opensAt: 690,
        lastSeatingAt: 840,
        closesAt: 900,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
    ],
  };
}

function dayOf(config: AvailabilityConfig) {
  return resolveDay({ timezone: FIXTURE_TIMEZONE, config }, FIXTURE_DATE);
}

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

/** Each "Why this day" row as [title, effect]. */
function rowsOf(day: ReturnType<typeof dayOf>): string[][] {
  const { container } = render(
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
  return Array.from(container.querySelectorAll("ol li")).map((li) =>
    Array.from(li.querySelectorAll("span"))
      .slice(0, 2)
      .map((s) => s.textContent ?? "")
  );
}

const STACKED = () =>
  dayOf(
    withSchedules(
      fixtureConfig(
        USE_SUMMER,
        LUNCH_WINDOW,
        ONLINE_CLOSURE,
        WEEKLY_CLOSURE,
        SKIP_WEEKLY,
        TONIGHT_CLOSE
      ),
      "Regular week"
    )
  );

const BARE = () =>
  dayOf(
    withSchedules(
      {
        ...fixtureConfig(EARLY_DINNER, VENUE_CLOSURE, TONIGHT_STOP, TONIGHT_PACING),
        scheduleServices: [],
      },
      "Regular week"
    )
  );

const ALL_CHANNELS: DateRule = {
  startsOn: FIXTURE_DATE,
  endsOn: FIXTURE_DATE,
  id: "r-all-channels",
  kind: "closure",
  targetKind: "booking",
  bookingTypes: ["online", "phone", "waitlist"],
};
const ONE_COVER: DateRule = {
  startsOn: FIXTURE_DATE,
  endsOn: FIXTURE_DATE,
  id: "r-one-cover",
  kind: "tonight",
  targetKind: "venue",
  payload: { version: 1, pacing: { covers: 1 } },
};
const EDGES = () => dayOf(withSchedules(fixtureConfig(ALL_CHANNELS, ONE_COVER), "Regular week"));

const CASES = [
  {
    tag: "fr-CA" as const,
    catalog: frCA,
    stacked: [
      ["Semaine habituelle", "Lunch 11 h 30 – 15 h 00, Dinner 17 h 00 – 23 h 00"],
      ["Utiliser Summer", "Lunch 11 h 30 – 15 h 00"],
      [
        "Série ignorée : Fermé · vendredis · 2026-10-01 – 2026-12-31",
        "Réservable comme d'habitude",
      ],
      ["Fermé : Lunch", "12 h 00 – 13 h 00"],
      ["Réservation fermée : en ligne", "Toute la journée"],
      ["Ce soir", "Ferme à 21 h 00"],
    ],
    edges: [
      ["Semaine habituelle", "Lunch 11 h 30 – 15 h 00, Dinner 17 h 00 – 23 h 00"],
      ["Réservation fermée : en ligne, par téléphone et liste d'attente", "Toute la journée"],
      ["Ce soir", "Cadence de 1 couvert"],
    ],
    bareClosed: [
      ["Semaine habituelle", "Fermé"],
      ["Horaire spécial", "Lunch 11 h 30 – 15 h 00, Dinner 17 h 00 – 22 h 00"],
      ["Fermé", "Toute la journée"],
      ["Ce soir", "Arrêté 21 h 00 – 21 h 30"],
      ["Ce soir", "Cadence de 6 couverts"],
    ],
  },
  {
    tag: "es-MX" as const,
    catalog: esMX,
    stacked: [
      ["Semana habitual", "Lunch 11:30 a.m. – 3:00 p.m., Dinner 5:00 p.m. – 11:00 p.m."],
      ["Usar Summer", "Lunch 11:30 a.m. – 3:00 p.m."],
      ["Serie omitida: Cerrado · viernes · 2026-10-01 – 2026-12-31", "Reservable como siempre"],
      ["Cerrado: Lunch", "12:00 p.m. – 1:00 p.m."],
      ["Reservas cerradas: en línea", "Todo el día"],
      ["Esta noche", "Cierra a las 9:00 p.m."],
    ],
    edges: [
      ["Semana habitual", "Lunch 11:30 a.m. – 3:00 p.m., Dinner 5:00 p.m. – 11:00 p.m."],
      ["Reservas cerradas: en línea, por teléfono y lista de espera", "Todo el día"],
      ["Esta noche", "Ritmo de 1 cubierto"],
    ],
    bareClosed: [
      ["Semana habitual", "Cerrado"],
      ["Horario especial", "Lunch 11:30 a.m. – 3:00 p.m., Dinner 5:00 p.m. – 10:00 p.m."],
      ["Cerrado", "Todo el día"],
      ["Esta noche", "Detenido 9:00 p.m. – 9:30 p.m."],
      ["Esta noche", "Ritmo de 6 cubiertos"],
    ],
  },
];

describe("AvailabilityDayDrawer layers in en-US", () => {
  it("read exactly as the engine words them", async () => {
    await localeRuntime.i18n.changeLanguage("en-US");
    const day = STACKED();
    expect(rowsOf(day)).toEqual(day.explanation.map((l) => [l.label, l.effect]));
  });

  it.each([
    ["special hours, a venue closure, a stop and pacing", BARE],
    ["three channels and a single cover", EDGES],
  ])("read exactly as the engine words %s", async (_name, make) => {
    await localeRuntime.i18n.changeLanguage("en-US");
    const day = make();
    expect(rowsOf(day)).toEqual(day.explanation.map((l) => [l.label, l.effect]));
  });
});

describe("AvailabilityDayDrawer layers read in the viewer's language", () => {
  for (const c of CASES) {
    it(`renders every layer title and effect in ${c.tag}`, async () => {
      await useLocale(c.tag, c.catalog);
      expect(rowsOf(STACKED())).toEqual(c.stacked);
    });

    it(`renders special hours, a venue closure and Tonight in ${c.tag}`, async () => {
      await useLocale(c.tag, c.catalog);
      const rows = rowsOf(BARE());
      expect(rows).toEqual(c.bareClosed);
    });

    it(`renders three channels and a single cover in ${c.tag}`, async () => {
      await useLocale(c.tag, c.catalog);
      expect(rowsOf(EDGES())).toEqual(c.edges);
    });
  }
});

// One rule for a time past midnight: "(next day)" after the clock, here as on the calendar, and
// "a la" for one o'clock in Spanish (#8105).
const close = (closeAt: number): DateRule =>
  ({
    ...TONIGHT_CLOSE,
    id: `r-close-${closeAt}`,
    payload: { version: 1, closeAt },
  }) as DateRule;
const effectOf = (closeAt: number) =>
  rowsOf(dayOf(withSchedules(fixtureConfig(close(closeAt)), "Regular week"))).at(-1)?.[1];

describe("AvailabilityDayDrawer past-midnight times", () => {
  it.each([
    ["en-US", undefined, "Closes at 1:00 AM (next day)", "Closes at 11:00 PM"],
    ["es-MX", esMX, "Cierra a la 1:00 a.m. (día siguiente)", "Cierra a las 11:00 p.m."],
    ["fr-CA", frCA, "Ferme à 1 h 00 (lendemain)", "Ferme à 23 h 00"],
  ] as const)(
    "keeps the next-day suffix and the article in %s",
    async (tag, catalog, late, early) => {
      if (catalog) await useLocale(tag as "es-MX" | "fr-CA", catalog);
      else await localeRuntime.i18n.changeLanguage("en-US");
      expect(effectOf(1500)).toBe(late);
      expect(effectOf(1380)).toBe(early);
    }
  );
});
