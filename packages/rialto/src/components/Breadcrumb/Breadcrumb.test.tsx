/**
 * Unit tests for the Breadcrumb component.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Breadcrumb } from "./Breadcrumb";

const user = userEvent.setup();

const items = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Widget" },
];

describe("Breadcrumb", () => {
  it("renders all items", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
  });

  it("has navigation landmark", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it("renders links for items with href", () => {
    render(<Breadcrumb items={items} />);
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("href", "/");
    const productsLink = screen.getByRole("link", { name: /products/i });
    expect(productsLink).toHaveAttribute("href", "/products");
  });

  it("renders last item as current page (no link)", () => {
    render(<Breadcrumb items={items} />);
    const current = screen.getByText("Widget").closest("[aria-current='page']");
    expect(current).toBeInTheDocument();
    // Not rendered as a link
    expect(screen.queryByRole("link", { name: /widget/i })).not.toBeInTheDocument();
  });

  it("marks last item with aria-current=page", () => {
    render(<Breadcrumb items={items} />);
    const span = screen.getByText("Widget");
    expect(span).toHaveAttribute("aria-current", "page");
  });

  it("calls onClick handler when provided", async () => {
    const onClick = vi.fn();
    render(
      <Breadcrumb
        items={[
          { label: "Home", href: "/", onClick },
          { label: "Current" },
        ]}
      />
    );
    await user.click(screen.getByRole("link", { name: /home/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders button when onClick but no href (not last item)", () => {
    const onClick = vi.fn();
    render(
      <Breadcrumb
        items={[
          { label: "Home", onClick },
          { label: "Current" },
        ]}
      />
    );
    const homeBtn = screen.getByRole("button", { name: /home/i });
    expect(homeBtn).toBeInTheDocument();
  });

  it("calls onClick on button-style breadcrumb item", async () => {
    const onClick = vi.fn();
    render(
      <Breadcrumb
        items={[
          { label: "Home", onClick },
          { label: "Current" },
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /home/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("collapses middle items when maxItems is set", () => {
    const manyItems = [
      { label: "Home", href: "/" },
      { label: "Category", href: "/cat" },
      { label: "Subcategory", href: "/cat/sub" },
      { label: "Product", href: "/cat/sub/prod" },
      { label: "Current" },
    ];
    render(<Breadcrumb items={manyItems} maxItems={3} />);
    // Should show Home, ellipsis, then last 2: Product and Current
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
    expect(screen.queryByText("Subcategory")).not.toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("shows all items when count <= maxItems", () => {
    render(<Breadcrumb items={items} maxItems={5} />);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
  });

  it("renders custom separator", () => {
    render(<Breadcrumb items={items} separator={<span>/</span>} />);
    const separators = screen.getAllByText("/");
    expect(separators.length).toBe(2); // between 3 items = 2 separators
  });

  it("renders icons when provided", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Home", href: "/", icon: <span data-testid="home-icon">🏠</span> },
          { label: "Current" },
        ]}
      />
    );
    expect(screen.getByTestId("home-icon")).toBeInTheDocument();
  });

  it("renders single-item breadcrumb as current page", () => {
    render(<Breadcrumb items={[{ label: "Home" }]} />);
    const current = screen.getByText("Home");
    expect(current).toHaveAttribute("aria-current", "page");
  });
});
