import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityChangeEntry } from "@mbe/types";

const changes = vi.hoisted(() => vi.fn());
const config = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAvailability.js", () => ({
  useAvailabilityChanges: changes,
  useAvailabilityConfig: config,
  useRevertAvailabilityChange: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast, dismiss: vi.fn() }),
}));

import { AvailabilityHistoryDrawer } from "./AvailabilityHistoryDrawer.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const entry = (over: Partial<AvailabilityChangeEntry>): AvailabilityChangeEntry => ({
  id: "chg-2",
  actorId: "auth0|me",
  at: "2026-10-25T18:00:00.000Z",
  kind: "config",
  summary: "Availability updated: 1 added, 0 changed, 0 removed",
  affectedFrom: "2026-11-06",
  affectedTo: "2026-11-06",
  notifiedGuests: false,
  revertedById: null,
  revertible: true,
  ...over,
});

const NEWEST = entry({});
const OLDER = entry({
  id: "chg-1",
  actorId: "auth0|ana",
  summary: "Availability updated: 0 added, 2 changed, 0 removed",
  revertible: false,
});

function loaded(items: AvailabilityChangeEntry[], total = items.length) {
  changes.mockReturnValue({
    data: { total, offset: 0, items },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

type Props = React.ComponentProps<typeof AvailabilityHistoryDrawer>;

function renderDrawer(props: Partial<Props> = {}) {
  const onClose = vi.fn();
  const onOpenDay = vi.fn();
  const utils = render(
    <main>
      <AvailabilityHistoryDrawer
        open
        venueId="venue-1"
        viewerRole="manager"
        onClose={onClose}
        onOpenDay={onOpenDay}
        {...props}
      />
    </main>
  );
  return { ...utils, onClose, onOpenDay };
}

describe("AvailabilityHistoryDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no scrollIntoView; the Select's listbox calls it when it opens.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    config.mockReturnValue({ data: { version: 7 } });
    loaded([NEWEST, OLDER]);
  });

  it("lists entries newest first, saying who and what in plain words", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "History" });
    const rows = within(dialog).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Availability updated: 1 added, 0 changed, 0 removed");
    expect(rows[0]).toHaveTextContent(/by you/i);
    expect(rows[1]).toHaveTextContent(/by a teammate/i);
  });

  it("offers Revert only where the server says it is possible, and only to a Manager", () => {
    renderDrawer();
    expect(screen.getAllByRole("button", { name: "Revert" })).toHaveLength(1);
  });

  it("shows a Host the history without any Revert", () => {
    renderDrawer({ viewerRole: "host" });
    expect(screen.queryByRole("button", { name: "Revert" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("reverts against the version it read and confirms with a toast", async () => {
    mutateAsync.mockResolvedValue({ version: 8, changeId: "chg-3" });
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        venueId: "venue-1",
        changeId: "chg-2",
        expectedVersion: 7,
      })
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Change undone" }))
    );
  });

  it("explains a change that told guests, in words rather than a code", async () => {
    mutateAsync.mockRejectedValue(
      new ApiClientError(
        {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "x",
          code: "guests-notified",
        } as never,
        "POST",
        "/revert"
      )
    );
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Revert" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          title: expect.stringMatching(/told guests/i),
        })
      )
    );
  });

  it("marks entries that told guests or were already undone", () => {
    loaded([
      entry({ id: "a", notifiedGuests: true, revertible: false }),
      entry({ id: "b", revertedById: "z", revertible: false }),
    ]);
    renderDrawer();
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Guests were told");
    expect(rows[1]).toHaveTextContent("Undone");
  });

  it("links an entry to its day", () => {
    const { onOpenDay } = renderDrawer();
    fireEvent.click(screen.getAllByRole("button", { name: "View day" })[0]!);
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-06");
  });

  it("says so when nothing has changed yet", () => {
    loaded([]);
    renderDrawer();
    expect(screen.getByText("No changes yet.")).toBeInTheDocument();
  });

  it("shows a skeleton while loading and a retry when the read fails", () => {
    changes.mockReturnValue({ data: null, isLoading: true, error: null, refetch: vi.fn() });
    const { unmount } = renderDrawer();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    unmount();
    const refetch = vi.fn();
    changes.mockReturnValue({ data: null, isLoading: false, error: new Error("x"), refetch });
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("asks for only the viewer's own changes when filtered to Me", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("combobox", { name: "Person" }));
    fireEvent.click(screen.getByRole("option", { name: "Only me" }));
    expect(changes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ actorId: "auth0|me" }),
      })
    );
  });

  it("has no axe violations", async () => {
    renderDrawer();
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});
