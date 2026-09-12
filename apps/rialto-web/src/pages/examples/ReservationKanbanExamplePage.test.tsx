import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { ElementType, ReactNode } from "react";
import {
  ReservationKanbanExamplePage,
  KANBAN_CARDS,
  STAGES,
  nextStageId,
  moveCardToNextStage,
  cardsByStage,
} from "./ReservationKanbanExamplePage.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. Stubs are thin passthroughs that preserve the
// semantics assertions depend on (Text honors `as`, Button forwards onClick,
// Badge exposes its text content).
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "span";
    return <Tag>{children}</Tag>;
  };
  const Button = ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  );
  const Badge = ({ children }: { children?: ReactNode }) => (
    <span data-testid="badge">{children}</span>
  );
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  return { Text, Button, Badge, Card, Stack, Divider };
});

// ---------------------------------------------------------------------------
// Pure logic — no components involved
// ---------------------------------------------------------------------------

describe("ReservationKanbanExamplePage — pure helpers", () => {
  it("defines exactly the three lifecycle stages in order", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["pre-arrival", "in-progress", "checkout"]);
  });

  it("provides a fixture spanning all three stages", () => {
    for (const stage of STAGES) {
      expect(cardsByStage(KANBAN_CARDS, stage.id).length).toBeGreaterThan(0);
    }
    expect(new Set(KANBAN_CARDS.map((c) => c.id)).size).toBe(KANBAN_CARDS.length);
  });

  it("nextStageId advances through the pipeline and returns null after the last stage", () => {
    expect(nextStageId("pre-arrival")).toBe("in-progress");
    expect(nextStageId("in-progress")).toBe("checkout");
    expect(nextStageId("checkout")).toBeNull();
  });

  it("moveCardToNextStage returns a new array and advances only the target card", () => {
    const target = KANBAN_CARDS.find((c) => c.stage === "pre-arrival")!;
    const result = moveCardToNextStage(KANBAN_CARDS, target.id);
    expect(result).not.toBe(KANBAN_CARDS);
    expect(result.find((c) => c.id === target.id)?.stage).toBe("in-progress");
    // Everything else is unchanged.
    const others = result.filter((c) => c.id !== target.id);
    const originalOthers = KANBAN_CARDS.filter((c) => c.id !== target.id);
    expect(others).toEqual(originalOthers);
  });

  it("moveCardToNextStage leaves a checkout card unchanged", () => {
    const target = KANBAN_CARDS.find((c) => c.stage === "checkout")!;
    const result = moveCardToNextStage(KANBAN_CARDS, target.id);
    expect(result.find((c) => c.id === target.id)?.stage).toBe("checkout");
  });
});

// ---------------------------------------------------------------------------
// Composition — page wiring through behavioral component stubs
// ---------------------------------------------------------------------------

describe("ReservationKanbanExamplePage — composition", () => {
  it("renders the three lifecycle columns", () => {
    render(<ReservationKanbanExamplePage />);
    for (const stage of STAGES) {
      expect(screen.getByLabelText(stage.label)).toBeInTheDocument();
    }
  });

  it("places each fixture card under its starting column", () => {
    render(<ReservationKanbanExamplePage />);
    for (const stage of STAGES) {
      const column = screen.getByLabelText(stage.label);
      for (const card of cardsByStage(KANBAN_CARDS, stage.id)) {
        expect(within(column).getByText(card.guest)).toBeInTheDocument();
      }
    }
  });

  it("moving a card between columns via the click action removes it from the old column and adds it to the next", () => {
    render(<ReservationKanbanExamplePage />);
    const target = KANBAN_CARDS.find((c) => c.stage === "pre-arrival")!;

    const preArrivalColumn = screen.getByLabelText("Pre-Arrival");
    expect(within(preArrivalColumn).getByText(target.guest)).toBeInTheDocument();

    const moveButton = within(preArrivalColumn).getByRole("button", {
      name: `Move ${target.guest} to next stage`,
    });
    fireEvent.click(moveButton);

    expect(within(preArrivalColumn).queryByText(target.guest)).not.toBeInTheDocument();
    const inProgressColumn = screen.getByLabelText("In Progress");
    expect(within(inProgressColumn).getByText(target.guest)).toBeInTheDocument();
  });

  it("cards already in the last column have no move action", () => {
    render(<ReservationKanbanExamplePage />);
    const checkoutColumn = screen.getByLabelText("Checkout");
    const target = cardsByStage(KANBAN_CARDS, "checkout")[0]!;
    expect(
      within(checkoutColumn).queryByRole("button", {
        name: `Move ${target.guest} to next stage`,
      })
    ).not.toBeInTheDocument();
  });
});
