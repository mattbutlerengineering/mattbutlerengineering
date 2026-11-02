import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";

const toast = vi.hoisted(() => vi.fn());
const revert = vi.hoisted(() => vi.fn());
vi.mock("@mattbutlerengineering/rialto", () => ({ useToast: () => ({ toast }) }));
vi.mock("./useAvailability.js", () => ({
  useRevertAvailabilityChange: () => ({ mutateAsync: revert }),
}));

import { markEditorOpen } from "../components/availability/editor-open.js";
import { revertErrorText } from "../components/availability/revert-error.js";
import { defaultT } from "../i18n/default-t.js";
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
      // Not "save": a save moves the version, and the older Undo then always refuses.
      expect.objectContaining({ title: "Discard your changes first, then undo." })
    );
  });

  it("sends one revert for a double click", async () => {
    const click = offered();
    click();
    click();
    await vi.waitFor(() =>
      expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Change undone" }))
    );
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it("keeps Undo on offer after asking to finish the draft first", async () => {
    const click = offered();
    const release = markEditorOpen();
    click();
    release();
    const again = toast.mock.calls.at(-1)?.[0].action as { onClick: () => void };
    again.onClick();
    await vi.waitFor(() => expect(revert).toHaveBeenCalledTimes(1));
  });

  it("does not send two reverts when Undo is offered again and double-clicked", async () => {
    const click = offered();
    const release = markEditorOpen();
    click();
    release();
    const again = toast.mock.calls.at(-1)?.[0].action as { onClick: () => void };
    again.onClick();
    again.onClick();
    await vi.waitFor(() => expect(revert).toHaveBeenCalledTimes(1));
    expect(revert).toHaveBeenCalledTimes(1);
  });

  describe("focus, as the toast and its Undo go", () => {
    afterEach(() => {
      document.body.replaceChildren();
    });

    /** Rialto's toasts sit in a live region; that is how a press is told from focus elsewhere. */
    const TOAST = `<div aria-live="polite"><button id="toast">Undo</button></div>`;

    const append = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      return host;
    };

    it("goes back to the control that had it when Undo was offered", () => {
      const host = append(`<button id="from">From</button>${TOAST}`);
      host.querySelector<HTMLElement>("#from")!.focus();
      const click = offered();
      host.querySelector<HTMLElement>("#toast")!.focus();
      click();
      expect(document.activeElement?.id).toBe("from");
    });

    it("goes into the open drawer when that control has gone", () => {
      const gone = append(`<button id="from">From</button>`);
      gone.querySelector<HTMLElement>("#from")!.focus();
      const click = offered();
      gone.remove();
      const host = append(
        `<div role="dialog"><button disabled>Off</button><button id="in">In</button></div>${TOAST}`
      );
      host.querySelector<HTMLElement>("#toast")!.focus();
      click();
      expect(document.activeElement?.id).toBe("in");
    });

    it("goes to the page heading when that control has gone and no dialog is open", () => {
      const gone = append(`<button id="from">From</button>`);
      gone.querySelector<HTMLElement>("#from")!.focus();
      const click = offered();
      gone.remove();
      const host = append(`<main tabindex="-1"><h1 id="h" tabindex="-1">P</h1></main>${TOAST}`);
      host.querySelector<HTMLElement>("#toast")!.focus();
      click();
      expect(document.activeElement?.id).toBe("h");
    });

    it("goes to the main landmark when the heading cannot take focus", () => {
      const gone = append(`<button id="from">From</button>`);
      gone.querySelector<HTMLElement>("#from")!.focus();
      const click = offered();
      gone.remove();
      const host = append(`<main id="m" tabindex="-1"><h1>P</h1></main>${TOAST}`);
      host.querySelector<HTMLElement>("#toast")!.focus();
      click();
      expect(document.activeElement?.id).toBe("m");
    });

    it("stays put when focus has already moved on from the toast", () => {
      const host = append(`<button id="from">From</button><input id="typing" />`);
      host.querySelector<HTMLElement>("#from")!.focus();
      const click = offered();
      host.querySelector<HTMLElement>("#typing")!.focus();
      click();
      expect(document.activeElement?.id).toBe("typing");
    });
  });
});

describe("revertErrorText", () => {
  it("does not promise a reload that the server would refuse as superseded", () => {
    const conflict = new ApiClientError({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "x",
      code: "version-conflict",
    });
    const text = revertErrorText(conflict, defaultT);
    expect(text).not.toMatch(/reload|try again/i);
    // It can be the Manager's own save that moved the version, so it blames no one else.
    expect(text).not.toMatch(/someone else/i);
    expect(text).toMatch(/only the latest change can be undone/i);
  });
});
