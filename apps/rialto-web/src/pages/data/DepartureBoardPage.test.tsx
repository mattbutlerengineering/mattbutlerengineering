import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { DepartureBoardPage } from "./DepartureBoardPage.js";

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({ as, children }: { as?: ElementType; children?: ReactNode }) => {
    const Tag = as ?? "p";
    return <Tag>{children}</Tag>;
  };
  const Stack = ({ align, children }: { align?: string; children?: ReactNode }) => (
    <div data-align={align ?? "stretch"}>{children}</div>
  );
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <hr />;
  const DepartureBoard = ({
    size,
    phrases,
    style,
  }: {
    size?: string;
    phrases: string[];
    style?: CSSProperties;
  }) => (
    <div
      data-testid={`board-${size ?? "lg"}`}
      data-justify={style?.justifyContent ?? ""}
      role="img"
      aria-label={phrases[0]}
    />
  );
  return { Text, Stack, Card, Divider, DepartureBoard };
});

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => <table />,
}));

function section(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const root = heading.parentElement;
  if (!root) throw new Error(`section ${title} has no parent`);
  return root;
}

describe("DepartureBoardPage sizes", () => {
  it("gives each size a stretched frame so the flap row stays readable", () => {
    render(<DepartureBoardPage />);
    const sizes = section("Sizes");
    const stacks = sizes.querySelectorAll("[data-align]");
    expect(stacks[0]).toHaveAttribute("data-align", "stretch");
    for (const size of ["sm", "md", "lg"]) {
      const board = within(sizes).getByTestId(`board-${size}`);
      expect(board).toHaveAttribute("aria-label", "FAST BY DEFAULT");
      expect(board).toHaveAttribute("data-justify", "flex-start");
    }
  });

  it("leaves the timing demos start-aligned", () => {
    render(<DepartureBoardPage />);
    const timing = section("Configurable Timing");
    expect(timing.querySelector("[data-align]")).toHaveAttribute("data-align", "start");
  });
});
