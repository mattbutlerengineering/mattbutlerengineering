import { afterAll, describe, expect, it } from "vitest";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { localeRuntime } from "../../i18n/runtime.js";
import esMX from "../../i18n/catalogs/es-MX.json";
import frCA from "../../i18n/catalogs/fr-CA.json";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { formatCalendarDate } from "../../utils/format.js";
import { changeSummaryText } from "./change-summary-text.js";

// Calendar dates are never zone-shifted, so none of this depends on the machine's zone.

const BASE = {
  id: "chg-1",
  actorId: "auth0|ana",
  at: "2026-10-25T18:00:00.000Z",
  kind: "config",
};

const change = (
  summary: string,
  detail?: AvailabilityChangeSummary["detail"]
): AvailabilityChangeSummary => ({ ...BASE, summary, ...(detail === undefined ? {} : { detail }) });

async function textOf(tag: "en-US" | "es-MX" | "fr-CA", c: AvailabilityChangeSummary) {
  if (tag === "es-MX") localeRuntime.i18n.addResourceBundle(tag, "translation", esMX, true, true);
  if (tag === "fr-CA") localeRuntime.i18n.addResourceBundle(tag, "translation", frCA, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
  const format = {
    locale: tag,
    formatCalendarDate: (d: string, o: Intl.DateTimeFormatOptions) => formatCalendarDate(d, o, tag),
  } as unknown as VenueFormat;
  return changeSummaryText(c, format, localeRuntime.i18n.t);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

const CLOSURE = {
  code: "closure_saved",
  startsOn: "2026-12-24",
  endsOn: "2026-12-26",
  cancelled: 2,
  moved: 1,
  kept: 3,
};

describe("changeSummaryText from a code", () => {
  it("words a config save from its counts in each language", async () => {
    const c = change("Availability updated: 1 added, 0 changed, 2 removed", {
      code: "config_saved",
      added: 1,
      changed: 0,
      removed: 2,
    });
    expect(await textOf("en-US", c)).toBe("Availability updated: 1 added, 0 changed, 2 removed");
    expect(await textOf("es-MX", c)).toBe(
      "Disponibilidad actualizada · Agregados: 1 · Cambiados: 0 · Quitados: 2"
    );
    expect(await textOf("fr-CA", c)).toBe(
      "Disponibilités mises à jour : ajouts 1, modifications 0, retraits 2"
    );
  });

  it("words a closure with its dates and what became of the bookings", async () => {
    const c = change(
      "Closure saved for 2026-12-24 to 2026-12-26: 2 cancelled, 1 moved, 3 kept",
      CLOSURE
    );
    expect(await textOf("en-US", c)).toBe(
      "Closed Thu, Dec 24 to Sat, Dec 26: 2 bookings cancelled, 1 booking moved, and 3 bookings kept"
    );
    const es = await textOf("es-MX", c);
    expect(es).toMatch(/^Cerrado del jue/);
    expect(es).not.toContain("Closure");
    expect(await textOf("fr-CA", c)).toMatch(/^Fermé du jeu/);
  });

  it("words a close-early and a reopening through the history entry keys", async () => {
    const early = change("Closing early 2026-12-24: 0 cancelled, 0 moved, 0 kept", {
      ...CLOSURE,
      code: "close_early_saved",
      endsOn: "2026-12-24",
      cancelled: 0,
      moved: 0,
      kept: 0,
    });
    expect(await textOf("en-US", early)).toBe("Closed early Thu, Dec 24: no bookings affected");
    expect(await textOf("es-MX", early)).toMatch(/^Cierre anticipado jue/);
    const reopened = change("Closure reopened (2026-12-24)", {
      code: "closure_reopened",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    });
    // A one-day rule is not open-ended, here and in a revert of it.
    expect(await textOf("en-US", reopened)).toBe("Reopened Thu, Dec 24");
    expect(await textOf("es-MX", reopened)).toMatch(/^Reabierto jue 24 de dic$/);
    expect(await textOf("fr-CA", reopened)).toMatch(/^Rouvert jeu\. 24 déc\.$/);
    expect(
      await textOf("en-US", { ...reopened, detail: { ...reopened.detail!, reverted: true } })
    ).toBe("Reverted: Reopened Thu, Dec 24");
    const open = change("Closure reopened (2026-12-24)", {
      code: "closure_reopened",
      startsOn: "2026-12-24",
      endsOn: null,
    });
    expect(await textOf("en-US", open)).toBe("Reopened from Thu, Dec 24 onward");
  });

  it("words each Tonight change, with plurals where it counts", async () => {
    const tonight = (detail: AvailabilityChangeSummary["detail"]) => change("Tonight: …", detail);
    expect(await textOf("es-MX", tonight({ code: "tonight_pause_online" }))).toBe(
      "Esta noche: reservas en línea en pausa"
    );
    expect(await textOf("en-US", tonight({ code: "tonight_block_tables", tables: 1 }))).toBe(
      "Tonight: 1 table blocked"
    );
    expect(await textOf("es-MX", tonight({ code: "tonight_block_tables", tables: 3 }))).toBe(
      "Esta noche: 3 mesas bloqueadas"
    );
    expect(await textOf("fr-CA", tonight({ code: "tonight_pacing", covers: 1 }))).toBe(
      "Ce soir : cadence réduite à 1 couvert"
    );
    expect(await textOf("es-MX", tonight({ code: "tonight_ended" }))).toBe(
      "Se terminó el cambio de esta noche"
    );
  });

  it("marks a revert, wording the change it undid", async () => {
    const c = change("Reverted: Tonight change ended", { code: "tonight_ended", reverted: true });
    expect(await textOf("en-US", c)).toBe("Reverted: Tonight change ended");
    expect(await textOf("es-MX", c)).toBe("Revertido: Se terminó el cambio de esta noche");
  });
});

describe("changeSummaryText falls back to the stored English summary", () => {
  it("for a row with no detail, or a null one", async () => {
    expect(await textOf("es-MX", change("Availability updated: 0 added"))).toBe(
      "Availability updated: 0 added"
    );
    expect(await textOf("es-MX", change("Old row", null))).toBe("Old row");
  });

  it("for a code from a newer server", async () => {
    expect(await textOf("fr-CA", change("Something new", { code: "from_the_future" }))).toBe(
      "Something new"
    );
  });

  it("for an unknown code, even one that carries closure fields", async () => {
    expect(
      await textOf("es-MX", change("Something new", { ...CLOSURE, code: "from_the_future" }))
    ).toBe("Something new");
  });

  it("for a known code missing the data its sentence needs", async () => {
    expect(await textOf("es-MX", change("Closure saved", { code: "closure_saved" }))).toBe(
      "Closure saved"
    );
    expect(await textOf("es-MX", change("Tonight: pacing", { code: "tonight_pacing" }))).toBe(
      "Tonight: pacing"
    );
  });
});
