import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { localeRuntime } from "./runtime.js";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { CurtainCall } from "../components/rehearsal/CurtainCall.js";
import { RehearsalBanner } from "../components/rehearsal/RehearsalBanner.js";
import {
  describeEvent,
  partyLabel,
  rightNowSentence,
} from "../components/rehearsal/rehearsal-copy.js";
import { foldEvents } from "../components/rehearsal/rehearsal-state.js";
import type { RehearsalEvent } from "../components/rehearsal/simulate-service.js";

// SC-10: the rehearsal's strings exist, whole and plural-correct, in the locales the app ships.

type Catalog = Record<string, unknown>;

function flatten(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") {
    out.set(prefix, node);
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Catalog)) {
      for (const [path, leaf] of flatten(value, prefix ? `${prefix}.${key}` : key)) {
        out.set(path, leaf);
      }
    }
  }
  return out;
}

/** Every key this feature added, in any catalog section. */
function rehearsalKeys(catalog: Catalog): Map<string, string> {
  const all = flatten(catalog);
  return new Map(
    [...all].filter(
      ([key]) =>
        key.startsWith("rehearsal.") ||
        key.startsWith("settings.rehearsal.") ||
        key === "timeline.emptyNight.rehearse" ||
        key === "layout.routes.rehearsal"
    )
  );
}

/**
 * Keys whose text is the same in every shipped language, so equal-to-English is not a missing
 * translation: numerals with an "x", pure placeholder templates, and the "min" / "h" unit marks.
 */
const LANGUAGE_NEUTRAL = new Set([
  "rehearsal.transport.speed15",
  "rehearsal.transport.speed60",
  "rehearsal.transport.speed240",
  "rehearsal.live.moment",
  "rehearsal.live.step",
  "rehearsal.curtain.durationMinutes",
  "rehearsal.curtain.durationHours",
  "rehearsal.curtain.durationHoursMinutes",
]);

/** Words that happen to be spelled the same in English and the target language. */
const SAME_WORD: Readonly<Record<string, ReadonlySet<string>>> = {
  "fr-CA": new Set(["rehearsal.transport.pause"]),
  "es-MX": new Set(),
};

async function switchLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("rehearsal catalogs", () => {
  const source = rehearsalKeys(enUS);

  it("the feature added strings at all", () => {
    expect(source.size).toBeGreaterThan(80);
  });

  it.each([
    ["fr-CA", frCA],
    ["es-MX", esMX],
  ] as const)("%s translates every rehearsal key, leaving none in English", (tag, catalog) => {
    const translated = rehearsalKeys(catalog);
    const untranslated: string[] = [];
    const missing: string[] = [];
    for (const [key, english] of source) {
      const value = translated.get(key);
      if (value === undefined) {
        // fr/es add a `_many` form; the shared `_one`/`_other` keys must still be present.
        missing.push(key);
      } else if (value === english && !LANGUAGE_NEUTRAL.has(key) && !SAME_WORD[tag]?.has(key)) {
        untranslated.push(key);
      }
    }
    expect(missing).toEqual([]);
    expect(untranslated).toEqual([]);
  });

  it("fr-CA and es-MX carry the `_many` plural form for every plural unit", () => {
    for (const catalog of [frCA, esMX]) {
      const keys = [...rehearsalKeys(catalog).keys()];
      const units = keys.filter((k) => k.endsWith("_one")).map((k) => k.slice(0, -4));
      expect(units.length).toBeGreaterThan(0);
      for (const unit of units) {
        expect(keys, unit).toContain(`${unit}_many`);
        expect(keys, unit).toContain(`${unit}_other`);
      }
    }
  });
});

const EVENTS: readonly RehearsalEvent[] = [
  { at: 1020, kind: "booked", partyId: "p1", size: 2, tableId: "a", startAt: 1080, endAt: 1140 },
  { at: 1080, kind: "seated", partyId: "p1", tableId: "a", size: 2, endAt: 1140 },
  { at: 1090, kind: "walk-in-waiting", partyId: "p2", size: 4 },
  { at: 1100, kind: "walk-in-waiting", partyId: "p3", size: 3 },
];
const tableName = (id: string) => `Table ${id}`;
const partySize = () => 2;

describe("fr-CA", () => {
  beforeAll(() => switchLocale("fr-CA", frCA));
  const t = localeRuntime.i18n.t.bind(localeRuntime.i18n);

  it("writes the banner and its tag in French", () => {
    render(<RehearsalBanner onLeave={vi.fn()} />);
    const banner = screen.getByRole("note", { name: "Avis de répétition" });
    expect(banner).toHaveTextContent(
      "Répétition, pas de vraies réservations. Rien n'est enregistré."
    );
    expect(
      within(banner).getByRole("button", { name: "Quitter la répétition" })
    ).toBeInTheDocument();
  });

  it("pluralises each Right now sentence on its own count, French style (0 and 1 are singular)", () => {
    const at = (count: number) => {
      const events = EVENTS.slice(0, count);
      return rightNowSentence(t, foldEvents(events, events.length));
    };
    // Nothing seated, nothing waiting: French counts 0 as singular.
    expect(at(0)).toBe("0 table occupée. 0 groupe en attente.");
    // One seated, none waiting.
    expect(at(2)).toBe("1 table occupée. 0 groupe en attente.");
    // One seated, two waiting.
    expect(at(4)).toBe("1 table occupée. 2 groupes en attente.");
  });

  it("describes events as whole French sentences with a localized party noun", () => {
    expect(partyLabel(t, 4)).toBe("Groupe de 4");
    expect(describeEvent(t, EVENTS[1] as RehearsalEvent, tableName, partySize)).toBe(
      "Groupe de 2 installé à Table a."
    );
  });

  it("formats the curtain call durations, peak hour and list in French", () => {
    render(
      <MemoryRouter>
        <CurtainCall
          profile="friday"
          metrics={{
            coversServed: 148,
            avgTurnMinutes: 72,
            peakHour: 19,
            tablesNeverSat: ["T9", "T14"],
            longestWalkInWaitMinutes: 18,
          }}
          tableName={(id) => id}
          formatMinute={(m) => `${Math.floor(m / 60)} h`}
          locale="fr-CA"
          onRunAgain={vi.fn()}
          onTryOther={vi.fn()}
          onLeave={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    const dialog = screen.getByRole("dialog", { name: "Votre vendredi soir" });
    const row = (label: string) => within(dialog).getByText(label).closest("div") as HTMLElement;
    expect(row("Durée moyenne d'occupation")).toHaveTextContent("1 h 12 min");
    expect(row("Heure de pointe")).toHaveTextContent("19 h à 20 h");
    expect(row("Tables jamais occupées")).toHaveTextContent("T9 et T14");
    expect(
      within(dialog).getByRole("button", { name: "Essayer une soirée en semaine" })
    ).toBeInTheDocument();
  });
});

describe("es-MX", () => {
  beforeAll(() => switchLocale("es-MX", esMX));
  const t = localeRuntime.i18n.t.bind(localeRuntime.i18n);

  it("pluralises Right now in Spanish", () => {
    const state = foldEvents(EVENTS, EVENTS.length);
    expect(rightNowSentence(t, state)).toBe("1 mesa ocupada. 2 grupos en espera.");
  });

  it("writes the curtain call title in Spanish", () => {
    render(
      <MemoryRouter>
        <CurtainCall
          profile="weeknight"
          metrics={{
            coversServed: 0,
            avgTurnMinutes: null,
            peakHour: null,
            tablesNeverSat: [],
            longestWalkInWaitMinutes: null,
          }}
          tableName={(id) => id}
          formatMinute={String}
          locale="es-MX"
          onRunAgain={vi.fn()}
          onTryOther={vi.fn()}
          onLeave={vi.fn()}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("dialog", { name: "Tu noche entre semana" })).toBeInTheDocument();
    expect(screen.getByText(/No hay suficientes mesas para sentar a nadie\./)).toBeInTheDocument();
  });
});
