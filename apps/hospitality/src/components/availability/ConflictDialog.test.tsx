import { afterAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { localeRuntime } from "../../i18n/runtime.js";
import esMX from "../../i18n/catalogs/es-MX.json";
import frCA from "../../i18n/catalogs/fr-CA.json";
import { ConflictDialog } from "./ConflictDialog.js";

/** `useVenueFormat` reads this context, so times are on the venue clock in any test zone. */
const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;

// 09:15Z is 1:15 AM in Los Angeles (PST) and 9:15 AM in UTC: the venue's clock decides.
const AT_ONE_FIFTEEN = "2026-12-01T09:15:00.000Z";
// 22:00Z is 2:00 PM in Los Angeles.
const AT_TWO = "2026-12-01T22:00:00.000Z";

const change = (
  id: string,
  at: string,
  detail: AvailabilityChangeSummary["detail"]
): AvailabilityChangeSummary => ({
  id,
  actorId: "auth0|ana",
  at,
  kind: "config",
  summary: "Availability updated: 1 added, 0 changed, 0 removed",
  detail,
});

const SAVED = { code: "config_saved", added: 1, changed: 0, removed: 0 };

function renderDialog(
  winningChange: AvailabilityChangeSummary | null,
  changes?: AvailabilityChangeSummary[]
) {
  return render(
    <VenueContext.Provider value={VENUE}>
      <ConflictDialog
        open
        winningChange={winningChange}
        {...(changes ? { changesSince: { total: changes.length, changes } } : {})}
        services={[]}
        isSaving={false}
        ready
        changedAgain={false}
        onOverwrite={vi.fn()}
        onDiscard={vi.fn()}
        onBack={vi.fn()}
      />
    </VenueContext.Provider>
  );
}

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("ConflictDialog wording of the other change", () => {
  it("shows the English summary of a row with no code, beside the venue-clock time", async () => {
    await localeRuntime.i18n.changeLanguage("en-US");
    renderDialog({ ...change("a", AT_ONE_FIFTEEN, undefined), detail: undefined });
    expect(
      screen.getByText("Availability updated: 1 added, 0 changed, 0 removed (saved at 1:15 AM).")
    ).toBeTruthy();
  });

  it("words the code in es-MX, with 'a la' for one o'clock on the venue's clock", async () => {
    await useLocale("es-MX", esMX);
    renderDialog(change("a", AT_ONE_FIFTEEN, SAVED));
    expect(
      screen.getByText(
        "Disponibilidad actualizada · Agregados: 1 · Cambiados: 0 · Quitados: 0 (guardado a la 1:15 a.m.)."
      )
    ).toBeTruthy();
  });

  it("uses 'a las' for every other hour", async () => {
    await useLocale("es-MX", esMX);
    renderDialog(change("a", AT_TWO, SAVED));
    expect(screen.getByText(/\(guardado a las 2:00 p\.m\.\)\.$/)).toBeTruthy();
  });

  it("words every change in the list with one mapping, and the Review column too", async () => {
    await useLocale("fr-CA", frCA);
    const first = change("a", AT_TWO, { code: "tonight_ended" });
    const second = change("b", AT_ONE_FIFTEEN, SAVED);
    renderDialog(first, [first, second]);
    expect(screen.getByText(/^Le changement de ce soir est terminé \(enregistré à/)).toBeTruthy();
    expect(screen.getByText(/^Disponibilités mises à jour : ajouts 1/)).toBeTruthy();
    expect(screen.queryByText(/Tonight change ended/)).toBeNull();
  });
});
