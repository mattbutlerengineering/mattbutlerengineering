import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useChatRequestContext } from "./copilotContext.js";
import { usePublishChatFocus } from "../hooks/useChatFocus.js";

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenue: { id: "v1", ianaTimezone: "America/Los_Angeles" } }),
}));

function at(path: string) {
  function RouterAt({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  }
  return RouterAt;
}

describe("useChatRequestContext", () => {
  it("sends the record the page has open even when the URL doesn't name it (#7933)", () => {
    const { result } = renderHook(
      () => {
        usePublishChatFocus({ kind: "reservation", id: "res-7" });
        return useChatRequestContext();
      },
      { wrapper: at("/timeline?date=2026-10-30") }
    );

    expect(result.current).toEqual({
      venueId: "v1",
      timeZone: "America/Los_Angeles",
      page: "timeline",
      focus: { kind: "reservation", id: "res-7" },
      focusDate: "2026-10-30",
    });
  });

  it("falls back to the URL's record when the page publishes none", () => {
    const { result } = renderHook(() => useChatRequestContext(), {
      wrapper: at("/menus/menu-9"),
    });

    expect(result.current).toMatchObject({ page: "menus", focus: { kind: "menu", id: "menu-9" } });
  });
});
