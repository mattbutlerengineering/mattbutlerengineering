import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { VenueTeam } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";

const setRole = vi.fn();
const setGrant = vi.fn();
const refetch = vi.fn();
const teamQuery = vi.hoisted(() => ({
  value: { data: undefined, isLoading: false, error: null } as {
    data: VenueTeam | null | undefined;
    isLoading: boolean;
    error: Error | null;
  },
}));
const venueContext = vi.hoisted(() => ({ selectedVenueId: "venue-1" as string | null }));

vi.mock("../../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ ...teamQuery.value, refetch }),
  useSetTeamRole: () => ({ mutateAsync: setRole }),
  useSetHostEmergencyClose: () => ({ mutateAsync: setGrant }),
}));

vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: venueContext.selectedVenueId }),
}));

import { TeamRolesCard } from "./TeamRolesCard.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

/** Olive owns the venue; Maria is a manager; Sam is a Host. The viewer is Maria or Sam. */
function team(
  viewerRole: VenueTeam["viewerRole"],
  hostEmergencyClose = false,
  viewerCanChangeOwners = false
): VenueTeam {
  return {
    members: [
      { userSub: "auth0|olive", role: "manager", isViewer: false, isOwner: true },
      {
        userSub: "auth0|maria",
        role: "manager",
        isViewer: viewerRole === "manager",
        isOwner: false,
      },
      { userSub: "auth0|sam", role: "host", isViewer: viewerRole === "host", isOwner: false },
    ],
    hostEmergencyClose,
    viewerRole,
    viewerCanChangeOwners,
  };
}

/** React reports invalid DOM nesting (e.g. `<p>` inside `<p>`) through console.error. */
const isDomNestingError = (args: unknown[]) =>
  args.some(
    (arg) => typeof arg === "string" && /cannot (be a descendant|contain a nested)/.test(arg)
  );

function renderCard() {
  return render(
    <main>
      <TeamRolesCard />
    </main>
  );
}

describe("TeamRolesCard", () => {
  let consoleError: MockInstance<typeof console.error>;

  // rialto's Select scrolls the focused option into view; jsdom has no such method.
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    venueContext.selectedVenueId = "venue-1";
    teamQuery.value = { data: team("manager"), isLoading: false, error: null };
    setRole.mockResolvedValue({ userSub: "auth0|sam", role: "manager" });
    setGrant.mockResolvedValue(true);
    consoleError = vi.spyOn(console, "error");
  });

  afterEach(() => {
    const nesting = consoleError.mock.calls.filter(isDomNestingError);
    consoleError.mockRestore();
    expect(nesting, "React reported invalid DOM nesting").toEqual([]);
  });

  it("shows each member's role and marks the viewer", () => {
    renderCard();

    expect(screen.getByRole("combobox", { name: "Role for auth0|maria" })).toHaveTextContent(
      "Manager"
    );
    expect(screen.getByRole("combobox", { name: "Role for auth0|sam" })).toHaveTextContent("Host");
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows an owner's role as read-only text to a manager who is not an owner", () => {
    renderCard();

    expect(screen.queryByRole("combobox", { name: "Role for auth0|olive" })).toBeNull();
    expect(screen.getByTestId("team-role-auth0|olive")).toHaveTextContent("Manager");
    expect(screen.getByRole("combobox", { name: "Role for auth0|maria" })).toBeInTheDocument();
  });

  it("lets an owner or admin change an owner's role", () => {
    teamQuery.value = { data: team("manager", false, true), isLoading: false, error: null };
    renderCard();

    expect(screen.getByRole("combobox", { name: "Role for auth0|olive" })).toHaveTextContent(
      "Manager"
    );
  });

  it("lets a Manager make a Host a Manager", async () => {
    renderCard();

    fireEvent.click(screen.getByRole("combobox", { name: "Role for auth0|sam" }));
    fireEvent.click(screen.getByRole("option", { name: "Manager" }));

    await waitFor(() => {
      expect(setRole).toHaveBeenCalledWith({
        venueId: "venue-1",
        userSub: "auth0|sam",
        role: "manager",
      });
    });
  });

  it("lets a Manager turn on the Host emergency-close grant", async () => {
    renderCard();

    fireEvent.click(screen.getByRole("switch", { name: "Hosts can close in an emergency" }));

    await waitFor(() => {
      expect(setGrant).toHaveBeenCalledWith({ venueId: "venue-1", enabled: true });
    });
  });

  it("shows the server's reason when a change is refused", async () => {
    setRole.mockRejectedValueOnce(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "A venue needs at least one Manager",
        },
        "PATCH"
      )
    );
    renderCard();

    fireEvent.click(screen.getByRole("combobox", { name: "Role for auth0|maria" }));
    fireEvent.click(screen.getByRole("option", { name: "Host" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A venue needs at least one Manager"
    );
  });

  it("gives a Host nothing to edit", () => {
    teamQuery.value = { data: team("host", true), isLoading: false, error: null };
    renderCard();

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Only managers change roles.")).toBeInTheDocument();
    expect(
      screen.getByText("Hosts can close the whole venue for tonight in an emergency.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Manager")).toHaveLength(2);
    expect(screen.getAllByText("Host")).toHaveLength(1);
  });

  it("tells a Host when only managers can close", () => {
    teamQuery.value = { data: team("host", false), isLoading: false, error: null };
    renderCard();

    expect(screen.getByText("Only managers can close the venue.")).toBeInTheDocument();
  });

  it("asks for a venue when none is selected", () => {
    venueContext.selectedVenueId = null;
    renderCard();

    expect(screen.getByText("Choose a venue to see its team.")).toBeInTheDocument();
  });

  it("offers a retry when the team fails to load", () => {
    teamQuery.value = { data: undefined, isLoading: false, error: new Error("Network error") };
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch).toHaveBeenCalled();
  });

  it("has no axe violations for a Manager or a Host", async () => {
    const manager = renderCard();
    expect((await axe(manager.container, AXE_OPTIONS)).violations).toEqual([]);
    manager.unmount();

    teamQuery.value = { data: team("host", true), isLoading: false, error: null };
    const host = renderCard();
    expect((await axe(host.container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
