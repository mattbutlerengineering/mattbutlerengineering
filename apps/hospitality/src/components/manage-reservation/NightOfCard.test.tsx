import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ApiClientError } from "@mbe/api-client";
import { NightOfCard, type NightOfCardProps } from "./NightOfCard.js";

const signalManaged = vi.fn();
const manageReservation = vi.fn();
vi.mock("../../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: () => ({ reservations: { signalManaged, manageReservation } }),
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const START = "2026-06-15T02:00:00.000Z"; // 19:00 on 06-14 in America/Los_Angeles
const MIN = 60_000;
const at = (offsetMs: number): Date => new Date(Date.parse(START) + offsetMs);

const ADDRESS = {
  line1: "1 Oak St",
  city: "Portland",
  region: "OR",
  postalCode: "97201",
  country: "US",
};

function renderCard(overrides: Partial<NightOfCardProps> = {}) {
  const props: NightOfCardProps = {
    token: "tok-abc",
    reservation: { startTime: START, partySize: 4, status: "CONFIRMED" },
    venue: { name: "The Oak Table", ianaTimezone: "America/Los_Angeles" },
    initialSignals: { late: 0, arrived: 0 },
    now: at(-60 * MIN),
    formatTime: (iso) => `T(${iso})`,
    ...overrides,
  };
  return render(
    <main>
      <NightOfCard {...props} />
    </main>
  );
}

const lateButton = () => screen.getByRole("button", { name: "Running 15 min late" });
const hereButton = () => screen.getByRole("button", { name: "We're here" });
const problem = (status: number) =>
  new ApiClientError({ type: "about:blank", title: "x", status, detail: "nope" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NightOfCard", () => {
  it("shows the countdown, the party and the time", () => {
    renderCard();
    expect(screen.getByText("Your reservation starts in 1 hr")).toBeDefined();
    expect(screen.getByText(`4 guests · T(${START})`)).toBeDefined();
  });

  it("switches the countdown wording at and after the start", () => {
    const { unmount } = renderCard({ now: at(20_000) });
    expect(screen.getByText("Your reservation time is now")).toBeDefined();
    unmount();
    renderCard({ now: at(10 * MIN) });
    expect(screen.getByText("Your reservation started 10 min ago")).toBeDefined();
  });

  it("links to directions for the venue address, opening safely in a new tab", () => {
    renderCard({
      venue: { name: "The Oak Table", ianaTimezone: "America/Los_Angeles", address: ADDRESS },
    });
    const link = screen.getByRole("link", { name: /Get directions/ });
    const url = new URL(link.getAttribute("href")!);
    expect(url.searchParams.get("query")).toBe("The Oak Table, 1 Oak St, Portland, OR 97201, US");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("falls back to a venue-name search without an address", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /Get directions/ });
    expect(new URL(link.getAttribute("href")!).searchParams.get("query")).toBe("The Oak Table");
  });

  it("shows tonight's note as plain text, and nothing when there is none", () => {
    const { unmount } = renderCard({
      venue: {
        name: "The Oak Table",
        ianaTimezone: "America/Los_Angeles",
        tonightNote: "<b>Patio's open</b>, dress warm",
      },
    });
    expect(screen.getByText("<b>Patio's open</b>, dress warm")).toBeDefined();
    unmount();
    renderCard();
    expect(screen.queryByText(/A note from/)).toBeNull();
  });

  it("sends a running-late signal for 15 minutes and confirms it", async () => {
    signalManaged.mockResolvedValueOnce({ kind: "running-late", minutes: 15 });
    renderCard();
    fireEvent.click(lateButton());
    expect(signalManaged).toHaveBeenCalledWith("tok-abc", { kind: "running-late", minutes: 15 });
    expect((await screen.findAllByText(/running about 15 minutes late/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toContain("Your table is still booked");
  });

  it("sends an arrived signal with no minutes and then disables it", async () => {
    signalManaged.mockResolvedValueOnce({ kind: "arrived" });
    renderCard();
    fireEvent.click(hereButton());
    expect(signalManaged).toHaveBeenCalledWith("tok-abc", { kind: "arrived" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("you've arrived"));
    expect(hereButton().hasAttribute("disabled")).toBe(true);
    expect(lateButton().hasAttribute("disabled")).toBe(false);
  });

  it("shows pending feedback and blocks a second tap while the request is in flight", async () => {
    let resolve!: (v: unknown) => void;
    signalManaged.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderCard();
    fireEvent.click(lateButton());
    expect(screen.getByRole("status").textContent).toContain("Sending");
    expect(hereButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(hereButton());
    expect(signalManaged).toHaveBeenCalledTimes(1);
    resolve({ kind: "running-late", minutes: 15 });
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toContain("Sending"));
  });

  it("disables running-late after the third late signal", async () => {
    signalManaged.mockResolvedValueOnce({ kind: "running-late", minutes: 15 });
    renderCard({ initialSignals: { late: 2, arrived: 0 } });
    fireEvent.click(lateButton());
    await waitFor(() => expect(lateButton().hasAttribute("disabled")).toBe(true));
    expect(screen.getByText(/most late updates/)).toBeDefined();
    expect(hereButton().hasAttribute("disabled")).toBe(false);
  });

  it("starts with the buttons disabled for caps already reached", () => {
    renderCard({ initialSignals: { late: 3, arrived: 1 } });
    expect(lateButton().hasAttribute("disabled")).toBe(true);
    expect(hereButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/already let The Oak Table know you're here/)).toBeDefined();
  });

  it.each([
    ["before T-3h", at(-3 * 60 * MIN - 1)],
    ["after T+45m", at(45 * MIN + 1)],
  ])("disables both buttons %s and says when updates are open", (_name, now) => {
    renderCard({ now });
    expect(lateButton().hasAttribute("disabled")).toBe(true);
    expect(hereButton().hasAttribute("disabled")).toBe(true);
    const hint = screen.getByText(/open 3 hours before/);
    expect(lateButton().getAttribute("aria-describedby")).toContain(hint.id);
  });

  it("enables both buttons at exactly T-3h and T+45m", () => {
    const { unmount } = renderCard({ now: at(-3 * 60 * MIN) });
    expect(lateButton().hasAttribute("disabled")).toBe(false);
    unmount();
    renderCard({ now: at(45 * MIN) });
    expect(hereButton().hasAttribute("disabled")).toBe(false);
  });

  it.each([
    [401, /couldn't verify this link/],
    [403, /couldn't verify this link/],
    [404, /couldn't verify this link/],
    [410, /link has expired/],
    [409, /isn't taking updates right now/],
    [429, /maximum number of updates, or are sending too quickly/],
    [500, /couldn't send that/],
  ])("maps a %i refusal to a visible, specific alert", async (status, message) => {
    signalManaged.mockRejectedValueOnce(problem(status));
    manageReservation.mockRejectedValue(new Error("offline"));
    renderCard();
    fireEvent.click(lateButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(message);
    expect(lateButton().hasAttribute("disabled")).toBe(false);
  });

  it("shows a generic error for a network failure", async () => {
    signalManaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderCard();
    fireEvent.click(hereButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't send that/);
  });

  it("re-reads the server's counts after a 429 or 409 so the cap disables the button", async () => {
    signalManaged.mockRejectedValueOnce(problem(429));
    manageReservation.mockResolvedValueOnce({ guestSignals: { late: 3, arrived: 0 } });
    renderCard();
    fireEvent.click(lateButton());
    await screen.findByRole("alert");
    await waitFor(() => expect(lateButton().hasAttribute("disabled")).toBe(true));
    expect(manageReservation).toHaveBeenCalledWith("tok-abc");
  });

  it("clears the previous result when the guest sends another signal", async () => {
    signalManaged.mockRejectedValueOnce(problem(500));
    signalManaged.mockResolvedValueOnce({ kind: "arrived" });
    renderCard();
    fireEvent.click(lateButton());
    await screen.findByRole("alert");
    fireEvent.click(hereButton());
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("keeps the live region mounted from the start and has no axe violations", async () => {
    const { container } = renderCard({
      venue: {
        name: "The Oak Table",
        ianaTimezone: "America/Los_Angeles",
        address: ADDRESS,
        tonightNote: "Patio's open",
      },
    });
    expect(screen.getByRole("status")).toBeDefined();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
