import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingWidget } from "./BookingWidget.js";
import { WidgetLocaleScope } from "./WidgetLocaleScope.js";

vi.mock("../../hooks/usePublicApiClient.js", () => ({ usePublicApiClient: () => ({}) }));
vi.mock("./useBookingFlow.js", () => ({
  useBookingFlow: () => ({
    state: "date-party",
    data: { venueConfig: null, partySize: 2, selectedDate: null, selectedEndDate: null },
    actions: {},
    stepKeys: ["date-party", "time-slot", "guest-details"],
    currentStepIndex: 0,
  }),
}));
vi.mock("./DatePartySelector", () => ({ DatePartySelector: () => <div /> }));

describe("BookingWidget header locale picker", () => {
  it("shows a compact picker inside a widget locale scope", async () => {
    render(
      <WidgetLocaleScope>
        <BookingWidget venueId="v1" venueSlug="v" />
      </WidgetLocaleScope>
    );
    expect(await screen.findByRole("button", { name: /Language/ })).toHaveTextContent("EN-US");
  });

  it("shows no picker outside a scope", () => {
    render(<BookingWidget venueId="v1" venueSlug="v" />);
    expect(screen.queryByRole("button", { name: /Language/ })).not.toBeInTheDocument();
  });
});
