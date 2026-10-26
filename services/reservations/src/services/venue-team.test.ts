import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createVenueTeamService, LastManagerError, OwnerProtectedError } from "./venue-team.js";

vi.mock("../middleware/venue-context.js", () => ({ setVenueContext: vi.fn() }));

type Row = { userSub: string; role: "owner" | "manager" | "staff" };

/** A fake client whose transaction runs against the same in-memory rows. */
function fakeClient(rows: Row[], hostEmergencyClose = false) {
  const state = { rows: [...rows], hostEmergencyClose };
  const venueMembership = {
    findMany: vi.fn(async () => state.rows.map((row) => ({ ...row }))),
    findUnique: vi.fn(
      async ({ where }: { where: { userSub_venueId: { userSub: string } } }) =>
        state.rows.find((row) => row.userSub === where.userSub_venueId.userSub) ?? null
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { userSub_venueId: { userSub: string } };
        data: { role: Row["role"] };
      }) => {
        state.rows = state.rows.map((row) =>
          row.userSub === where.userSub_venueId.userSub ? { ...row, role: data.role } : row
        );
        return state.rows.find((row) => row.userSub === where.userSub_venueId.userSub);
      }
    ),
  };
  const venue = {
    findUnique: vi.fn(async () => ({ hostEmergencyClose: state.hostEmergencyClose })),
    updateMany: vi.fn(async ({ data }: { data: { hostEmergencyClose: boolean } }) => {
      state.hostEmergencyClose = data.hostEmergencyClose;
      return { count: 1 };
    }),
  };
  const tx = { venueMembership, venue, $queryRaw: vi.fn(async () => []) };
  const client = {
    ...tx,
    $transaction: vi.fn(async (run: (t: typeof tx) => Promise<unknown>) => run(tx)),
  } as unknown as PrismaClient;
  return { client, state, tx };
}

const TEAM: Row[] = [
  { userSub: "auth0|owner", role: "owner" },
  { userSub: "auth0|host", role: "staff" },
];

describe("venueTeamService.get", () => {
  it("maps owner and manager to Manager, staff to Host, and marks the viewer", async () => {
    const { client } = fakeClient(TEAM, true);
    const team = await createVenueTeamService(client).get("venue-1", "auth0|host", false);

    expect(team).toEqual({
      members: [
        { userSub: "auth0|owner", role: "manager", isViewer: false, isOwner: true },
        { userSub: "auth0|host", role: "host", isViewer: true, isOwner: false },
      ],
      hostEmergencyClose: true,
      viewerRole: "host",
      viewerCanChangeOwners: false,
    });
  });

  it("treats a platform admin who is not a member as a Manager who can change owners", async () => {
    const { client } = fakeClient(TEAM);
    const team = await createVenueTeamService(client).get("venue-1", "auth0|admin", true);

    expect(team?.viewerRole).toBe("manager");
    expect(team?.viewerCanChangeOwners).toBe(true);
  });

  it("lets an owner change owners but not a manager", async () => {
    const { client } = fakeClient([...TEAM, { userSub: "auth0|mgr", role: "manager" }]);
    const service = createVenueTeamService(client);

    expect((await service.get("venue-1", "auth0|owner", false))?.viewerCanChangeOwners).toBe(true);
    expect((await service.get("venue-1", "auth0|mgr", false))?.viewerCanChangeOwners).toBe(false);
  });

  it("returns null when the venue does not exist", async () => {
    const { client } = fakeClient(TEAM);
    vi.mocked(client.venue.findUnique).mockResolvedValueOnce(null);

    expect(await createVenueTeamService(client).get("venue-x", "auth0|owner", true)).toBeNull();
  });
});

const AS_OWNER = { isAdmin: false, role: "owner" } as const;
const AS_MANAGER = { isAdmin: false, role: "manager" } as const;
const AS_ADMIN = { isAdmin: true, role: null } as const;

describe("venueTeamService.setRole", () => {
  it("promotes a Host to Manager", async () => {
    const { client, state } = fakeClient(TEAM);

    const member = await createVenueTeamService(client).setRole(
      "venue-1",
      "auth0|host",
      "manager",
      AS_MANAGER
    );

    expect(member).toEqual({ userSub: "auth0|host", role: "manager" });
    expect(state.rows[1]?.role).toBe("manager");
  });

  it("keeps an owner an owner when asked to make them a Manager", async () => {
    const { client, tx } = fakeClient(TEAM);

    await createVenueTeamService(client).setRole("venue-1", "auth0|owner", "manager", AS_OWNER);

    expect(tx.venueMembership.update).not.toHaveBeenCalled();
  });

  it("demotes a Manager to Host while another Manager remains", async () => {
    const { client, state } = fakeClient([...TEAM, { userSub: "auth0|mgr", role: "manager" }]);

    await createVenueTeamService(client).setRole("venue-1", "auth0|mgr", "host", AS_MANAGER);

    expect(state.rows[2]?.role).toBe("staff");
  });

  it("refuses a manager changing an owner's role and writes nothing", async () => {
    const { client, state, tx } = fakeClient([...TEAM, { userSub: "auth0|mgr", role: "manager" }]);

    await expect(
      createVenueTeamService(client).setRole("venue-1", "auth0|owner", "host", AS_MANAGER)
    ).rejects.toBeInstanceOf(OwnerProtectedError);
    expect(tx.venueMembership.update).not.toHaveBeenCalled();
    expect(state.rows[0]?.role).toBe("owner");
  });

  it("lets an owner demote another owner while a Manager remains", async () => {
    const { client, state } = fakeClient([...TEAM, { userSub: "auth0|owner2", role: "owner" }]);

    await createVenueTeamService(client).setRole("venue-1", "auth0|owner2", "host", AS_OWNER);

    expect(state.rows[2]?.role).toBe("staff");
  });

  it("lets a platform admin demote an owner while a Manager remains", async () => {
    const { client, state } = fakeClient([...TEAM, { userSub: "auth0|mgr", role: "manager" }]);

    await createVenueTeamService(client).setRole("venue-1", "auth0|owner", "host", AS_ADMIN);

    expect(state.rows[0]?.role).toBe("staff");
  });

  it("refuses to demote the last Manager", async () => {
    const { client, state } = fakeClient(TEAM);

    await expect(
      createVenueTeamService(client).setRole("venue-1", "auth0|owner", "host", AS_OWNER)
    ).rejects.toBeInstanceOf(LastManagerError);
    expect(state.rows[0]?.role).toBe("owner");
  });

  it("locks the venue's memberships before counting Managers", async () => {
    const { client, tx } = fakeClient(TEAM);

    await createVenueTeamService(client).setRole("venue-1", "auth0|host", "manager", AS_MANAGER);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns null for a user who is not a member of the venue", async () => {
    const { client } = fakeClient(TEAM);

    expect(
      await createVenueTeamService(client).setRole("venue-1", "auth0|nobody", "manager", AS_OWNER)
    ).toBeNull();
  });
});

describe("venueTeamService.setHostEmergencyClose", () => {
  it("writes the grant and reports it back", async () => {
    const { client, state } = fakeClient(TEAM);

    expect(await createVenueTeamService(client).setHostEmergencyClose("venue-1", true)).toBe(true);
    expect(state.hostEmergencyClose).toBe(true);
  });

  it("returns false when no venue row was updated", async () => {
    const { client } = fakeClient(TEAM);
    vi.mocked(client.venue.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    expect(await createVenueTeamService(client).setHostEmergencyClose("venue-x", true)).toBe(false);
  });
});
