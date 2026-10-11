import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TablePage } from "./TablePage";

describe("TablePage color contrast (axe color-contrast)", () => {
  it("renders positive delta cells in secondary text, not tertiary (4.08:1 on striped recessed rows)", () => {
    render(<TablePage />);
    const cells = screen.getAllByText("+0.004");
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.style.color).toBe("var(--rialto-text-secondary)");
    }
  });
});
