import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import { ErrorServerExamplePage } from "./ErrorServerExamplePage.js";

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

describe("ErrorServerExamplePage", () => {
  it("renders the showcase header with page name and description", () => {
    render(<ErrorServerExamplePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Error 500" })).toBeInTheDocument();
    expect(screen.getByText("Server-error page with a retry CTA")).toBeInTheDocument();
  });

  it("renders the 500 status code and error heading", () => {
    render(<ErrorServerExamplePage />);
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Something went wrong" })
    ).toBeInTheDocument();
  });

  it("renders supporting copy explaining the error", () => {
    render(<ErrorServerExamplePage />);
    expect(screen.getByText(/An unexpected error occurred on our end/)).toBeInTheDocument();
  });

  it("offers a primary retry CTA and a ghost back-home escape hatch", () => {
    render(<ErrorServerExamplePage />);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("data-variant", "primary");
    const home = screen.getByRole("button", { name: "Back to home" });
    expect(home).toHaveAttribute("data-variant", "ghost");
  });
});
