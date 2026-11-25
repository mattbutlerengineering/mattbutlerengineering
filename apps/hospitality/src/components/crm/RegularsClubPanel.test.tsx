import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiClientError } from "@mbe/api-client";
import type { GuestMember } from "@mbe/types";
import { RegularsClubPanel } from "./RegularsClubPanel.js";

const mockUseMembers = vi.fn();
const mockInvite = vi.fn();
const mockRevoke = vi.fn();

vi.mock("../../hooks/useRegularsClub.js", () => ({
  useMembers: (params: unknown) => mockUseMembers(params),
  useInviteMember: () => ({ mutateAsync: mockInvite, isPending: false }),
  useRevokeMember: () => ({ mutateAsync: mockRevoke, isPending: false }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1" }),
}));
vi.mock("../../hooks/useVenueFormat.js", () => ({
  useVenueFormat: () => ({ formatInstant: () => "Nov 1, 2026" }),
}));

function member(overrides: Partial<GuestMember> = {}): GuestMember {
  return {
    id: "m1",
    guestId: "g1",
    guestName: "Alice",
    guestEmail: "alice@example.com",
    tier: "REGULAR",
    status: "ACTIVE",
    invitedAt: "2026-11-01T10:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

describe("RegularsClubPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMembers.mockReturnValue({ data: [member()], isLoading: false, error: null });
  });

  it("shows each member's status and a revoke control for active members only", () => {
    mockUseMembers.mockReturnValue({
      data: [member(), member({ id: "m2", guestId: "g2", guestName: "Bob", status: "REVOKED" })],
      isLoading: false,
      error: null,
    });
    render(<RegularsClubPanel />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Alice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke Bob" })).not.toBeInTheDocument();
  });

  it("invites by email and confirms", async () => {
    mockInvite.mockResolvedValue(member());
    const user = userEvent.setup();
    render(<RegularsClubPanel />);

    await user.type(screen.getByLabelText("Name"), "Cara");
    await user.type(screen.getByLabelText("Email"), "cara@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() =>
      expect(mockInvite).toHaveBeenCalledWith({
        venueId: "venue-1",
        email: "cara@example.com",
        name: "Cara",
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invitation sent to cara@example.com"
    );
  });

  it("shows the server's reason when the invitation email fails", async () => {
    mockInvite.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Failed Dependency",
          status: 424,
          detail: "Cara was added, but the invitation email was not sent.",
        },
        "POST",
        "/api/v1/guests/members"
      )
    );
    const user = userEvent.setup();
    render(<RegularsClubPanel />);

    await user.type(screen.getByLabelText("Name"), "Cara");
    await user.type(screen.getByLabelText("Email"), "cara@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cara was added, but the invitation email was not sent."
    );
  });

  it("revokes a member", async () => {
    mockRevoke.mockResolvedValue({ revoked: true });
    const user = userEvent.setup();
    render(<RegularsClubPanel />);

    await user.click(screen.getByRole("button", { name: "Revoke Alice" }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith("g1"));
  });

  it("says so when there are no members yet", () => {
    mockUseMembers.mockReturnValue({ data: [], isLoading: false, error: null });
    render(<RegularsClubPanel />);
    expect(screen.getByText(/No members yet/)).toBeInTheDocument();
  });
});
