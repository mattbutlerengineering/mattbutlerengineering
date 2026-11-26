import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BASE_TITLE } from "../../document-title.js";
import { CompositionNote, ExamplePageLayout, StatePanel } from "./ExamplePageLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({
    children,
    color,
    as: Tag = "span",
  }: {
    children: React.ReactNode;
    color?: string;
    as?: keyof HTMLElementTagNameMap;
  }) => <Tag data-color={color}>{children}</Tag>,
  Button: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  Stack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Divider: () => <hr />,
}));

describe("CompositionNote", () => {
  it("does not render a complementary landmark (axe landmark-unique when repeated)", () => {
    render(
      <>
        <CompositionNote>one</CompositionNote>
        <CompositionNote>two</CompositionNote>
        <CompositionNote>three</CompositionNote>
      </>
    );
    expect(screen.queryAllByRole("complementary")).toHaveLength(0);
    expect(screen.getAllByRole("note")).toHaveLength(3);
  });
});

describe("ExamplePageLayout document title", () => {
  afterEach(() => {
    document.title = BASE_TITLE;
  });

  it("sets the tab title from the visible heading", () => {
    render(
      <ExamplePageLayout name="Invoice" description="A bill" sourceJsx="<Invoice />">
        body
      </ExamplePageLayout>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Invoice" })).toBeTruthy();
    expect(document.title).toBe("Invoice — Rialto");
  });

  it("restores the design-system title on unmount", () => {
    const { unmount } = render(
      <ExamplePageLayout name="Checkout" description="Pay" sourceJsx="<Checkout />">
        body
      </ExamplePageLayout>
    );
    unmount();
    expect(document.title).toBe(BASE_TITLE);
  });
});

describe("StatePanel", () => {
  it("labels the panel in primary text, not tertiary or secondary (axe color-contrast on the matte strip, #7187)", () => {
    render(<StatePanel label="Default">content</StatePanel>);
    expect(screen.getByText("Default").getAttribute("data-color")).toBe("primary");
  });
});
