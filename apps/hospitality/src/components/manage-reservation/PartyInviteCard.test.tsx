import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ApiClientError } from "@mbe/api-client";
import { PartyInviteCard } from "./PartyInviteCard.js";

const createManagedInvite = vi.fn();
const getManagedInviteSummary = vi.fn();
vi.mock("../../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: () => ({ reservations: { createManagedInvite, getManagedInviteSummary } }),
}));

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const shareButton = () => screen.getByRole("button", { name: "Invite your party" });
const inviteUrl = (t: string) => `${window.location.origin}/hospitality/i/${t}`;

function setShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
}
function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  getManagedInviteSummary.mockResolvedValue({
    invited: false,
    confirmed: 0,
    declined: 0,
    partySize: 4,
  });
  createManagedInvite.mockResolvedValue("venue_1.secret");
  setShare(undefined);
  setClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  setShare(undefined);
});

describe("PartyInviteCard", () => {
  it("shares through navigator.share when it exists, with the invite link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    render(<PartyInviteCard token="tok-abc" />);
    fireEvent.click(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(createManagedInvite).toHaveBeenCalledWith("tok-abc");
    expect(share.mock.calls[0]![0].url).toBe(inviteUrl("venue_1.secret"));
    expect(share.mock.calls[0]![0].url).not.toContain("tok-abc");
  });

  it("copies the link and says so when navigator.share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<PartyInviteCard token="tok-abc" />);
    fireEvent.click(shareButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(inviteUrl("venue_1.secret")));
    expect((await screen.findByRole("status")).textContent).toBe("Link copied");
  });

  it("mints the invite once and reuses it for later shares", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<PartyInviteCard token="tok-abc" />);
    fireEvent.click(shareButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    fireEvent.click(shareButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(createManagedInvite).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the guest dismisses the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    setShare(share);
    render(<PartyInviteCard token="tok-abc" />);
    fireEvent.click(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error when the invite cannot be created", async () => {
    createManagedInvite.mockRejectedValue(
      new ApiClientError({ type: "about:blank", title: "x", status: 500, detail: "boom" })
    );
    render(<PartyInviteCard token="tok-abc" />);
    fireEvent.click(shareButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn.t create/i);
  });

  it("shows the live RSVP count once the party has been invited", async () => {
    getManagedInviteSummary.mockResolvedValue({
      invited: true,
      confirmed: 4,
      declined: 1,
      partySize: 5,
    });
    render(<PartyInviteCard token="tok-abc" />);
    expect(await screen.findByText("4 of 5 confirmed")).toBeDefined();
    expect(getManagedInviteSummary).toHaveBeenCalledWith("tok-abc");
  });

  it("shows no count before anyone has been invited", async () => {
    render(<PartyInviteCard token="tok-abc" />);
    await waitFor(() => expect(getManagedInviteSummary).toHaveBeenCalled());
    expect(screen.queryByText(/confirmed/)).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <PartyInviteCard token="tok-abc" />
      </main>
    );
    await waitFor(() => expect(getManagedInviteSummary).toHaveBeenCalled());
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
