import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import { NodeInspector } from "./NodeInspector.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: { data: { components: { Stack: { description: "Lays out children in a line." } } } },
}));

vi.mock("./NodeInspector.module.css", () => ({ default: {} }));

const SPEC: Spec = {
  root: "root",
  elements: {
    root: { type: "Stack", props: {}, children: ["card"] },
    card: { type: "Stack", props: { gap: "md" }, children: ["label", "mystery"] },
    label: { type: "Stack", props: { text: "Hello" }, children: [] },
    mystery: { type: "Unknown", props: {}, children: [] },
  },
};

describe("NodeInspector", () => {
  it("shows type, description, props, child count and subtree size", () => {
    render(<NodeInspector spec={SPEC} selectedKey="card" onSelectNode={vi.fn()} />);
    expect(screen.getByRole("complementary", { name: "Selected component" })).toBeDefined();
    expect(screen.getByText("Lays out children in a line.")).toBeDefined();
    expect(screen.getByText("2 direct children · 3 in subtree")).toBeDefined();
    expect(screen.getByLabelText("Props").textContent).toContain('"gap": "md"');
  });

  it("reselects an ancestor from the breadcrumb", () => {
    const onSelectNode = vi.fn();
    render(<NodeInspector spec={SPEC} selectedKey="label" onSelectNode={onSelectNode} />);
    const crumbs = screen.getAllByRole("button");
    expect(crumbs).toHaveLength(2);
    fireEvent.click(crumbs[1]!);
    expect(onSelectNode).toHaveBeenCalledWith("card");
  });

  it("notes a type missing from the catalog instead of crashing", () => {
    render(<NodeInspector spec={SPEC} selectedKey="mystery" onSelectNode={vi.fn()} />);
    expect(screen.getByText("Not in catalog.")).toBeDefined();
  });

  it("renders nothing for a key that is not in the spec", () => {
    const { container } = render(
      <NodeInspector spec={SPEC} selectedKey="gone" onSelectNode={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });
});
