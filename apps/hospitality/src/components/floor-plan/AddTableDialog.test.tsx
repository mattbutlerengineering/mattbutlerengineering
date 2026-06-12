import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { AddTableDialog } from "./AddTableDialog.js";

vi.mock("./AddTableDialog.module.css", () => ({
  default: {
    overlay: "overlay",
    dialog: "dialog",
    dialogHeader: "dialogHeader",
    dialogTitle: "dialogTitle",
    closeButton: "closeButton",
    errorBanner: "errorBanner",
    form: "form",
    fieldGroup: "fieldGroup",
    row: "row",
    label: "label",
    required: "required",
    input: "input",
    shapeSelector: "shapeSelector",
    shapeButton: "shapeButton",
    shapeButtonActive: "shapeButtonActive",
    shapeIcon: "shapeIcon",
    shapeLabel: "shapeLabel",
    dialogFooter: "dialogFooter",
    cancelButton: "cancelButton",
    submitButton: "submitButton",
  },
}));

describe("AddTableDialog", () => {
  const defaultProps = {
    venueId: "venue-1",
    floorPlanId: "fp-1",
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onSubmit.mockResolvedValue(undefined);
  });

  it("renders dialog with form fields", () => {
    render(<AddTableDialog {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Table" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Table Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Capacity")).toBeInTheDocument();
    expect(screen.getByLabelText("Min Covers")).toBeInTheDocument();
  });

  it("has default capacity of 4 and min covers of 1", () => {
    render(<AddTableDialog {...defaultProps} />);
    expect(screen.getByLabelText("Capacity")).toHaveValue(4);
    expect(screen.getByLabelText("Min Covers")).toHaveValue(1);
  });

  it("renders 3 shape buttons with rectangle selected by default", () => {
    render(<AddTableDialog {...defaultProps} />);
    const rectButton = screen.getByRole("button", { name: /Rectangle/i });
    const squareButton = screen.getByRole("button", { name: /Square/i });
    const circleButton = screen.getByRole("button", { name: /Circle/i });

    expect(rectButton).toHaveAttribute("aria-pressed", "true");
    expect(squareButton).toHaveAttribute("aria-pressed", "false");
    expect(circleButton).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles shape selection", async () => {
    render(<AddTableDialog {...defaultProps} />);
    const circleButton = screen.getByRole("button", { name: /Circle/i });
    await userEvent.click(circleButton);

    expect(circleButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Rectangle/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("shows error when submitting whitespace-only name via form", async () => {
    const { container } = render(<AddTableDialog {...defaultProps} />);
    const input = screen.getByLabelText(/Table Name/);
    await userEvent.type(input, "  ");
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("Table name is required.")).toBeInTheDocument();
    });
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("submits with correct data for rectangle shape", async () => {
    render(<AddTableDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Table Name/), "Table 1");
    await userEvent.click(screen.getByRole("button", { name: "Add Table" }));

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        name: "Table 1",
        capacity: 4,
        minCovers: 1,
        venueId: "venue-1",
        floorPlanId: "fp-1",
        shapeMetadata: {
          shape: "rectangle",
          x: 400,
          y: 300,
          width: 100,
          height: 60,
        },
      });
    });
  });

  it("submits with circle shape dimensions", async () => {
    render(<AddTableDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Table Name/), "Round Top");
    await userEvent.click(screen.getByRole("button", { name: /Circle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Add Table" }));

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Round Top",
          shapeMetadata: expect.objectContaining({
            shape: "circle",
            width: 70,
            height: 70,
          }),
        })
      );
    });
  });

  it("shows error when onSubmit rejects", async () => {
    defaultProps.onSubmit.mockRejectedValue(new Error("API failure"));

    render(<AddTableDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Table Name/), "Table 1");
    await userEvent.click(screen.getByRole("button", { name: "Add Table" }));

    await waitFor(() => {
      expect(screen.getByText("API failure")).toBeInTheDocument();
    });
  });

  it("shows generic error for non-Error rejections", async () => {
    defaultProps.onSubmit.mockRejectedValue("unknown");

    render(<AddTableDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Table Name/), "T1");
    await userEvent.click(screen.getByRole("button", { name: "Add Table" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to create table.")).toBeInTheDocument();
    });
  });

  it("disables inputs while submitting", async () => {
    let resolveSubmit: () => void;
    defaultProps.onSubmit.mockReturnValue(new Promise((r) => (resolveSubmit = r)));

    render(<AddTableDialog {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/Table Name/), "Table 1");
    await userEvent.click(screen.getByRole("button", { name: "Add Table" }));

    expect(screen.getByLabelText(/Table Name/)).toBeDisabled();
    expect(screen.getByLabelText("Capacity")).toBeDisabled();
    expect(screen.getByLabelText("Min Covers")).toBeDisabled();
    expect(screen.getByText("Adding...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolveSubmit!();
    await waitFor(() => {
      expect(screen.getByText("Add Table")).toBeInTheDocument();
    });
  });

  it("calls onClose when cancel clicked", async () => {
    render(<AddTableDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button clicked", async () => {
    render(<AddTableDialog {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const { container } = render(<AddTableDialog {...defaultProps} />);
    const overlay = container.firstChild as HTMLElement;
    fireEvent.keyDown(overlay, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("trims whitespace-only name", async () => {
    render(<AddTableDialog {...defaultProps} />);
    await userEvent.clear(screen.getByLabelText(/Table Name/));
    await userEvent.type(screen.getByLabelText(/Table Name/), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Add Table" }));
    expect(screen.getByText("Table name is required.")).toBeDefined();
  });
});
