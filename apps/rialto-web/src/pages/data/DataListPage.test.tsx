import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { DataListPage } from "./DataListPage.js";

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const DataList = ({
    orientation,
    items,
  }: {
    orientation?: string;
    items: { label: string }[];
  }) => <dl data-orientation={orientation ?? "unset"} data-first={items[0]?.label} />;
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Select = () => <div />;
  const Checkbox = () => <div />;
  return { Text, DataList, Stack, Divider, Select, Checkbox };
});

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => <table />,
}));

describe("DataListPage orientation demos", () => {
  it("stacks the Vertical demo the same way the playground starts", () => {
    const { container } = render(<DataListPage />);
    const engines = container.querySelectorAll('dl[data-first="Engine"]');
    // The section demo and the playground (its initial orientation).
    expect(engines).toHaveLength(2);
    for (const list of engines) {
      expect(list).toHaveAttribute("data-orientation", "vertical");
    }
  });

  it("keeps the striped demo and the spec card on the horizontal axis", () => {
    const { container } = render(<DataListPage />);
    expect(container.querySelector('dl[data-first="Session"]')).toHaveAttribute(
      "data-orientation",
      "horizontal"
    );
    expect(container.querySelector('dl[data-first="Chassis"]')).toHaveAttribute(
      "data-orientation",
      "unset"
    );
    expect(screen.getByRole("heading", { name: "Vertical (default)" })).toBeInTheDocument();
  });
});
