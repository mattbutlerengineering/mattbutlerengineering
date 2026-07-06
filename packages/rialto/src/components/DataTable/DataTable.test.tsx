import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { DataTable } from "./DataTable";
import type { SortState } from "./DataTable";

type Driver = {
  name: string;
  team: string;
  points: number;
};

const columns = [
  { key: "name", header: "Driver", sortable: true, rowHeader: true },
  { key: "team", header: "Team" },
  { key: "points", header: "Points", sortable: true, align: "right" as const },
];

const data: Driver[] = [
  { name: "Hamilton", team: "Mercedes", points: 347 },
  { name: "Verstappen", team: "Red Bull", points: 395 },
  { name: "Leclerc", team: "Ferrari", points: 308 },
];

const rowKey = (r: Driver) => r.name;

describe("DataTable", () => {
  describe("grid roles", () => {
    it("renders a grid", () => {
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      expect(screen.getByRole("grid", { name: "Drivers" })).toBeInTheDocument();
    });

    it("renders a columnheader per column", () => {
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      expect(screen.getByRole("columnheader", { name: /Driver/ })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Team" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Points/ })).toBeInTheDocument();
    });

    it("renders one rowheader per data row for the rowHeader column", () => {
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      expect(screen.getAllByRole("rowheader")).toHaveLength(3);
      expect(screen.getByRole("rowheader", { name: "Hamilton" })).toBeInTheDocument();
    });

    it("renders gridcell for non-rowHeader data cells", () => {
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      // Team + Points columns are gridcells: 2 columns * 3 rows = 6
      expect(screen.getAllByRole("gridcell")).toHaveLength(6);
    });

    it("renders emptyMessage when data is empty", () => {
      render(<DataTable columns={columns} data={[]} rowKey={rowKey} emptyMessage="No drivers" />);
      expect(screen.getByText("No drivers")).toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    const firstRowHeader = () =>
      screen.getAllByRole("row")[1]?.querySelector("[role='rowheader']")?.textContent;

    it("sorts ascending on first header click", async () => {
      const user = userEvent.setup();
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      await user.click(screen.getByRole("button", { name: /Driver/ }));
      expect(firstRowHeader()).toBe("Hamilton");
    });

    it("sorts descending on second header click", async () => {
      const user = userEvent.setup();
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      const button = screen.getByRole("button", { name: /Driver/ });
      await user.click(button);
      await user.click(button);
      expect(firstRowHeader()).toBe("Verstappen");
    });

    it("returns to unsorted (original order) on third click", async () => {
      const user = userEvent.setup();
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      const button = screen.getByRole("button", { name: /Driver/ });
      await user.click(button);
      await user.click(button);
      await user.click(button);
      expect(firstRowHeader()).toBe("Hamilton"); // original data order
    });

    it("sorts numeric columns numerically", async () => {
      const user = userEvent.setup();
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      await user.click(screen.getByRole("button", { name: /Points/ }));
      const cells = screen.getAllByRole("row")[1]?.querySelectorAll("[role='gridcell']");
      expect(cells?.[1]?.textContent).toBe("308"); // Leclerc lowest points
    });

    it("reflects sort state via aria-sort on the active columnheader", async () => {
      const user = userEvent.setup();
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      const header = screen.getByRole("columnheader", { name: /Driver/ });
      expect(header).toHaveAttribute("aria-sort", "none");
      await user.click(screen.getByRole("button", { name: /Driver/ }));
      expect(header).toHaveAttribute("aria-sort", "ascending");
      await user.click(screen.getByRole("button", { name: /Driver/ }));
      expect(header).toHaveAttribute("aria-sort", "descending");
    });

    it("omits aria-sort on non-sortable columns", () => {
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      expect(screen.getByRole("columnheader", { name: "Team" })).not.toHaveAttribute("aria-sort");
    });

    it("activates sort via keyboard Enter on the sortable header", async () => {
      const user = userEvent.setup();
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      const button = screen.getByRole("button", { name: /Driver/ });
      button.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("columnheader", { name: /Driver/ })).toHaveAttribute(
        "aria-sort",
        "ascending"
      );
    });

    it("supports controlled sort via sort + onSortChange", async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      const controlled: SortState = { key: "points", direction: "desc" };
      render(
        <DataTable
          columns={columns}
          data={data}
          rowKey={rowKey}
          label="Drivers"
          sort={controlled}
          onSortChange={onSortChange}
        />
      );
      // Controlled: points desc → Verstappen (395) first regardless of clicks
      expect(firstRowHeader()).toBe("Verstappen");
      expect(screen.getByRole("columnheader", { name: /Points/ })).toHaveAttribute(
        "aria-sort",
        "descending"
      );
      // Clicking reports the next state but does not mutate our controlled value
      await user.click(screen.getByRole("button", { name: /Driver/ }));
      expect(onSortChange).toHaveBeenCalledWith({ key: "name", direction: "asc" });
      expect(firstRowHeader()).toBe("Verstappen");
    });

    it("respects defaultSort for uncontrolled initial order", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          rowKey={rowKey}
          label="Drivers"
          defaultSort={{ key: "points", direction: "asc" }}
        />
      );
      expect(firstRowHeader()).toBe("Leclerc"); // 308 lowest
    });
  });

  describe("selection", () => {
    const withSel = (mode: "single" | "multiple", extra = {}) => (
      <DataTable
        columns={columns}
        data={data}
        rowKey={rowKey}
        label="Drivers"
        selectionMode={mode}
        selectionLabel={(r) => `Select ${r.name}`}
        {...extra}
      />
    );

    it("renders no checkboxes when selectionMode is unset", () => {
      render(<DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("multiple: toggles a row and marks it aria-selected", async () => {
      const user = userEvent.setup();
      render(withSel("multiple"));
      const cb = screen.getByRole("checkbox", { name: "Select Hamilton" });
      expect(cb).not.toBeChecked();
      await user.click(cb);
      expect(cb).toBeChecked();
      expect(cb.closest("tr")).toHaveAttribute("aria-selected", "true");
    });

    it("multiple: select-all checks every row", async () => {
      const user = userEvent.setup();
      render(withSel("multiple"));
      await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
      for (const d of data) {
        expect(screen.getByRole("checkbox", { name: `Select ${d.name}` })).toBeChecked();
      }
    });

    it("multiple: select-all is indeterminate for a partial selection", async () => {
      const user = userEvent.setup();
      render(withSel("multiple"));
      await user.click(screen.getByRole("checkbox", { name: "Select Hamilton" }));
      const all = screen.getByRole("checkbox", { name: "Select all rows" });
      expect(all).toHaveProperty("indeterminate", true);
      expect(all).not.toBeChecked();
    });

    it("multiple: select-all is fully checked (not indeterminate) when all selected", async () => {
      const user = userEvent.setup();
      render(withSel("multiple"));
      const all = screen.getByRole("checkbox", { name: "Select all rows" });
      await user.click(all);
      expect(all).toBeChecked();
      expect(all).toHaveProperty("indeterminate", false);
    });

    it("single: selecting a row deselects the previously selected row", async () => {
      const user = userEvent.setup();
      render(withSel("single"));
      const ham = screen.getByRole("checkbox", { name: "Select Hamilton" });
      const ver = screen.getByRole("checkbox", { name: "Select Verstappen" });
      await user.click(ham);
      expect(ham).toBeChecked();
      await user.click(ver);
      expect(ver).toBeChecked();
      expect(ham).not.toBeChecked();
    });

    it("single: renders no select-all checkbox", () => {
      render(withSel("single"));
      expect(screen.queryByRole("checkbox", { name: "Select all rows" })).not.toBeInTheDocument();
    });

    it("controlled: selectedKeys drives state; onSelectionChange reports next intent", async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(withSel("multiple", { selectedKeys: ["Hamilton"], onSelectionChange }));
      expect(screen.getByRole("checkbox", { name: "Select Hamilton" })).toBeChecked();
      const ver = screen.getByRole("checkbox", { name: "Select Verstappen" });
      expect(ver).not.toBeChecked();
      await user.click(ver);
      expect(onSelectionChange).toHaveBeenCalledWith(["Hamilton", "Verstappen"]);
      expect(ver).not.toBeChecked(); // controlled value unchanged by internal state
    });

    it("uncontrolled: honours defaultSelectedKeys", () => {
      render(withSel("multiple", { defaultSelectedKeys: ["Verstappen"] }));
      expect(screen.getByRole("checkbox", { name: "Select Verstappen" })).toBeChecked();
    });

    it("sets aria-multiselectable on the grid in multiple mode only", () => {
      const { rerender } = render(withSel("multiple"));
      expect(screen.getByRole("grid")).toHaveAttribute("aria-multiselectable", "true");
      rerender(withSel("single"));
      expect(screen.getByRole("grid")).not.toHaveAttribute("aria-multiselectable");
    });
  });

  describe("accessibility", () => {
    const axeOpts = { rules: { "color-contrast": { enabled: false } } };

    it("has no axe violations for a plain grid", async () => {
      const { container } = render(
        <DataTable columns={columns} data={data} rowKey={rowKey} label="Drivers" />
      );
      expect(await axe(container, axeOpts)).toHaveNoViolations();
    });

    it("has no axe violations when sortable and multi-selectable", async () => {
      const { container } = render(
        <DataTable
          columns={columns}
          data={data}
          rowKey={rowKey}
          label="Drivers"
          selectionMode="multiple"
          selectionLabel={(r) => `Select ${r.name}`}
          defaultSort={{ key: "name", direction: "asc" }}
          defaultSelectedKeys={["Hamilton"]}
        />
      );
      expect(await axe(container, axeOpts)).toHaveNoViolations();
    });
  });
});
