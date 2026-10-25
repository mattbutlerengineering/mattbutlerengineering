import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { RialtoLocaleProvider } from "../../i18n/RialtoLocaleProvider";
import { esMX } from "../../i18n/locales/es-MX";
import { ReservationList, type ReservationListRow } from "./ReservationList";

const rows: ReservationListRow[] = [
  { time: "6:00 PM", guest: "Lee Family", partySize: 2, status: "CONFIRMED" },
  { time: "7:30 PM", guest: "Maria Garcia", partySize: 4, status: "pending" },
  { time: "8:15 PM", partySize: 3, status: "No show" },
];

describe("ReservationList", () => {
  it("is a list named by the locale message, one item per row", () => {
    render(<ReservationList reservations={rows} />);
    const list = screen.getByRole("list", { name: "Reservations" });
    expect(list.tagName).toBe("UL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders each row's time, guest, party size and status word", () => {
    render(<ReservationList reservations={rows} />);
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("6:00 PM");
    expect(first).toHaveTextContent("Lee Family");
    expect(first).toHaveTextContent("Party of 2");
    expect(first).toHaveTextContent("Confirmed");
    expect(second).toHaveTextContent("Pending");
  });

  it("names a row with no guest Walk-in, and a blank guest too", () => {
    render(
      <ReservationList
        reservations={[...rows, { time: "9:00 PM", guest: "  ", partySize: 2, status: "SEATED" }]}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveTextContent("Walk-in");
    expect(items[3]).toHaveTextContent("Walk-in");
  });

  it("shows the status word in its Badge tone", () => {
    render(<ReservationList reservations={rows} />);
    expect(screen.getByText("Confirmed").className).toMatch(/success/);
    expect(screen.getByText("Pending").className).toMatch(/warning/);
    expect(screen.getByText("No Show").className).toMatch(/error/);
  });

  it("shows an unknown status verbatim in neutral", () => {
    render(
      <ReservationList
        reservations={[{ time: "6:00 PM", guest: "Ana", partySize: 2, status: "Running late" }]}
      />
    );
    expect(screen.getByText("Running late").className).toMatch(/neutral/);
  });

  it("uses the active locale's words", () => {
    render(
      <RialtoLocaleProvider locale="es-MX" messages={esMX}>
        <ReservationList reservations={[{ time: "19:30", partySize: 4, status: "CONFIRMED" }]} />
      </RialtoLocaleProvider>
    );
    const list = screen.getByRole("list", { name: esMX.reservations });
    expect(list).toHaveTextContent(esMX.walkIn);
    expect(list).toHaveTextContent(esMX.partyOf(4));
    expect(list).toHaveTextContent(esMX.reservationStatus.confirmed);
  });

  it("shows a 24-hour HH:mm time in the locale's clock", () => {
    const { rerender } = render(
      <ReservationList reservations={[{ time: "20:30", partySize: 2, status: "CONFIRMED" }]} />
    );
    expect(screen.getByText(/^8:30\sPM$/)).toBeInTheDocument();
    rerender(
      <RialtoLocaleProvider locale="fr-CA">
        <ReservationList reservations={[{ time: "20:30", partySize: 2, status: "CONFIRMED" }]} />
      </RialtoLocaleProvider>
    );
    expect(screen.getByText(/^20\sh\s30$/)).toBeInTheDocument();
  });

  it("has nothing focusable", () => {
    const { container } = render(<ReservationList reservations={rows} />);
    expect(container.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });

  it("has no axe violations", async () => {
    const { container } = render(<ReservationList reservations={rows} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
