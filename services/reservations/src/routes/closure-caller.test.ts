import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { closureCaller } from "./closure-caller.js";

type Role = "owner" | "manager" | "staff" | null;

function fakeRequest(opts: {
  role?: Role;
  user?: { id: string; name?: string | null; raw: { sub: string } };
}) {
  const venueRoleLookup = vi.fn().mockResolvedValue(opts.role ?? null);
  const request = {
    user: opts.user,
    server: { venueRoleLookup },
  } as unknown as FastifyRequest;
  return { request, venueRoleLookup };
}

const user = { id: "u-1", name: "Maria Lopez", raw: { sub: "auth0|abc" } };

describe("closureCaller", () => {
  it("treats a platform admin as Manager without calling the role lookup", async () => {
    const { request, venueRoleLookup } = fakeRequest({ user, role: "staff" });
    const caller = await closureCaller(request, "v-1", true);
    expect(caller.isManager).toBe(true);
    expect(venueRoleLookup).not.toHaveBeenCalled();
  });

  it.each(["owner", "manager"] as const)("treats a venue %s as Manager", async (role) => {
    const { request, venueRoleLookup } = fakeRequest({ user, role });
    const caller = await closureCaller(request, "v-1", false);
    expect(caller.isManager).toBe(true);
    expect(venueRoleLookup).toHaveBeenCalledWith("auth0|abc", "v-1");
  });

  it("treats staff as a Host", async () => {
    const { request } = fakeRequest({ user, role: "staff" });
    expect((await closureCaller(request, "v-1", false)).isManager).toBe(false);
  });

  it("treats a non-member as a Host", async () => {
    const { request } = fakeRequest({ user, role: null });
    expect((await closureCaller(request, "v-1", false)).isManager).toBe(false);
  });

  it("carries the actor id and a display name from the user", async () => {
    const { request } = fakeRequest({ user, role: "manager" });
    const caller = await closureCaller(request, "v-1", false);
    expect(caller.actorId).toBe("u-1");
    expect(caller.actorName).toBe("Maria Lopez");
  });

  it("drops an email-shaped name", async () => {
    const { request } = fakeRequest({
      user: { ...user, name: "maria@example.com" },
      role: "manager",
    });
    expect((await closureCaller(request, "v-1", false)).actorName).toBeNull();
  });

  it("falls back to actorId 'unknown' and a null name with no user, looking up an empty sub", async () => {
    const { request, venueRoleLookup } = fakeRequest({ role: null });
    const caller = await closureCaller(request, "v-1", false);
    expect(caller).toEqual({ isManager: false, actorId: "unknown", actorName: null });
    expect(venueRoleLookup).toHaveBeenCalledWith("", "v-1");
  });

  it("propagates a role lookup rejection", async () => {
    const { request, venueRoleLookup } = fakeRequest({ user });
    venueRoleLookup.mockRejectedValue(new Error("db down"));
    await expect(closureCaller(request, "v-1", false)).rejects.toThrow("db down");
  });
});
