import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableStatusBadge } from "./TableStatusBadge.js";

describe("TableStatusBadge", () => {
  it("should render AVAILABLE status", () => {
    render(<TableStatusBadge status="AVAILABLE" />);
    expect(screen.getByText("Available")).toBeDefined();
  });

  it("should render OCCUPIED status", () => {
    render(<TableStatusBadge status="OCCUPIED" />);
    expect(screen.getByText("Occupied")).toBeDefined();
  });

  it("should render DIRTY status", () => {
    render(<TableStatusBadge status="DIRTY" />);
    expect(screen.getByText("Dirty")).toBeDefined();
  });

  it("should render READY status", () => {
    render(<TableStatusBadge status="READY" />);
    expect(screen.getByText("Ready")).toBeDefined();
  });

  it("should render with small size by default", () => {
    const { container } = render(<TableStatusBadge status="AVAILABLE" />);
    expect(container.querySelector("span")).toBeDefined();
  });

  it("should render with small size when specified", () => {
    render(<TableStatusBadge status="AVAILABLE" size="sm" />);
    expect(screen.getByText("Available")).toBeDefined();
  });

  it("should render with medium size when specified", () => {
    render(<TableStatusBadge status="AVAILABLE" size="md" />);
    expect(screen.getByText("Available")).toBeDefined();
  });

  it("should render as button when onClick is provided", () => {
    const onClick = () => {};
    render(<TableStatusBadge status="AVAILABLE" onClick={onClick} />);
    const button = screen.getByRole("button");
    expect(button).toBeDefined();
    expect(screen.getByText("Available")).toBeDefined();
  });

  it("should not render as button when onClick is not provided", () => {
    render(<TableStatusBadge status="AVAILABLE" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});