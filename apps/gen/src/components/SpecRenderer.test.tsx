/**
 * @vitest-environment jsdom
 *
 * Renders through the real catalog registry. jsdom unit tests of the seam
 * never walked an element flatToTree had left unreachable, which is what the
 * live preview did for a users DataTable.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Spec } from "@json-render/react";
import { SpecProvider, SpecRenderer } from "./SpecRenderer.js";

const usersTable = {
  type: "DataTable",
  props: {
    label: "Users",
    columns: [
      { key: "name", header: "Name" },
      { key: "email", header: "Email" },
    ],
    data: [{ name: "Ada Lovelace", email: "ada@example.com" }],
  },
  children: [] as string[],
  visible: { $state: "/loaded" },
};

describe("SpecRenderer", () => {
  it("shows a DataTable that was left out of the tree and gated on missing state", () => {
    const spec = {
      root: "stack",
      elements: {
        stack: { type: "Stack", props: { direction: "column", gap: "md" }, children: ["title"] },
        title: { type: "Text", props: { children: "Users" }, children: [] },
        table: usersTable,
      },
    } as Spec;

    render(
      <SpecProvider>
        <SpecRenderer spec={spec} />
      </SpecProvider>
    );

    expect(screen.getByText("Users")).toBeDefined();
    expect(document.querySelector("table")).not.toBeNull();
    expect(screen.getByText("Ada Lovelace")).toBeDefined();
    expect(screen.queryByText("Component could not be displayed")).toBeNull();
  });
});
