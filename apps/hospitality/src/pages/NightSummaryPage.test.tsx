import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ getEndOfServiceSummary: vi.fn() }));

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => ({ reservations: api })),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(() => ({
    selectedVenueId: "v1",
    selectedVenue: { id: "v1", ianaTimezone: "America/Toronto", currencyCode: "CAD" },
  })),
}));
const lastDay = vi.hoisted(() => ({
  value: { date: "2026-11-20", status: "ready" } as { date: string | null; status: string },
}));
vi.mock("../hooks/useLastServiceDate.js", () => ({
  useLastServiceDate: vi.fn(() => lastDay.value),
}));

import { NightSummaryPage } from "./NightSummaryPage.js";

const summary = (over: Record<string, unknown> = {}) => ({
  date: "2026-11-20",
  venueId: "v1",
  covers: 84,
  tableTurns: 31,
  noShows: 2,
  turnedAway: null,
  ...over,
});

function renderPage(path = "/night") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NightSummaryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NightSummaryPage", () => {
  beforeEach(() => {
    api.getEndOfServiceSummary.mockReset();
    lastDay.value = { date: "2026-11-20", status: "ready" };
    api.getEndOfServiceSummary.mockResolvedValue(summary());
  });

  it("shows covers, table turns and no-shows for the service date", async () => {
    renderPage();

    const covers = await screen.findByRole("group", { name: "Covers served" });
    expect(covers).toHaveTextContent("84");
    expect(screen.getByRole("group", { name: "Table turns" })).toHaveTextContent("31");
    expect(screen.getByRole("group", { name: "No-shows" })).toHaveTextContent("2");
    expect(api.getEndOfServiceSummary).toHaveBeenCalledWith({
      venueId: "v1",
      date: "2026-11-20",
    });
  });

  it("shows no dead tile for turned away while it is null", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Covers served" });
    expect(screen.queryByRole("group", { name: "Turned away" })).not.toBeInTheDocument();
  });

  it("shows turned away once the server reports it", async () => {
    api.getEndOfServiceSummary.mockResolvedValue(summary({ turnedAway: 7 }));
    renderPage();
    expect(await screen.findByRole("group", { name: "Turned away" })).toHaveTextContent("7");
  });

  it("shows a quiet-night message when nothing happened", async () => {
    api.getEndOfServiceSummary.mockResolvedValue(summary({ covers: 0, tableTurns: 0, noShows: 0 }));
    renderPage();
    expect(await screen.findByText(/No seatings were completed/)).toBeInTheDocument();
  });

  it("shows a retryable error and recovers on retry", async () => {
    api.getEndOfServiceSummary.mockRejectedValueOnce(new Error("down"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the night");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("group", { name: "Covers served" })).toHaveTextContent("84");
  });

  it("refetches for the new date when the date changes", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Covers served" });

    api.getEndOfServiceSummary.mockResolvedValue(summary({ date: "2026-11-19", covers: 12 }));
    fireEvent.change(screen.getByLabelText("Service date"), { target: { value: "2026-11-19" } });

    await waitFor(() =>
      expect(api.getEndOfServiceSummary).toHaveBeenLastCalledWith({
        venueId: "v1",
        date: "2026-11-19",
      })
    );
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Covers served" })).toHaveTextContent("12")
    );
  });

  it("titles the figures with the service date", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /Nov 20/ })).toBeInTheDocument();
  });

  it("waits for the service day before fetching, showing the skeleton", () => {
    lastDay.value = { date: null, status: "loading" };
    renderPage();
    expect(
      screen.getByText("Loading the night in numbers…").closest("[aria-busy]")
    ).toHaveAttribute("aria-busy", "true");
    expect(api.getEndOfServiceSummary).not.toHaveBeenCalled();
  });

  it("falls back to the device date only once the config read has failed, and says so", async () => {
    lastDay.value = { date: null, status: "error" };
    renderPage();
    await screen.findByRole("group", { name: "Covers served" });
    expect(api.getEndOfServiceSummary).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/couldn't read your hours/i)).toBeInTheDocument();
  });

  it("steps to the previous night and back, and cannot go past the last service day", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Covers served" });
    expect(screen.getByRole("button", { name: "Next night" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous night" }));
    await waitFor(() =>
      expect(api.getEndOfServiceSummary).toHaveBeenLastCalledWith({
        venueId: "v1",
        date: "2026-11-19",
      })
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Next night" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Next night" }));
    await waitFor(() =>
      expect(api.getEndOfServiceSummary).toHaveBeenLastCalledWith({
        venueId: "v1",
        date: "2026-11-20",
      })
    );
  });

  it("announces the loaded date on every date change", async () => {
    renderPage();
    await screen.findByRole("group", { name: "Covers served" });
    api.getEndOfServiceSummary.mockResolvedValue(summary({ date: "2026-11-19" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous night" }));
    expect(await screen.findByText(/Nov 19.* loaded\./)).toBeInTheDocument();
  });

  it("reads the date from ?date= when present", async () => {
    renderPage("/night?date=2026-11-18");
    await screen.findByRole("group", { name: "Covers served" });
    expect(api.getEndOfServiceSummary).toHaveBeenCalledWith({ venueId: "v1", date: "2026-11-18" });
  });
});
