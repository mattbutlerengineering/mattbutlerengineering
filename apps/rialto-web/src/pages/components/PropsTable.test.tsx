/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PropsTable, type PropDef } from "./PropsTable.js";

vi.mock("@mattbutlerengineering/rialto/manifest", () => ({
  default: {
    version: "0.2.0",
    generatedAt: "2026-06-19T00:00:00.000Z",
    components: [
      {
        name: "Button",
        description: "A button component.",
        props: [
          {
            name: "variant",
            type: '"primary" | "secondary" | undefined',
            required: false,
            description: "Visual style.",
          },
          { name: "disabled", type: "boolean | undefined", required: false },
        ],
        slots: [],
      },
    ],
  },
}));

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
              <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? "")}</td>
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

  it("reads props from manifest when component prop is provided", () => {
    render(<PropsTable component="Button" />);

    const table = screen.getByTestId("props-table");
    const rows = table.querySelectorAll("tbody tr");
    // Mock manifest has 2 props for Button
    expect(rows.length).toBe(2);
    expect(screen.getByText("variant")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("strips | undefined from types read from manifest", () => {
    render(<PropsTable component="Button" />);

    // The mock manifest type is '"primary" | "secondary" | undefined' — should be stripped
    expect(screen.queryByText(/\| undefined/)).toBeNull();
    expect(screen.getByText('"primary" | "secondary"')).toBeInTheDocument();
  });
});
