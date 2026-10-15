/**
 * Unit tests for the Pagination component.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

const user = userEvent.setup();

describe("Pagination", () => {
  it("renders navigation with page buttons", () => {
    render(<Pagination page={1} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
  });

  it("renders page buttons for small total", () => {
    render(<Pagination page={1} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /page 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /page 5/i })).toBeInTheDocument();
  });

  it("marks current page with aria-current=page", () => {
    render(<Pagination page={3} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /page 3/i })).toHaveAttribute("aria-current", "page");
  });

  it("does not mark other pages as current", () => {
    render(<Pagination page={3} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /page 1/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /page 5/i })).not.toHaveAttribute("aria-current");
  });

  it("calls onChange when a page button is clicked", async () => {
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /page 4/i }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("calls onChange with page-1 when previous is clicked", async () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /previous page/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("calls onChange with page+1 when next is clicked", async () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("disables previous button on first page", () => {
    render(<Pagination page={1} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(<Pagination page={5} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("both arrows enabled on a middle page", () => {
    render(<Pagination page={3} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /previous page/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).not.toBeDisabled();
  });

  it("renders ellipsis for large page counts", () => {
    render(<Pagination page={5} totalPages={20} onChange={vi.fn()} siblingCount={1} />);
    const ellipses = screen.getAllByText("…");
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it("always shows first and last page in large count", () => {
    render(<Pagination page={10} totalPages={20} onChange={vi.fn()} siblingCount={1} />);
    expect(screen.getByRole("button", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 20" })).toBeInTheDocument();
  });

  it("renders all pages when total is small", () => {
    render(<Pagination page={1} totalPages={3} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /page 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /page 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /page 3/i })).toBeInTheDocument();
  });

  it("renders with totalPages=1 (both arrows disabled)", () => {
    render(<Pagination page={1} totalPages={1} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("does not collapse pages within siblingCount budget", () => {
    // 7 total = siblingCount*2 + 5 = 1*2+5=7, should show all
    render(<Pagination page={4} totalPages={7} onChange={vi.fn()} siblingCount={1} />);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByRole("button", { name: `Page ${i}` })).toBeInTheDocument();
    }
  });

  it("lists the controls and page buttons inside the nav", () => {
    render(<Pagination page={1} totalPages={3} onChange={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: /pagination/i });
    // previous + 3 pages + next
    expect(within(nav).getAllByRole("listitem")).toHaveLength(5);
    expect(within(nav).getByRole("list")).toBeInTheDocument();
  });

  it("hides the ellipsis from the list so AT counts only real controls", () => {
    render(<Pagination page={1} totalPages={20} onChange={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: /pagination/i });
    // previous + pages 1-5 + 20 + next; the ellipsis entry is aria-hidden
    expect(within(nav).getAllByRole("listitem")).toHaveLength(8);
  });

  describe("focus when a control becomes disabled", () => {
    function Controlled({ start, total }: { start: number; total: number }) {
      const [page, setPage] = useState(start);
      return <Pagination page={page} totalPages={total} onChange={setPage} />;
    }

    it("moves focus to the current page when Next reaches the last page", async () => {
      render(<Controlled start={4} total={5} />);
      await user.click(screen.getByRole("button", { name: /next page/i }));
      expect(screen.getByRole("button", { name: /page 5/i })).toHaveFocus();
    });

    it("moves focus to the current page when Previous reaches the first page", async () => {
      render(<Controlled start={2} total={5} />);
      await user.click(screen.getByRole("button", { name: /previous page/i }));
      expect(screen.getByRole("button", { name: /page 1/i })).toHaveFocus();
    });

    it("leaves focus on Next while it is still enabled", async () => {
      render(<Controlled start={2} total={5} />);
      const next = screen.getByRole("button", { name: /next page/i });
      await user.click(next);
      expect(next).toHaveFocus();
    });
  });
});
