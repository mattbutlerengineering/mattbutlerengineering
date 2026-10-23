import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Table, UpdateTableRequest } from "@mbe/types";
import { TableDetailsForm } from "./TableDetailsForm.js";

vi.mock("./TableDetailsForm.module.css", () => ({
  default: {
    form: "form",
    row: "row",
    errorBanner: "errorBanner",
    readOnlyField: "readOnlyField",
    detailLabel: "detailLabel",
    detailValueMono: "detailValueMono",
    actions: "actions",
    saveButton: "saveButton",
    deleteButton: "deleteButton",
  },
}));

const TABLE: Table = {
  id: "table-a",
  name: "Table A",
  tableNumber: "A1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: "Window",
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 100, y: 200, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const onSave = vi.fn<(tableId: string, changes: UpdateTableRequest) => Promise<void>>();
const onDelete = vi.fn();
const onDirtyChange = vi.fn();

function renderForm(table: Table = TABLE) {
  return render(
    <TableDetailsForm
      table={table}
      onSave={onSave}
      onDelete={onDelete}
      onDirtyChange={onDirtyChange}
    />
  );
}

/**
 * The validation message a field is actually associated with, read through its
 * own `aria-describedby`. A bare `getByText` is not usable here: Rialto's
 * built `Input` echoes its hint into a visually-hidden live region, so the
 * message legitimately appears twice in the DOM.
 */
function fieldError(label: string): string | null | undefined {
  const input = screen.getByLabelText(label);
  expect(input).toHaveAttribute("aria-invalid", "true");
  const describedBy = input.getAttribute("aria-describedby");
  return describedBy ? document.getElementById(describedBy)?.textContent : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockResolvedValue(undefined);
});

describe("TableDetailsForm", () => {
  describe("seeding", () => {
    it("seeds every editable field from the selected table", () => {
      renderForm();

      expect(screen.getByLabelText("Name")).toHaveValue("Table A");
      expect(screen.getByLabelText("Table Number")).toHaveValue("A1");
      expect(screen.getByLabelText("Capacity")).toHaveValue(4);
      expect(screen.getByLabelText("Min Covers")).toHaveValue(1);
      expect(screen.getByLabelText("Max Covers")).toHaveValue(4);
      expect(screen.getByLabelText("Location")).toHaveValue("Window");
      expect(screen.getByRole("checkbox", { name: /active/i })).toBeChecked();
    });

    it("leaves optional fields blank rather than showing 'null'", () => {
      renderForm({ ...TABLE, tableNumber: null, location: null });

      expect(screen.getByLabelText("Table Number")).toHaveValue("");
      expect(screen.getByLabelText("Location")).toHaveValue("");
    });

    // Shape and size are set when the table is created and are edited on the
    // canvas by dragging, not here; position is autosaved by the page.
    it("shows the position as read-only text, not an input", () => {
      renderForm();

      expect(screen.getByText("x: 100, y: 200")).toBeDefined();
      expect(screen.queryByLabelText("Position")).toBeNull();
    });
  });

  describe("saving", () => {
    it("disables Save until something actually changes", async () => {
      const user = userEvent.setup();
      renderForm();

      const save = screen.getByRole("button", { name: "Save Table" });
      expect(save).toBeDisabled();

      await user.type(screen.getByLabelText("Name"), "!");
      expect(save).toBeEnabled();
    });

    it("stays disabled when an edit is reverted by hand", async () => {
      const user = userEvent.setup();
      renderForm();

      const name = screen.getByLabelText("Name");
      await user.type(name, "!");
      await user.type(name, "{backspace}");

      expect(screen.getByRole("button", { name: "Save Table" })).toBeDisabled();
    });

    it("submits only the fields that changed", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Booth 1");
      await user.clear(screen.getByLabelText("Capacity"));
      await user.type(screen.getByLabelText("Capacity"), "6");
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith("table-a", { name: "Booth 1", capacity: 6 });
      });
    });

    it("submits the new fields the API gained for this form", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.clear(screen.getByLabelText("Table Number"));
      await user.type(screen.getByLabelText("Table Number"), "42");
      await user.clear(screen.getByLabelText("Max Covers"));
      await user.type(screen.getByLabelText("Max Covers"), "8");
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith("table-a", { tableNumber: "42", maxCovers: 8 });
      });
    });

    it("submits an isActive toggle on its own", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole("checkbox", { name: /active/i }));
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith("table-a", { isActive: false });
      });
    });

    it("re-baselines after a successful save so Save goes quiet again", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText("Name"), "!");
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Save Table" })).toBeDisabled();
      });
    });
  });

  describe("validation", () => {
    it("refuses to save a cleared name", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.clear(screen.getByLabelText("Name"));
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() => expect(fieldError("Name")).toBe("Table name is required."));
      expect(onSave).not.toHaveBeenCalled();
    });

    it("refuses a min covers above max covers", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.clear(screen.getByLabelText("Min Covers"));
      await user.type(screen.getByLabelText("Min Covers"), "9");
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() =>
        expect(fieldError("Min Covers")).toBe("Min covers cannot exceed max covers.")
      );
      expect(onSave).not.toHaveBeenCalled();
    });

    it("refuses a capacity below 1", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.clear(screen.getByLabelText("Capacity"));
      await user.type(screen.getByLabelText("Capacity"), "0");
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      await waitFor(() => expect(fieldError("Capacity")).toBe("Capacity must be at least 1."));
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe("failure handling", () => {
    it("surfaces the failure and keeps the operator's edit", async () => {
      const user = userEvent.setup();
      onSave.mockRejectedValueOnce(new Error("Table name already in use"));
      renderForm();

      await user.clear(screen.getByLabelText("Name"));
      await user.type(screen.getByLabelText("Name"), "Booth 1");
      await user.click(screen.getByRole("button", { name: "Save Table" }));

      expect(await screen.findByText("Table name already in use")).toBeDefined();
      expect(screen.getByLabelText("Name")).toHaveValue("Booth 1");
      expect(screen.getByRole("button", { name: "Save Table" })).toBeEnabled();
    });
  });

  describe("unsaved-edit reporting", () => {
    // The page uses this to keep its navigation guard honest — a typed but
    // unsaved edit must not vanish silently when the operator navigates away.
    it("reports dirty while an edit is pending and clean once saved", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText("Name"), "!");
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

      await user.click(screen.getByRole("button", { name: "Save Table" }));
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    });
  });

  describe("deletion", () => {
    it("delegates deletion to the page", async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole("button", { name: "Delete Table" }));

      expect(onDelete).toHaveBeenCalledWith("table-a");
    });
  });
});
