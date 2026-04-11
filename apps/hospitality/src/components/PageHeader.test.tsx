import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader.js";

vi.mock("@mbe/rialto", () => ({
  Text: ({ children, ...props }: { children: React.ReactNode; as?: string; variant?: string; color?: string }) => (
    <div data-testid="text" data-as={props.as} data-variant={props.variant} data-color={props.color}>
      {children}
    </div>
  ),
  Stack: ({ children }: { children: React.ReactNode; gap?: string }) => (
    <div data-testid="stack" data-gap={gap}>{children}</div>
  ),
}));

describe("PageHeader", () => {
  it("should render the title", () => {
    render(<PageHeader title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeDefined();
  });

  it("should render title with display variant", () => {
    render(<PageHeader title="Test Title" />);
    const text = screen.getByTestId("text");
    expect(text.getAttribute("data-variant")).toBe("display");
    expect(text.getAttribute("data-color")).toBe("primary");
  });

  it("should render description when provided", () => {
    render(<PageHeader title="Test Title" description="Test description" />);
    expect(screen.getByText("Test description")).toBeDefined();
  });

  it("should not render description when not provided", () => {
    render(<PageHeader title="Test Title" />);
    const texts = screen.getAllByTestId("text");
    expect(texts).toHaveLength(1);
  });

  it("should render description with caption variant", () => {
    render(<PageHeader title="Test Title" description="Test description" />);
    const texts = screen.getAllByTestId("text");
    const description = texts.find((t) => t.getAttribute("data-variant") === "caption");
    expect(description).toBeDefined();
    expect(description?.getAttribute("data-color")).toBe("secondary");
  });
});