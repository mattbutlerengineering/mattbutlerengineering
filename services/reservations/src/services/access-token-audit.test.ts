import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createAccessTokenAuditService, DuplicateConfirmNonceError } from "./access-token-audit.js";

const ENTRY = {
  tokenId: "tok-1",
  userSub: "auth0|me",
  method: "PATCH",
  route: "/api/v1/reservations/:id",
  venueId: "v1",
  input: { params: { id: "r1" }, body: { tableId: "t2" } },
  tool: "move_booking",
  confirmNonce: "nonce-1",
};

function fakeClient(
  create: ReturnType<typeof vi.fn>,
  updateMany = vi.fn(async () => ({ count: 1 }))
) {
  return { accessTokenWriteAudit: { create, updateMany } } as unknown as PrismaClient;
}

describe("access token write audit service (#9780)", () => {
  it("inserts a row and returns its id", async () => {
    const create = vi.fn(async () => ({ id: "audit-1" }));
    const service = createAccessTokenAuditService(fakeClient(create));
    expect(await service.record(ENTRY)).toBe("audit-1");
    expect(create).toHaveBeenCalledWith({
      data: ENTRY,
      select: { id: true },
    });
  });

  it("maps a unique-constraint violation on the nonce to DuplicateConfirmNonceError", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    const service = createAccessTokenAuditService(fakeClient(create));
    await expect(service.record(ENTRY)).rejects.toBeInstanceOf(DuplicateConfirmNonceError);
  });

  it("lets any other insert failure through", async () => {
    const create = vi.fn(async () => {
      throw new Error("db down");
    });
    const service = createAccessTokenAuditService(fakeClient(create));
    await expect(service.record(ENTRY)).rejects.toThrow("db down");
  });

  it("stamps the response status on the row", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const service = createAccessTokenAuditService(fakeClient(vi.fn(), updateMany));
    await service.recordStatus("audit-1", 200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "audit-1" },
      data: { statusCode: 200 },
    });
  });
});
