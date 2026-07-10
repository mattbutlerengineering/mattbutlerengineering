import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { ErrorNotFoundExamplePage } from "./ErrorNotFoundExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: Text honors the `as` element (headings stay headings), Button
// exposes its variant for primary-CTA checks, and Input associates its label
// with the control so getByLabelText works.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const Button = ({
    children,
    variant = "secondary",
    onClick,
  }: {
    children?: ReactNode;
    variant?: string;
    onClick?: () => void;
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  );
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Input = ({
    label,
    placeholder,
    type,
  }: {
    label?: string;
    placeholder?: string;
    type?: string;
  }) => (
    <label>
      {label}
      <input type={type ?? "text"} placeholder={placeholder} />
    </label>
  );
  return { Text, Button, Stack, Divider, Input };
});

describe("ErrorNotFoundExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<ErrorNotFoundExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Error 404" })).toBeInTheDocument();
    expect(screen.getByText("Not-found page with back-home and search CTAs")).toBeInTheDocument();
  });

  it("renders the 404 status code and error heading", () => {
    render(<ErrorNotFoundExamplePage />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Page not found" })).toBeInTheDocument();
  });

  it("renders supporting copy explaining the error", () => {
    render(<ErrorNotFoundExamplePage />);
    expect(
      screen.getByText(/The page you’re looking for doesn’t exist or has been moved/)
    ).toBeInTheDocument();
  });

  it("offers a primary back-home CTA", () => {
    render(<ErrorNotFoundExamplePage />);
    const cta = screen.getByRole("button", { name: "Back to home" });
    expect(cta).toHaveAttribute("data-variant", "primary");
  });

  it("offers a search fallback with a labeled field inside a search landmark", () => {
    render(<ErrorNotFoundExamplePage />);
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByLabelText("Search the site")).toBeInTheDocument();
    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton).toHaveAttribute("data-variant", "secondary");
  });
});
