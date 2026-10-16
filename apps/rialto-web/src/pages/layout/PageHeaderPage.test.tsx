import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PageHeaderPage } from "./PageHeaderPage.js";

// The real package resolves to an unbuilt dist in worktrees, so — like every
// other app page test — we stub it. PageHeader renders a real <nav> named by
// `breadcrumbLabel` so the landmark assertion exercises the same accessible-name
// contract axe checks against the live page.
vi.mock("@mattbutlerengineering/rialto", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Inline = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
  const PageHeader = ({
    title,
    breadcrumbs,
    breadcrumbLabel,
    children,
  }: {
    title: string;
    breadcrumbs?: unknown[];
    breadcrumbLabel?: string;
    children?: ReactNode;
  }) => (
    <header>
      {breadcrumbs ? <nav aria-label={breadcrumbLabel ?? "Breadcrumb"} /> : null}
      <h1>{title}</h1>
      {children}
    </header>
  );
  const Checkbox = ({ label }: { label: string }) => <label>{label}</label>;
  return {
    Badge: Inline,
    Button: Inline,
    Card: Passthrough,
    Checkbox,
    DataList: () => <dl />,
    Divider: () => <hr />,
    PageHeader,
    Stack: Passthrough,
    Text: Inline,
  };
});

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => <table />,
}));

describe("PageHeaderPage — landmarks", () => {
  // axe landmark-unique: every demo header's breadcrumb is a nav landmark, so each needs its own name.
  it("gives every demo breadcrumb a unique nav name", () => {
    render(<PageHeaderPage />);
    const names = screen.getAllByRole("navigation").map((el) => el.getAttribute("aria-label"));
    expect(names.length).toBeGreaterThan(1);
    expect(names).not.toContain("Breadcrumb");
    expect(new Set(names).size).toBe(names.length);
  });
});
