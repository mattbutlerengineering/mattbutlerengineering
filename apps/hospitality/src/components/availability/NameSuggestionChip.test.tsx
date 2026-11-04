import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { NameSuggestionChip } from "./NameSuggestionChip.js";

describe("NameSuggestionChip (ux.md F-UW, #7981)", () => {
  it("offers the season's name and fills it in on one tap", () => {
    const onUse = vi.fn();
    render(<NameSuggestionChip startsOn="2027-06-01" endsOn="2027-09-15" name="" onUse={onUse} />);
    fireEvent.click(screen.getByRole("button", { name: "Use “Summer hours”" }));
    expect(onUse).toHaveBeenCalledWith("Summer hours");
  });

  it("names a schedule with no end by its start date, in the venue's format", () => {
    render(<NameSuggestionChip startsOn="2027-06-01" endsOn={null} name="" onUse={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Use “Hours from Jun 1”" })).toBeInTheDocument();
  });

  it("names a long period by both dates", () => {
    render(
      <NameSuggestionChip startsOn="2027-01-01" endsOn="2027-12-31" name="" onUse={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Use “Hours Jan 1 – Dec 31”" })).toBeInTheDocument();
  });

  it("stays out of the way once the Manager has typed a name, or before a start date", () => {
    const { rerender } = render(
      <NameSuggestionChip startsOn="2027-06-01" endsOn={null} name="Patio" onUse={vi.fn()} />
    );
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<NameSuggestionChip startsOn={null} endsOn={null} name="" onUse={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
