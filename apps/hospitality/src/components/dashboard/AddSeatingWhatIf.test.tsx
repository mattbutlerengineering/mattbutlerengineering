import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LostDemand } from "@mbe/types";
import { AddSeatingWhatIf } from "./AddSeatingWhatIf.js";

// 2026-11-01 is a Sunday: the window holds four Fridays and four Saturdays.
const demand: LostDemand = {
  venueId: "v1",
  from: "2026-11-01",
  to: "2026-11-28",
  total: 15,
  cells: [
    { weekday: 5, hour: 21, searches: 8 },
    { weekday: 6, hour: 20, searches: 4 },
  ],
  anyTime: [{ weekday: 0, searches: 3 }],
};

describe("AddSeatingWhatIf", () => {
  it("answers at once for the busiest turned-away slot, labelled as an estimate", () => {
    render(<AddSeatingWhatIf demand={demand} />);

    expect(screen.getByRole("combobox", { name: /day/i })).toHaveTextContent(/friday/i);
    expect(screen.getByText(/^Estimate: about 8 of the searches/)).toBeInTheDocument();
    expect(screen.getByText(/not a forecast/i)).toBeInTheDocument();
  });

  it("re-answers when the day changes", async () => {
    // jsdom has no layout; the listbox scrolls the active option into view.
    Element.prototype.scrollIntoView = () => undefined;
    render(<AddSeatingWhatIf demand={demand} />);

    await userEvent.click(screen.getByRole("combobox", { name: /day/i }));
    await userEvent.click(await screen.findByRole("option", { name: /saturday/i }));

    expect(screen.getByText(/no turned-away searches/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no timed demand to preview against", () => {
    const { container } = render(<AddSeatingWhatIf demand={{ ...demand, cells: [] }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the read resolves", () => {
    const { container } = render(<AddSeatingWhatIf demand={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });
});
