import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import { MarkNoShowDialog } from "./MarkNoShowDialog.js";
import { ERROR_COPY } from "../../lib/describe-api-error.js";

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

// Mock scrollIntoView for JSDOM (the focus trap scrolls its first target).
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("MarkNoShowDialog", () => {
  const defaultProps = {
    guestName: "Jane Doe",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the guest name and the no-show fee warning", () => {
    render(<MarkNoShowDialog {...defaultProps} />);
    expect(screen.getByText(/jane doe/i)).toBeDefined();
    expect(screen.getByText(/no-show fee/i)).toBeDefined();
  });

  it("uses the default guest name when guestName is null", () => {
    render(<MarkNoShowDialog {...defaultProps} guestName={null} />);
    expect(screen.getByText("Guest")).toBeDefined();
  });

  it("calls onConfirm when Mark No-Show is clicked", async () => {
    render(<MarkNoShowDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark No-Show" }));
    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it("disables buttons while onConfirm is pending", async () => {
    let resolveConfirm: (value: void | PromiseLike<void>) => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(<MarkNoShowDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark No-Show" }));

    await waitFor(() => {
      expect(screen.getByText("Marking…")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Keep Reservation" })).toBeDisabled();

    await waitFor(() => {
      resolveConfirm!(undefined);
    });
  });

  describe("owns its failure (dialog contracts)", () => {
    const failure = serverError("PATCH", "/api/v1/reservations/res-123");

    it("renders 'Reservation not marked as no-show.' and stays open", async () => {
      const onConfirm = vi.fn().mockRejectedValue(failure);
      render(<MarkNoShowDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: "Mark No-Show" }));

      const alert = await screen.findByRole("alert");
      expect(
        alert.textContent?.startsWith(
          `Reservation not marked as no-show.${ERROR_COPY.serverError.detail}`
        )
      ).toBe(true);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("returns the buttons to rest and leaves focus on Mark No-Show so pressing again is the retry", async () => {
      const onConfirm = vi.fn().mockRejectedValue(failure);
      render(<MarkNoShowDialog {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: "Mark No-Show" }));

      await screen.findByRole("alert");
      expect(screen.getByRole("button", { name: "Mark No-Show" })).not.toBeDisabled();
      expect(screen.queryByText("Marking…")).toBeNull();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Mark No-Show" })).toHaveFocus();
      });
    });
  });

  describe("closing", () => {
    it.each([
      [
        "Keep Reservation",
        () => fireEvent.click(screen.getByRole("button", { name: "Keep Reservation" })),
      ],
      ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
      [
        "backdrop click",
        () => fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement),
      ],
    ])("closing via %s calls onClose", (_label, close) => {
      render(<MarkNoShowDialog {...defaultProps} />);
      close();
      expect(defaultProps.onClose).toHaveBeenCalledOnce();
    });
  });
});
