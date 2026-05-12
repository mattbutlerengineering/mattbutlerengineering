import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeeklyIntakePage } from "./WeeklyIntakePage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children }: any) => <p>{children}</p>,
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Button: ({ children }: any) => <button>{children}</button>,
  Icon: () => <div />,
}));

describe("WeeklyIntakePage", () => {
  it("renders the page and list of articles", () => {
    render(<WeeklyIntakePage />);
    expect(screen.getByText("Weekly Information Intake")).toBeInTheDocument();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(1);
  });
});
