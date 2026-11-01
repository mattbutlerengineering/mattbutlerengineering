import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const toast = vi.hoisted(() => vi.fn());
const revert = vi.hoisted(() => vi.fn());
vi.mock("@mattbutlerengineering/rialto", () => ({ useToast: () => ({ toast }) }));
vi.mock("./useAvailability.js", () => ({
  useRevertAvailabilityChange: () => ({ mutateAsync: revert }),
}));

import { markEditorOpen } from "../components/availability/editor-open.js";
import { useAvailabilityUndo } from "./useAvailabilityUndo.js";

function offered() {
  const { result } = renderHook(() => useAvailabilityUndo());
  result.current({
    venueId: "venue-1",
    title: "Saved",
    saved: { version: 8, changeId: "chg-8" },
  });
  const action = toast.mock.calls.at(-1)?.[0].action as { onClick: () => void };
  return action.onClick;
}

describe("useAvailabilityUndo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revert.mockResolvedValue({ version: 9, changeId: "chg-9" });
  });

  it("reverts the save when Undo is pressed", async () => {
    offered()();
    await vi.waitFor(() => expect(revert).toHaveBeenCalledTimes(1));
  });

  it("does not revert while a day editor is open, and says to save or discard first", () => {
    const click = offered();
    const release = markEditorOpen();
    click();
    release();
    expect(revert).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Save or discard your changes first, then undo." })
    );
  });
});
