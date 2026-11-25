import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LostDemand, LostDemandWhatIf } from "@mbe/types";
import { AddSeatingWhatIf } from "./AddSeatingWhatIf.js";
import { useLostDemandWhatIf } from "../../hooks/useLostDemandWhatIf.js";

vi.mock("../../hooks/useLostDemandWhatIf.js", () => ({ useLostDemandWhatIf: vi.fn() }));

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

const answer: LostDemandWhatIf = {
  venueId: "v1",
  from: "2026-11-01",
  to: "2026-11-28",
  weekday: 5,
  minute: 21 * 60,
  outcome: "estimated",
  searches: 8,
  windowStart: 20 * 60 + 30,
  windowEnd: 21 * 60 + 30,
  minParty: null,
  maxParty: null,
  anyTimeSearches: 0,
  nights: 4,
  perNight: 2,
};

function respond(over: Partial<LostDemandWhatIf>) {
  vi.mocked(useLostDemandWhatIf).mockReturnValue({
    data: { ...answer, ...over },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe("AddSeatingWhatIf", () => {
  beforeEach(() => {
    vi.mocked(useLostDemandWhatIf).mockReset();
    respond({});
  });

  it("asks the server about the busiest slot at once, labelled as an estimate", () => {
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    expect(useLostDemandWhatIf).toHaveBeenCalledWith({
      venueId: "v1",
      weekday: 5,
      time: "21:00",
    });
    expect(screen.getByRole("combobox", { name: /day/i })).toHaveTextContent(/friday/i);
    expect(screen.getByText(/^Estimate: about 8 searches/)).toBeInTheDocument();
    expect(screen.getByText(/not a forecast/i)).toBeInTheDocument();
  });

  it("asks again when the day changes", async () => {
    // jsdom has no layout; the listbox scrolls the active option into view.
    Element.prototype.scrollIntoView = () => undefined;
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    await userEvent.click(screen.getByRole("combobox", { name: /day/i }));
    await userEvent.click(await screen.findByRole("option", { name: /saturday/i }));

    expect(useLostDemandWhatIf).toHaveBeenLastCalledWith({
      venueId: "v1",
      weekday: 6,
      time: "21:00",
    });
  });

  it("says nothing was caught, without a number, when the estimate is zero", () => {
    respond({ searches: 0, perNight: 0 });
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByText(/no turned-away searches/i)).toBeInTheDocument();
  });

  it("shows whole-day misses apart from the estimate", () => {
    respond({ anyTimeSearches: 5 });
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByText(/5 more searches on a Friday named no time/)).toBeInTheDocument();
  });

  it.each([
    ["closed", /no service on Friday/],
    ["already_offered", /already bookable on a Friday/],
    ["blocked", /run into another service or break a rule/],
  ] as const)("shows a plain sentence and no number when %s", (outcome, sentence) => {
    respond({ outcome, searches: 0, anyTimeSearches: 4 });
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText(/^Estimate:/)).toBeNull();
    expect(screen.queryByText(/named no time/)).toBeNull();
  });

  it("shows a skeleton while the answer loads", () => {
    vi.mocked(useLostDemandWhatIf).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.queryByText(/^Estimate:/)).toBeNull();
    expect(screen.getByRole("combobox", { name: /day/i })).toBeInTheDocument();
  });

  it("offers a retry when the estimate fails", async () => {
    const refetch = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(useLostDemandWhatIf).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });
    render(<AddSeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByText(/couldn't estimate this seating/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders nothing, and asks nothing, without timed demand or a venue", () => {
    const first = render(<AddSeatingWhatIf venueId="v1" demand={{ ...demand, cells: [] }} />);
    expect(first.container).toBeEmptyDOMElement();
    const second = render(<AddSeatingWhatIf venueId="v1" demand={undefined} />);
    expect(second.container).toBeEmptyDOMElement();
    const third = render(<AddSeatingWhatIf venueId={null} demand={demand} />);
    expect(third.container).toBeEmptyDOMElement();
    expect(useLostDemandWhatIf).not.toHaveBeenCalled();
  });
});
