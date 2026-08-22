import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { TapeChartPage } from "./TapeChartPage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in worktrees, so — like every
// other app page test — we stub it. Card passes `data-testid` through (the
// page relies on CardProps extending HTMLAttributes) and the TapeChart stub
// reports the props this section is about: how many reservations it got,
// whether a classifier was supplied and which bar it was told to highlight.
// It renders one button per reservation so selection can be driven the way a
// user drives it. Rendering itself is proved by Playwright.
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
    onReservationClick,
    selectedReservationId,
  }: {
    reservations: { id: string; guestName?: string }[];
    classifyOverlap?: unknown;
    onReservationClick?: (r: { id: string; guestName?: string }) => void;
    selectedReservationId?: string | null;
  }) => (
    <div
      data-testid="tapechart-stub"
      data-reservations={reservations.length}
      data-classifier={String(typeof classifyOverlap === "function")}
      data-selected={selectedReservationId ?? ""}
    >
      {reservations.map((r) => (
        <button key={r.id} type="button" onClick={() => onReservationClick?.(r)}>
          {r.guestName ?? r.id}
        </button>
      ))}
    </div>
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

  // The default chart draws every overlap red because it gets no classifier, so
  // its card must read the same rule back — a dorm bunk there is a conflict.
  it("reads the default chart's dorm bar back under the default all-conflict rule", async () => {
    const user = userEvent.setup();
    render(<TapeChartPage />);

    const defaultChart = screen.getByTestId("tape-chart-overlaps-default");
    await user.click(within(defaultChart).getByRole("button", { name: "Oscar Delacroix" }));

    const card = screen.getByTestId("tape-chart-overlaps-selection-default");
    expect(card).toHaveTextContent("Oscar Delacroix");
    expect(card).toHaveTextContent("Double-booked");
    expect(card).not.toHaveTextContent("Shared occupancy");
  });

  it("reads the classified chart's dorm bar back under the dorm rule", async () => {
    const user = userEvent.setup();
    render(<TapeChartPage />);

    const classifiedChart = screen.getByTestId("tape-chart-overlaps-classified");
    await user.click(within(classifiedChart).getByRole("button", { name: "Oscar Delacroix" }));

    const card = screen.getByTestId("tape-chart-overlaps-selection-classified");
    expect(card).toHaveTextContent("Oscar Delacroix");
    expect(card).toHaveTextContent("Shared occupancy");
  });

  it("keeps a private-room conflict a conflict under both rules", async () => {
    const user = userEvent.setup();
    render(<TapeChartPage />);

    const classifiedChart = screen.getByTestId("tape-chart-overlaps-classified");
    await user.click(within(classifiedChart).getByRole("button", { name: "Marisol Vega" }));

    expect(screen.getByTestId("tape-chart-overlaps-selection-classified")).toHaveTextContent(
      "Double-booked"
    );
  });

  it("does not select in one chart when the other is clicked", async () => {
    const user = userEvent.setup();
    render(<TapeChartPage />);

    const defaultChart = screen.getByTestId("tape-chart-overlaps-default");
    await user.click(within(defaultChart).getByRole("button", { name: "Marisol Vega" }));

    expect(screen.getByTestId("tape-chart-overlaps-selection-default")).toHaveTextContent(
      "Marisol Vega"
    );
    expect(screen.queryByTestId("tape-chart-overlaps-selection-classified")).toBeNull();
    expect(within(defaultChart).getByTestId("tapechart-stub")).toHaveAttribute(
      "data-selected",
      "ov-a"
    );
    expect(
      within(screen.getByTestId("tape-chart-overlaps-classified")).getByTestId("tapechart-stub")
    ).toHaveAttribute("data-selected", "");
  });
});
