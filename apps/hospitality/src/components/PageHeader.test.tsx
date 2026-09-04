import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PageHeader } from "./PageHeader.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  // Renders the `as` tag and forwards tabIndex, the two things rialto's Text does that PageHeader relies on.
  Text: ({
    children,
    as = "span",
    tabIndex,
    ...props
  }: {
    children: React.ReactNode;
    as?: keyof React.JSX.IntrinsicElements;
    tabIndex?: number;
    variant?: string;
    color?: string;
  }) => {
    const Tag = as;
    return (
      <Tag
        data-testid="text"
        data-as={as}
        data-variant={props.variant}
        data-color={props.color}
        tabIndex={tabIndex}
      >
        {children}
      </Tag>
    );
  },
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

  it("renders the title as the page's only h1, focusable programmatically via tabIndex=-1", () => {
    const { container } = render(<PageHeader title="Timeline" description="Tonight" />);

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    const h1 = headings[0] as HTMLHeadingElement;
    expect(h1).toHaveTextContent("Timeline");
    expect(h1).toHaveAttribute("tabindex", "-1");

    h1.focus();
    expect(document.activeElement).toBe(h1);
  });
});
