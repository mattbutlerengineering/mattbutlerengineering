import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompositionNote, StatePanel } from "./ExamplePageLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <span data-color={color}>{children}</span>
  ),
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

describe("StatePanel", () => {
  it("labels the panel in primary text, not tertiary or secondary (axe color-contrast on the matte strip, #7187)", () => {
    render(<StatePanel label="Default">content</StatePanel>);
    expect(screen.getByText("Default").getAttribute("data-color")).toBe("primary");
  });
});
