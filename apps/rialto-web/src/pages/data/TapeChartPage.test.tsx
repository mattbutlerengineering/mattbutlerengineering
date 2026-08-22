import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { TapeChartPage } from "./TapeChartPage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in worktrees, so — like every
// other app page test — we stub it. Card passes `data-testid` through (the
// page relies on CardProps extending HTMLAttributes) and the TapeChart stub
// reports the two props this section is about: how many reservations it got
// and whether a classifier was supplied. Rendering is proved by Playwright.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Card = ({
    children,
    variant,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & { variant?: string }) => (
    <div data-variant={variant} {...rest}>
      {children}
    </div>
  );
  const SegmentedControl = () => <div />;
  const TapeChart = ({
    reservations,
    classifyOverlap,
  }: {
    reservations: unknown[];
    classifyOverlap?: unknown;
  }) => (
    <div
      data-testid="tapechart-stub"
      data-reservations={reservations.length}
      data-classifier={String(typeof classifyOverlap === "function")}
    />
  );
  return { Text, Stack, Divider, Card, SegmentedControl, TapeChart };
});

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => <table />,
}));

describe("TapeChartPage — Overlaps section", () => {
  it("renders the default and classified overlap charts over the same fixture", () => {
    render(<TapeChartPage />);

    const defaultChart = within(screen.getByTestId("tape-chart-overlaps-default")).getByTestId(
      "tapechart-stub"
    );
    expect(defaultChart).toHaveAttribute("data-reservations", "9");
    expect(defaultChart).toHaveAttribute("data-classifier", "false");

    const classifiedChart = within(
      screen.getByTestId("tape-chart-overlaps-classified")
    ).getByTestId("tapechart-stub");
    expect(classifiedChart).toHaveAttribute("data-reservations", "9");
    expect(classifiedChart).toHaveAttribute("data-classifier", "true");
  });

  it("shows the classifier usage as code", () => {
    render(<TapeChartPage />);
    expect(screen.getByText(/classifyOverlap = \(a, _b\) =>/)).toBeInTheDocument();
  });
});
