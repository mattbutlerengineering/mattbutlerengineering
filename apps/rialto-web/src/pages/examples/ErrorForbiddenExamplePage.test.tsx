import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { ErrorForbiddenExamplePage } from "./ErrorForbiddenExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The stubs preserve the semantics the assertions
// depend on: Text honors the `as` element (headings stay headings) and Button
// exposes its variant for primary-CTA checks.
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
  return { Text, Button, Stack, Divider };
});

describe("ErrorForbiddenExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<ErrorForbiddenExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Error 403" })).toBeInTheDocument();
    expect(
      screen.getByText("Forbidden page with sign-in and contact-support CTAs")
    ).toBeInTheDocument();
  });

  it("renders the 403 status code and error heading", () => {
    render(<ErrorForbiddenExamplePage />);
    expect(screen.getByText("403")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Access denied" })).toBeInTheDocument();
  });

  it("renders supporting copy explaining the error", () => {
    render(<ErrorForbiddenExamplePage />);
    expect(screen.getByText(/You don’t have permission to view this page/)).toBeInTheDocument();
  });

  it("offers a primary sign-in CTA and a secondary contact CTA", () => {
    render(<ErrorForbiddenExamplePage />);
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect(signIn).toHaveAttribute("data-variant", "primary");
    const contact = screen.getByRole("button", { name: "Contact support" });
    expect(contact).toHaveAttribute("data-variant", "secondary");
  });
});
