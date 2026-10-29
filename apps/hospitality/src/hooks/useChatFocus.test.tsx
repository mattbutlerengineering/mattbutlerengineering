import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChatFocus, usePublishChatFocus } from "./useChatFocus.js";

describe("chat focus", () => {
  it("is empty until a page publishes one", () => {
    const { result } = renderHook(() => useChatFocus());

    expect(result.current).toBeUndefined();
  });

  it("shows the record the page has open, follows changes, and clears when the page unmounts", () => {
    const reader = renderHook(() => useChatFocus());
    const page = renderHook(
      ({ id }: { id: string | null }) =>
        usePublishChatFocus(id ? { kind: "reservation", id } : undefined),
      { initialProps: { id: "res-1" as string | null } }
    );

    expect(reader.result.current).toEqual({ kind: "reservation", id: "res-1" });

    act(() => page.rerender({ id: "res-2" }));
    expect(reader.result.current).toEqual({ kind: "reservation", id: "res-2" });

    act(() => page.rerender({ id: null }));
    expect(reader.result.current).toBeUndefined();

    act(() => page.rerender({ id: "res-3" }));
    act(() => page.unmount());
    expect(reader.result.current).toBeUndefined();
  });
});
