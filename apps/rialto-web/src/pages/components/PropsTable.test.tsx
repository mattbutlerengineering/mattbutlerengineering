/* eslint-disable @typescript-eslint/no-explicit-any, mbe-local/prefer-rialto-components */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PropsTable, type PropDef } from "./PropsTable.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Table: ({ columns, data, rowKey }: any) => (
    <table data-testid="props-table">
      <thead>
        <tr>
          {columns.map((col: any) => (
            <th key={col.key}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row: any) => (
          <tr key={rowKey(row)}>
            {columns.map((col: any) => (
              <td key={col.key}>
                {col.render ? col.render(row) : (row[col.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const MOCK_PROPS: PropDef[] = [
  {
    name: "variant",
    type: '"solid" | "outline" | "ghost"',
    default: '"solid"',
    description: "The visual variant of the button",
  },
  {
    name: "size",
    type: '"sm" | "md" | "lg"',
    default: '"md"',
    description: "The size of the button",
  },
  {
    name: "disabled",
    type: "boolean",
    description: "Whether the button is disabled",
  },
];

describe("PropsTable", () => {
  it("renders a table with correct headers", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    expect(screen.getByText("Prop")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("renders prop names as code elements", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    expect(screen.getByText("variant")).toBeInTheDocument();
    expect(screen.getByText("size")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("renders prop types", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    expect(screen.getByText('"solid" | "outline" | "ghost"')).toBeInTheDocument();
    expect(screen.getByText('"sm" | "md" | "lg"')).toBeInTheDocument();
    expect(screen.getByText("boolean")).toBeInTheDocument();
  });

  it("renders default values when present", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    expect(screen.getByText('"solid"')).toBeInTheDocument();
    expect(screen.getByText('"md"')).toBeInTheDocument();
  });

  it("renders dash for missing defaults", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    // The disabled prop has no default, should render a dash
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders descriptions", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    expect(screen.getByText("The visual variant of the button")).toBeInTheDocument();
    expect(screen.getByText("The size of the button")).toBeInTheDocument();
    expect(screen.getByText("Whether the button is disabled")).toBeInTheDocument();
  });

  it("renders correct number of rows", () => {
    render(<PropsTable props={MOCK_PROPS} />);

    const table = screen.getByTestId("props-table");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBe(3);
  });

  it("handles empty props array", () => {
    render(<PropsTable props={[]} />);

    const table = screen.getByTestId("props-table");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBe(0);
  });
});
