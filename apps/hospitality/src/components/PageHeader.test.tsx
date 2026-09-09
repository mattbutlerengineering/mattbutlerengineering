import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PageHeader } from "./PageHeader.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    as?: string;
    variant?: string;
    color?: string;
  }) => (
    <div
      data-testid="text"
      data-as={props.as}
      data-variant={props.variant}
      data-color={props.color}
    >
      {children}
    </div>
  ),
  Stack: ({ children }: { children: React.ReactNode }) => <div data-testid="stack">{children}</div>,
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

  it("renders the aside at the inline-end when provided", () => {
    const { container } = render(<PageHeader title="Dashboard" aside={<span>Sign</span>} />);
    const aside = container.querySelector(".aside");
    expect(aside).not.toBeNull();
    expect(aside?.contains(screen.getByText("Sign"))).toBe(true);
    expect(container.firstElementChild?.classList.contains("withAside")).toBe(true);
  });

  it("adds no aside wrapper when omitted", () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(container.querySelector(".aside")).toBeNull();
    expect(container.querySelector(".withAside")).toBeNull();
  });
});
