import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../services/deposit.js", () => ({
  depositService: { getById: vi.fn() },
  DepositTransitionError: class DepositTransitionError extends Error {},
}));

import { depositService, DepositTransitionError } from "../services/deposit.js";
import { depositTransitionHandler } from "./deposit-transition-handler.js";

type DepositTransitionRequest = FastifyRequest<{ Params: { id: string } }>;

function makeRequest(id: string): DepositTransitionRequest {
  return { params: { id } } as unknown as DepositTransitionRequest;
}

function makeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply & {
    code: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

describe("depositTransitionHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 without calling the transition when the deposit does not exist", async () => {
    vi.mocked(depositService.getById).mockResolvedValueOnce(null as never);
    const transition = vi.fn();
    const reply = makeReply();

    await depositTransitionHandler(transition)(makeRequest("dep-missing"), reply);

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404, title: "Not Found", detail: "Deposit not found" })
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it("returns 422 when the transition throws DepositTransitionError", async () => {
    vi.mocked(depositService.getById).mockResolvedValueOnce({ id: "dep-1" } as never);
    const transitionError = new DepositTransitionError("held", "applied", ["refunded"], "Deposit");
    const transition = vi.fn().mockRejectedValueOnce(transitionError);
    const reply = makeReply();

    await depositTransitionHandler(transition)(makeRequest("dep-1"), reply);

    expect(reply.code).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 422,
        title: "Unprocessable Entity",
        detail: transitionError.message,
      })
    );
  });

  it("rethrows errors that are not DepositTransitionError", async () => {
    vi.mocked(depositService.getById).mockResolvedValueOnce({ id: "dep-1" } as never);
    const transition = vi.fn().mockRejectedValueOnce(new Error("boom"));
    const reply = makeReply();

    await expect(depositTransitionHandler(transition)(makeRequest("dep-1"), reply)).rejects.toThrow(
      "boom"
    );
  });

  it("returns the transitioned deposit on success", async () => {
    vi.mocked(depositService.getById).mockResolvedValueOnce({ id: "dep-1" } as never);
    const transitioned = { id: "dep-1", status: "applied" };
    const transition = vi.fn().mockResolvedValueOnce(transitioned as never);
    const reply = makeReply();

    const result = await depositTransitionHandler(transition)(makeRequest("dep-1"), reply);

    expect(transition).toHaveBeenCalledWith("dep-1");
    expect(result).toEqual({ data: transitioned });
  });
});
