import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PaginationPage } from "./PaginationPage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in worktrees, so — like every
// other app page test — we stub it. Pagination renders a real <nav> so the
// landmark-uniqueness assertion below exercises the same accessible-name
// contract axe checks against the live page.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const DataList = () => <dl />;
  const Pagination = ({
    page,
    totalPages,
    ariaLabel,
  }: {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
    ariaLabel?: string;
  }) => (
    <nav aria-label={ariaLabel ?? "Pagination"}>
      page {page} of {totalPages}
    </nav>
  );
  return { Text, Stack, Divider, DataList, Pagination };
});

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => <table />,
}));

describe("PaginationPage — landmarks", () => {
  // axe landmark-unique: every demo Pagination is a nav landmark, so each needs its own name.
  it("gives every demo pagination control a unique nav name", () => {
    render(<PaginationPage />);
    const names = screen.getAllByRole("navigation").map((el) => el.getAttribute("aria-label"));
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });
});
