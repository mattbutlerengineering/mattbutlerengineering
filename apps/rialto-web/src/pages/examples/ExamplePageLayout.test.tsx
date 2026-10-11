import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompositionNote } from "./ExamplePageLayout.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
