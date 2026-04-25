import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import { Table } from "../../components/Table/Table";
import { DataList } from "../../components/DataList/DataList";

describe("Accessibility — Data Display Components", () => {
  it("Table", async () => {
    const { container } = render(
      <Table
        columns={[{ header: "Name", key: "name" }, { header: "Age", key: "age" }]}
        data={[{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]}
        rowKey={(r) => r.name}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("DataList", async () => {
    const { container } = render(
      <DataList
        items={[
          { label: "Name", value: "Rialto" },
          { label: "Version", value: "0.1.0" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
