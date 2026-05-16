import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Table } from "./Table";

type Driver = {
  name: string;
  team: string;
  points: number;
};

const columns = [
  { key: "name", header: "Driver", sortable: true },
  { key: "team", header: "Team" },
  { key: "points", header: "Points", sortable: true, align: "right" as const },
];

const data: Driver[] = [
  { name: "Hamilton", team: "Mercedes", points: 347 },
  { name: "Verstappen", team: "Red Bull", points: 395 },
  { name: "Leclerc", team: "Ferrari", points: 308 },
];

describe("Table", () => {
  describe("rendering", () => {
    it("renders a table element", () => {
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    it("renders all column headers", () => {
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      expect(screen.getByRole("columnheader", { name: "Driver" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Team" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Points" })).toBeInTheDocument();
    });

    it("renders all data rows", () => {
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      expect(screen.getAllByRole("row")).toHaveLength(data.length + 1); // +1 for header row
    });

    it("renders row cell content", () => {
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      expect(screen.getByText("Hamilton")).toBeInTheDocument();
      expect(screen.getByText("Mercedes")).toBeInTheDocument();
      expect(screen.getByText("347")).toBeInTheDocument();
    });

    it("renders emptyMessage when data is empty", () => {
      render(
        <Table
          columns={columns}
          data={[]}
          rowKey={(r) => (r as Driver).name}
          emptyMessage="No drivers"
        />
      );
      expect(screen.getByText("No drivers")).toBeInTheDocument();
    });

    it("renders default empty message when data is empty and no emptyMessage", () => {
      render(<Table columns={columns} data={[]} rowKey={(r) => (r as Driver).name} />);
      expect(screen.getByText("No data")).toBeInTheDocument();
    });
  });

  describe("custom render", () => {
    it("uses custom render function for cell", () => {
      const columnsWithRender = [
        ...columns,
        {
          key: "badge",
          header: "Status",
          render: (_row: Driver) => <span>Active</span>,
        },
      ];
      render(
        <Table columns={columnsWithRender} data={data} rowKey={(r) => r.name} />
      );
      // Three rows × one badge each
      expect(screen.getAllByText("Active")).toHaveLength(3);
    });
  });

  describe("sorting", () => {
    it("sorts by column on header click (asc first)", async () => {
      const user = userEvent.setup();
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      await user.click(screen.getByRole("columnheader", { name: /Driver/ }));

      const rows = screen.getAllByRole("row").slice(1); // skip header
      const firstCell = rows[0]?.querySelector("td");
      expect(firstCell?.textContent).toBe("Hamilton");
    });

    it("reverses sort on second click (desc)", async () => {
      const user = userEvent.setup();
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      const header = screen.getByRole("columnheader", { name: /Driver/ });
      await user.click(header);
      await user.click(header);

      const rows = screen.getAllByRole("row").slice(1);
      const firstCell = rows[0]?.querySelector("td");
      expect(firstCell?.textContent).toBe("Verstappen");
    });

    it("sorts numeric columns correctly (asc)", async () => {
      const user = userEvent.setup();
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      await user.click(screen.getByRole("columnheader", { name: /Points/ }));

      const rows = screen.getAllByRole("row").slice(1);
      const firstCell = rows[0]?.querySelectorAll("td")[2];
      expect(firstCell?.textContent).toBe("308");
    });

    it("sets aria-sort=ascending on sorted column", async () => {
      const user = userEvent.setup();
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      await user.click(screen.getByRole("columnheader", { name: /Driver/ }));
      expect(screen.getByRole("columnheader", { name: /Driver/ })).toHaveAttribute(
        "aria-sort",
        "ascending"
      );
    });

    it("sets aria-sort=descending after second click", async () => {
      const user = userEvent.setup();
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      const header = screen.getByRole("columnheader", { name: /Driver/ });
      await user.click(header);
      await user.click(header);
      expect(header).toHaveAttribute("aria-sort", "descending");
    });

    it("sets aria-sort=none on unsorted sortable column", () => {
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      // Neither column is sorted yet — sortable columns should have aria-sort=none
      expect(screen.getByRole("columnheader", { name: /Driver/ })).toHaveAttribute(
        "aria-sort",
        "none"
      );
    });

    it("non-sortable column does not have aria-sort", () => {
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      expect(screen.getByRole("columnheader", { name: "Team" })).not.toHaveAttribute(
        "aria-sort"
      );
    });

    it("activates sort via keyboard Enter on sortable header", async () => {
      const user = userEvent.setup();
      render(<Table columns={columns} data={data} rowKey={(r) => r.name} />);
      const header = screen.getByRole("columnheader", { name: /Driver/ });
      header.focus();
      await user.keyboard("{Enter}");
      expect(header).toHaveAttribute("aria-sort", "ascending");
    });
  });

  describe("density", () => {
    it("applies compact density class", () => {
      const { container } = render(
        <Table columns={columns} data={data} rowKey={(r) => r.name} density="compact" />
      );
      expect(container.querySelector("table")?.className).toMatch(/compact/);
    });

    it("applies spacious density class", () => {
      const { container } = render(
        <Table columns={columns} data={data} rowKey={(r) => r.name} density="spacious" />
      );
      expect(container.querySelector("table")?.className).toMatch(/spacious/);
    });
  });

  describe("striped", () => {
    it("applies striped class to tbody when striped=true", () => {
      const { container } = render(
        <Table columns={columns} data={data} rowKey={(r) => r.name} striped />
      );
      expect(container.querySelector("tbody")?.className).toMatch(/striped/);
    });

    it("does not apply striped class by default", () => {
      const { container } = render(
        <Table columns={columns} data={data} rowKey={(r) => r.name} />
      );
      expect(container.querySelector("tbody")?.className ?? "").not.toMatch(/striped/);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Table ref={ref} columns={columns} data={data} rowKey={(r) => r.name} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
