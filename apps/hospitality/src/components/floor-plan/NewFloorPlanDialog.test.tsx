/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { NewFloorPlanDialog } from "./NewFloorPlanDialog.js";

vi.mock("./NewFloorPlanDialog.module.css", () => ({
  default: {
    overlay: "overlay",
    dialog: "dialog",
    dialogHeader: "dialogHeader",
    dialogTitle: "dialogTitle",
    closeButton: "closeButton",
    errorBanner: "errorBanner",
    form: "form",
    fieldGroup: "fieldGroup",
    label: "label",
    required: "required",
    input: "input",
    dialogFooter: "dialogFooter",
    cancelButton: "cancelButton",
    submitButton: "submitButton",
  },
}));

describe("NewFloorPlanDialog", () => {
  const defaultProps = {
    venueId: "venue-1",
    onCreated: vi.fn(),
    onClose: vi.fn(),
    onCreate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog with name input", () => {
    render(<NewFloorPlanDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("New Floor Plan")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
  });

  it("shows error when submitting whitespace-only name via form", async () => {
    const { container } = render(<NewFloorPlanDialog {...defaultProps} />);
    const input = screen.getByLabelText(/Name/);
    await userEvent.type(input, "  ");
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(
        screen.getByText("Floor plan name is required.")
      ).toBeInTheDocument();
    });
    expect(defaultProps.onCreate).not.toHaveBeenCalled();
  });

  it("calls onCreate and onCreated on successful submit", async () => {
    const mockFloorPlan = { id: "fp-1", name: "Main Dining" };
    defaultProps.onCreate.mockResolvedValue(mockFloorPlan);

    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Name/), "Main Dining");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(defaultProps.onCreate).toHaveBeenCalledWith({
        venueId: "venue-1",
        name: "Main Dining",
        layoutJson: { width: 800, height: 600, gridSize: 20, showGrid: true },
      });
      expect(defaultProps.onCreated).toHaveBeenCalledWith(mockFloorPlan);
    });
  });

  it("shows error when onCreate rejects", async () => {
    defaultProps.onCreate.mockRejectedValue(new Error("Server error"));

    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Name/), "Test Plan");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows generic error for non-Error rejections", async () => {
    defaultProps.onCreate.mockRejectedValue("unknown");

    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Name/), "Test");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        screen.getByText("Failed to create floor plan.")
      ).toBeInTheDocument();
    });
  });

  it("disables inputs while submitting", async () => {
    let resolveCreate: (v: any) => void;
    defaultProps.onCreate.mockReturnValue(
      new Promise((r) => (resolveCreate = r))
    );

    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Name/), "Test");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByLabelText(/Name/)).toBeDisabled();
    expect(screen.getByText("Creating...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveCreate!({ id: "fp-1", name: "Test" });
    await waitFor(() => {
      expect(defaultProps.onCreated).toHaveBeenCalled();
    });
  });

  it("calls onClose when cancel button clicked", async () => {
    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button clicked", async () => {
    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const { container } = render(<NewFloorPlanDialog {...defaultProps} />);
    const overlay = container.firstChild as HTMLElement;
    fireEvent.keyDown(overlay, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("trims whitespace-only name", async () => {
    render(<NewFloorPlanDialog {...defaultProps} />);
    await userEvent.clear(screen.getByLabelText(/Name/));
    await userEvent.type(screen.getByLabelText(/Name/), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Floor plan name is required.")).toBeDefined();
  });
});
