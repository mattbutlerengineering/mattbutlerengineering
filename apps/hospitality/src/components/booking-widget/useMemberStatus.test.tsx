import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMemberStatus } from "./useMemberStatus.js";

function apiWith(memberStatus: ReturnType<typeof vi.fn>) {
  return { publicVenue: { memberStatus } } as unknown as Parameters<typeof useMemberStatus>[0];
}

describe("useMemberStatus (#9627)", () => {
  it("is none, and asks nothing, without a member link", () => {
    const memberStatus = vi.fn();
    const { result } = renderHook(() => useMemberStatus(apiWith(memberStatus), "oak", undefined));

    expect(result.current).toEqual({ kind: "none" });
    expect(memberStatus).not.toHaveBeenCalled();
  });

  it("reports the lead days of a link the venue accepts", async () => {
    const memberStatus = vi.fn().mockResolvedValue({ member: true, leadDays: 14 });
    const { result } = renderHook(() => useMemberStatus(apiWith(memberStatus), "oak", "tok"));

    expect(result.current).toEqual({ kind: "none" });
    await waitFor(() => expect(result.current).toEqual({ kind: "member", leadDays: 14 }));
    expect(memberStatus).toHaveBeenCalledWith("oak");
  });

  it("degrades to invalid when the venue does not accept the link", async () => {
    const memberStatus = vi.fn().mockResolvedValue({ member: false, leadDays: 0 });
    const { result } = renderHook(() => useMemberStatus(apiWith(memberStatus), "oak", "tok"));

    await waitFor(() => expect(result.current).toEqual({ kind: "invalid" }));
  });

  it("stays public, with no notice, when the status call fails", async () => {
    const memberStatus = vi.fn().mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useMemberStatus(apiWith(memberStatus), "oak", "tok"));

    await waitFor(() => expect(memberStatus).toHaveBeenCalled());
    expect(result.current).toEqual({ kind: "none" });
  });
});
