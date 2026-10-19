import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RialtoLocaleProvider } from "../i18n/RialtoLocaleProvider";
import { esMX } from "../i18n/locales/es-MX";
import { frCA } from "../i18n/locales/fr-CA";
import type { RialtoMessages } from "../i18n/messages";
import { TapeChart } from "./TapeChart/TapeChart";
import { TapeChartMobileStack } from "./TapeChart/TapeChartMobileStack";
import { mergeStrings } from "./TapeChart/defaultStrings";
import type { TapeChartReservation, TapeChartRoom } from "./TapeChart/types";
import { useTapeChartI18n } from "./TapeChart/useTapeChartI18n";

const noop = () => {};
const ROOMS: TapeChartRoom[] = [
  { id: "r1", name: "101" },
  { id: "r2", name: "102" },
];

function reservation(id: string, roomId: string): TapeChartReservation {
  return { id, roomId, start: "2026-04-21", end: "2026-04-23", status: "confirmed" };
}

const ONE = [reservation("a", "r1")];
const TWO = [reservation("a", "r1"), reservation("b", "r2")];

function MobileStack({ reservations }: { reservations: TapeChartReservation[] }) {
  const formatters = useTapeChartI18n("en-US", "UTC");
  return (
    <TapeChartMobileStack
      reservations={reservations}
      rooms={ROOMS}
      startDate="2026-04-20"
      endDate="2026-04-24"
      todayISO="2026-04-20"
      formatters={formatters}
      strings={mergeStrings()}
      selectedReservationId={null}
      onReservationSelect={noop}
    />
  );
}

const LOCALES: readonly (readonly [string, RialtoMessages, string, string])[] = [
  ["es-MX", esMX, "Reservación", "Reservaciones"],
  ["fr-CA", frCA, "Réservation", "Réservations"],
];

describe("TapeChart reservation counts follow the locale", () => {
  it.each(LOCALES)("%s stat pill", (_tag, messages, one, many) => {
    const { rerender } = render(
      <RialtoLocaleProvider messages={messages}>
        <TapeChart reservations={ONE} rooms={ROOMS} startDate="2026-04-20" endDate="2026-04-27" />
      </RialtoLocaleProvider>
    );
    expect(screen.getByText(one, { selector: "span" })).toBeInTheDocument();
    rerender(
      <RialtoLocaleProvider messages={messages}>
        <TapeChart reservations={TWO} rooms={ROOMS} startDate="2026-04-20" endDate="2026-04-27" />
      </RialtoLocaleProvider>
    );
    expect(screen.getByText(many, { selector: "span" })).toBeInTheDocument();
  });

  it.each(LOCALES)("%s mobile day-card meta", (_tag, messages, one, many) => {
    const { rerender } = render(
      <RialtoLocaleProvider messages={messages}>
        <MobileStack reservations={ONE} />
      </RialtoLocaleProvider>
    );
    expect(screen.getAllByText(`1 ${one.toLowerCase()}`).length).toBeGreaterThan(0);
    rerender(
      <RialtoLocaleProvider messages={messages}>
        <MobileStack reservations={TWO} />
      </RialtoLocaleProvider>
    );
    expect(screen.getAllByText(`2 ${many.toLowerCase()}`).length).toBeGreaterThan(0);
  });

  it("keeps the en-US wording and casing with no provider", () => {
    render(<MobileStack reservations={TWO} />);
    expect(screen.getAllByText("2 reservations").length).toBeGreaterThan(0);
  });
});
