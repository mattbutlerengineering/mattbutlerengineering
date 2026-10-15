/**
 * Table / DataTable adapters must supply row identity (a JSON spec cannot carry
 * a rowKey function): row.id ?? index.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Renderer, JSONUIProvider } from "@json-render/react";
import { registry } from "../registry.js";

function renderSpec(spec: Parameters<typeof Renderer>[0]["spec"]) {
  return render(
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

const columns = [{ key: "name", header: "Name" }];

function tableSpec(type: "Table" | "DataTable", extra: Record<string, unknown>, data: unknown[]) {
  return {
    root: "t1",
    elements: { t1: { type, props: { columns, data, ...extra }, children: [] } },
  };
}

describe("Table adapter", () => {
  it("renders a row without throwing (no rowKey in a JSON spec)", () => {
    renderSpec(tableSpec("Table", {}, [{ name: "Ada" }]));
    expect(screen.getByText("Ada")).toBeDefined();
  });
});

describe("DataTable adapter", () => {
  it("selecting one row without an id column selects only that row", () => {
    renderSpec(
      tableSpec("DataTable", { selectionMode: "multiple", label: "People" }, [
        { name: "Ada" },
        { name: "Grace" },
      ])
    );
    const rowBoxes = screen.getAllByRole("checkbox").slice(1);
    expect(rowBoxes).toHaveLength(2);
    fireEvent.click(rowBoxes[0] as HTMLElement);
    const after = screen.getAllByRole("checkbox").slice(1) as HTMLInputElement[];
    expect(after.map((b) => b.checked)).toEqual([true, false]);
  });
});
