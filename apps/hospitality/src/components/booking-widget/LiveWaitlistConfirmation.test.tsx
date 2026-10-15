/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LiveWaitlistConfirmation, WAITLIST_ESTIMATE_POLL_MS } from "./LiveWaitlistConfirmation.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Text: ({ children, className }: any) => <span className={className}>{children}</span>,
  Heading: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
}));

const waitlistEstimate = vi.fn();
const api = { publicVenue: { waitlistEstimate } } as any;

function renderLive() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveWaitlistConfirmation
        api={api}
        venueSlug="the-oak-table"
        joined={{ statusToken: "tok-1", position: 3, estimatedWaitMinutes: 45 }}
        onNewBooking={vi.fn()}
      />
    </QueryClientProvider>
  );
}

async function advancePoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(WAITLIST_ESTIMATE_POLL_MS + 10);
  });
}

describe("LiveWaitlistConfirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    waitlistEstimate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the join-time snapshot first, then the server's live value on the next poll", async () => {
    waitlistEstimate.mockResolvedValue({
      position: 1,
      estimatedWaitMinutes: 12,
      status: "waiting",
    });
    renderLive();

    expect(screen.getByText("#3")).toBeDefined();
    expect(screen.getByText("45 min")).toBeDefined();

    await advancePoll();

    expect(waitlistEstimate).toHaveBeenCalledWith("the-oak-table", "tok-1");
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("12 min")).toBeDefined();
  });

  it("keeps showing the last known value when a poll fails", async () => {
    waitlistEstimate.mockRejectedValue(new Error("network"));
    renderLive();

    await advancePoll();

    expect(screen.getByText("#3")).toBeDefined();
    expect(screen.getByText("45 min")).toBeDefined();
  });

  it("tells a notified guest their table is ready and keeps polling for the outcome", async () => {
    waitlistEstimate.mockResolvedValueOnce({
      position: 1,
      estimatedWaitMinutes: 0,
      status: "notified",
    });
    waitlistEstimate.mockResolvedValue({
      position: 1,
      estimatedWaitMinutes: 0,
      status: "seated",
    });
    renderLive();

    await advancePoll();
    expect(screen.getByText(/your table is ready/i)).toBeDefined();
    expect(screen.queryByText("Estimated wait")).toBeNull();

    await advancePoll();
    expect(waitlistEstimate).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/seated/i)).toBeDefined();
  });

  it.each([
    ["seated", /seated/i],
    ["expired", /expired/i],
    ["cancelled", /cancelled/i],
  ])("shows a terminal message for %s and stops polling", async (status, message) => {
    waitlistEstimate.mockResolvedValue({ position: 1, estimatedWaitMinutes: 0, status });
    renderLive();

    await advancePoll();

    expect(screen.getByText(message)).toBeDefined();
    expect(screen.queryByText("Estimated wait")).toBeNull();

    const calls = waitlistEstimate.mock.calls.length;
    await advancePoll();
    expect(waitlistEstimate.mock.calls.length).toBe(calls);
  });
});
