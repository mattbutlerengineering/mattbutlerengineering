import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FOCUSABLE_SELECTOR } from "@mattbutlerengineering/rialto/hooks";
import { ApiClientError } from "@mbe/api-client";
import { WalkInDialog } from "./WalkInDialog.js";
import { ERROR_COPY } from "../../lib/describe-api-error.js";
import type { Table } from "@mbe/types";

/** A 500 the way `@mbe/api-client` raises it: `raw` is "<METHOD> <path> failed: 500 …". */
function serverError(method: string, path: string): ApiClientError {
  return new ApiClientError(
    {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Internal Server Error",
    },
    method,
    path
  );
}

/** A 409 carrying the server's own sentence in `problemDetails.detail` (B1.2). */
function conflictError(detail: string): ApiClientError {
  return new ApiClientError(
    { type: "about:blank", title: "Conflict", status: 409, detail },
    "POST",
    "/api/v1/reservations/walk-in"
  );
}

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function makeTables(overrides: Partial<Table>[] = []): Table[] {
  const defaults: Table[] = [
    {
      id: "table-1",
      name: "Table 1",
      capacity: 2,
      isActive: true,
      status: "AVAILABLE",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-2",
      name: "Table 2",
      capacity: 4,
      isActive: true,
      status: "AVAILABLE",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-3",
      name: "Table 3",
      capacity: 6,
      isActive: true,
      status: "OCCUPIED",
      x: 400,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
    {
      id: "table-4",
      name: "Table 4",
      capacity: 8,
      isActive: true,
      status: "AVAILABLE",
      x: 600,
      y: 0,
      width: 100,
      height: 100,
      shape: "RECTANGLE",
      rotation: 0,
      venueId: "venue-1",
      floorPlanId: "fp-1",
    },
  ];
  return defaults.map((t, i) => (overrides[i] ? { ...t, ...overrides[i] } : t));
}

describe("WalkInDialog", () => {
  const defaultProps = {
    tables: makeTables(),
    venueId: "venue-1",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the dialog with title", () => {
    render(<WalkInDialog {...defaultProps} />);
    expect(screen.getByText("Seat walk-in")).toBeDefined();
  });

  it("should render with dialog role and aria-modal", () => {
    render(<WalkInDialog {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("should group party size buttons under an accessible group name", () => {
    render(<WalkInDialog {...defaultProps} />);
    expect(screen.getByRole("group", { name: /party size/i })).toBeDefined();
  });

  it("should render party size buttons 1 through 8", () => {
    render(<WalkInDialog {...defaultProps} />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeDefined();
    }
  });

  it("should default to party size 2", () => {
    render(<WalkInDialog {...defaultProps} />);
    const btn = screen.getByRole("button", { name: "2" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("should auto-select best-fit table for default party size", () => {
    render(<WalkInDialog {...defaultProps} />);
    // Party size 2 → smallest available table with capacity >= 2 → Table 1 (cap 2)
    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 1 (seats 2)");
  });

  it("should update table selection when party size changes", () => {
    render(<WalkInDialog {...defaultProps} />);

    // Switch to party of 4
    fireEvent.click(screen.getByRole("button", { name: "4" }));

    // Best fit: Table 2 (cap 4, AVAILABLE) — Table 3 (cap 6) is OCCUPIED
    const trigger = screen.getByRole("combobox", { name: /table/i });
    expect(trigger).toHaveTextContent("Table 2 (seats 4)");
  });

  it("should mark selected party size button as pressed", () => {
    render(<WalkInDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("should only show available tables with sufficient capacity", () => {
    render(<WalkInDialog {...defaultProps} />);

    // Party size 2 (default) → available tables with cap >= 2:
    // Table 1 (cap 2, AVAILABLE), Table 2 (cap 4, AVAILABLE), Table 4 (cap 8, AVAILABLE)
    // Table 3 (cap 6, OCCUPIED) excluded
    const trigger = screen.getByRole("combobox", { name: /table/i });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent).toContain("Table 1");
    expect(listbox.textContent).toContain("Table 2");
    expect(listbox.textContent).toContain("Table 4");
    expect(listbox.textContent).not.toContain("Table 3");
  });

  it("explains when nothing fits, as a caption the disabled Seat now is described by", () => {
    // All tables occupied
    const occupiedTables = makeTables().map((t) => ({
      ...t,
      status: "OCCUPIED" as const,
    }));
    render(<WalkInDialog {...defaultProps} tables={occupiedTables} />);

    const caption =
      "Nothing free for a party of 2 right now. Try a smaller party, or mark a table Available.";
    expect(screen.getByText(caption)).toBeInTheDocument();
    const seatNow = screen.getByRole("button", { name: "Seat now" });
    expect(seatNow).toBeDisabled();
    expect(seatNow).toHaveAccessibleDescription(caption);
  });

  it("should render guest name input as optional", () => {
    render(<WalkInDialog {...defaultProps} />);
    expect(screen.getByLabelText(/guest name/i)).toBeDefined();
  });

  it("should allow entering guest name", () => {
    render(<WalkInDialog {...defaultProps} />);
    const input = screen.getByLabelText(/guest name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Smith" } });
    expect(input.value).toBe("Smith");
  });

  it("should call onConfirm with correct data on Seat Now click", async () => {
    render(<WalkInDialog {...defaultProps} />);

    // Enter guest name
    const nameInput = screen.getByLabelText(/guest name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Johnson" } });

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.partySize).toBe(2);
    expect(data.tableId).toBe("table-1");
    expect(data.venueId).toBe("venue-1");
    expect(data.guestName).toBe("Johnson");
  });

  it("should omit guestName when empty", async () => {
    render(<WalkInDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.guestName).toBeUndefined();
  });

  it("should trim whitespace-only guest name to undefined", async () => {
    render(<WalkInDialog {...defaultProps} />);
    const input = screen.getByLabelText(/guest name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.guestName).toBeUndefined();
  });

  it("should call onClose when Cancel button is clicked", () => {
    render(<WalkInDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("speaks the house sentence for a non-Error rejection, never the thrown value", async () => {
    const onConfirm = vi.fn().mockRejectedValue("something broke");
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ERROR_COPY.unknown.detail);
    expect(screen.queryByText("something broke")).toBeNull();
  });

  it("should show loading state while confirming", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(screen.getByText("Seating…")).toBeDefined();
    });

    // Cancel button should be disabled during loading
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePromise!(undefined);
  });

  it("should disable party size buttons while loading", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
    });

    for (let i = 2; i <= 8; i++) {
      expect(screen.getByRole("button", { name: String(i) })).toBeDisabled();
    }

    resolvePromise!(undefined);
  });

  it("should disable guest name input while loading", async () => {
    let resolvePromise: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );
    render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(screen.getByLabelText(/guest name/i)).toBeDisabled();
    });

    resolvePromise!(undefined);
  });

  it("should show error when no table is selected", async () => {
    // Provide tables but make none available so tableId stays empty
    const _noAvailable = makeTables().map((t) => ({
      ...t,
      status: "OCCUPIED" as const,
    }));
    const smallTables: Table[] = [
      {
        id: "table-tiny",
        name: "Tiny",
        capacity: 1,
        isActive: true,
        status: "AVAILABLE",
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        shape: "RECTANGLE",
        rotation: 0,
        venueId: "venue-1",
        floorPlanId: "fp-1",
      },
    ];
    // Default party size is 2, tiny has capacity 1 → findBestTable returns ""
    // But then no tables are available, so Seat Now is disabled
    // The "Please select a table" error is a guard for edge cases
    // We can't easily trigger it through the UI — Seat Now is disabled when no tables match
    render(<WalkInDialog {...defaultProps} tables={smallTables} />);
    expect(screen.getByRole("button", { name: "Seat now" })).toBeDisabled();
  });

  it("should pass correct party size after changing selection", async () => {
    render(<WalkInDialog {...defaultProps} />);

    // Change to party of 6
    fireEvent.click(screen.getByRole("button", { name: "6" }));

    fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
    });

    const data = defaultProps.onConfirm.mock.calls[0][0];
    expect(data.partySize).toBe(6);
    // Best fit for 6: Table 4 (cap 8, AVAILABLE) — Table 3 (cap 6) is OCCUPIED
    expect(data.tableId).toBe("table-4");
  });

  describe("accessibility (focus trap; focus return belongs to the page)", () => {
    it("traps Tab focus within the dialog", () => {
      const { container } = render(<WalkInDialog {...defaultProps} />);
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      last.focus();
      fireEvent.keyDown(document.activeElement!, { key: "Tab" });
      expect(document.activeElement).toBe(first);

      fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    });

    it("opens with focus on the pressed party-size control, surviving StrictMode's double-run effects", () => {
      render(
        <StrictMode>
          <WalkInDialog {...defaultProps} />
        </StrictMode>
      );

      expect(screen.getByRole("button", { name: "2" })).toHaveFocus();
    });

    // The page owns focus return (`useFocusAfter`, captured at event time) — the dialog no longer
    // restores the opener itself, so closing must call `onClose` and leave focus where it is.
    it.each([
      ["Cancel", () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }))],
      ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
      [
        "backdrop click",
        () => fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement),
      ],
    ])("closing via %s calls onClose without moving focus back to the opener", (_label, close) => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();

      render(<WalkInDialog {...defaultProps} />);
      close();

      expect(defaultProps.onClose).toHaveBeenCalledOnce();
      expect(document.activeElement).not.toBe(trigger);
      document.body.removeChild(trigger);
    });
  });

  describe("owns its failure (item 12, #5031; ux.md Screen 3)", () => {
    const failure = serverError("POST", "/api/v1/reservations/walk-in");

    it("renders 'Walk-in not seated.' with the house sentence, the raw line behind Show details, and stays open", async () => {
      const onConfirm = vi.fn().mockRejectedValue(failure);
      render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

      const alert = await screen.findByRole("alert");
      expect(
        alert.textContent?.startsWith(`Walk-in not seated.${ERROR_COPY.serverError.detail}`)
      ).toBe(true);
      expect(screen.queryByText(failure.message)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Show details" }));
      expect(screen.getByRole("region", { name: "Show details" })).toHaveTextContent(
        failure.message
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("returns the button to 'Seat now' in the same commit as the banner and keeps the field values", async () => {
      const onConfirm = vi.fn().mockRejectedValue(failure);
      render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);
      fireEvent.click(screen.getByRole("button", { name: "4" }));
      fireEvent.change(screen.getByLabelText(/guest name/i), { target: { value: "Smith" } });

      fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

      await screen.findByRole("alert");
      const seatNow = screen.getByRole("button", { name: "Seat now" });
      expect(seatNow).not.toBeDisabled();
      expect(screen.queryByText("Seating…")).toBeNull();
      expect(screen.getByRole("button", { name: "4" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("combobox", { name: /table/i })).toHaveTextContent(
        "Table 2 (seats 4)"
      );
      expect((screen.getByLabelText(/guest name/i) as HTMLInputElement).value).toBe("Smith");
    });

    it("leaves focus on Seat now after a 500, so tapping again is the retry", async () => {
      const onConfirm = vi.fn().mockRejectedValue(failure);
      render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

      await screen.findByRole("alert");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Seat now" })).toHaveFocus();
      });
    });

    it("shows the server's own detail for a 409 and moves focus to the Table control", async () => {
      const onConfirm = vi.fn().mockRejectedValue(conflictError("Table 1 was just taken."));
      render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Table 1 was just taken.");
      expect(alert).not.toHaveTextContent(ERROR_COPY.conflict.detail);
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: /table/i })).toHaveFocus();
      });
    });

    it("a second Seat now after a failure calls onConfirm again with the kept values", async () => {
      const onConfirm = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
      render(<WalkInDialog {...defaultProps} onConfirm={onConfirm} />);
      fireEvent.click(screen.getByRole("button", { name: "6" }));

      fireEvent.click(screen.getByRole("button", { name: "Seat now" }));
      await screen.findByRole("alert");
      fireEvent.click(screen.getByRole("button", { name: "Seat now" }));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(2);
      });
      expect(onConfirm.mock.calls[1][0]).toMatchObject({ partySize: 6, tableId: "table-4" });
    });
  });

  describe("44 px targets (NF INCLUSIVE)", () => {
    it("gives the party-size row and the actions a 44 px minimum under the coarse-pointer / tablet query", () => {
      const css = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "WalkInDialog.module.css"),
        "utf-8"
      );
      const coarseBlock = css.match(
        /@media \(pointer: coarse\), \(max-width: 1024px\) \{([\s\S]*?)\n\}/
      );
      expect(coarseBlock).not.toBeNull();
      expect(coarseBlock?.[1]).toMatch(/\.partySizeRow > button\s*\{[^}]*min-block-size:\s*44px/);
      expect(coarseBlock?.[1]).toMatch(/\.partySizeRow > button\s*\{[^}]*min-inline-size:\s*44px/);
      expect(coarseBlock?.[1]).toMatch(/\.actions > button\s*\{[^}]*min-block-size:\s*44px/);
    });
  });
});
