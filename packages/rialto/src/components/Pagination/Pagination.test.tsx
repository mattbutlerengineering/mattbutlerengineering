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

  it("uses a custom ariaLabel on the nav landmark when supplied", () => {
    render(
      <Pagination page={1} totalPages={5} onChange={vi.fn()} ariaLabel="Guest list pagination" />
    );
    expect(screen.getByRole("navigation", { name: /guest list pagination/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /^pagination$/i })).not.toBeInTheDocument();
  });

  it("defaults to aria-label='Pagination' when ariaLabel is not supplied", () => {
    render(<Pagination page={1} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: /^pagination$/i })).toBeInTheDocument();
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

    it("does not steal focus when an ignored Next click is followed by an external page change", async () => {
      function Ignoring() {
        const [page, setPage] = useState(4);
        return (
          <>
            <Pagination page={page} totalPages={5} onChange={() => {}} />
            <button type="button" onClick={() => setPage(5)}>
              External
            </button>
          </>
        );
      }
      render(<Ignoring />);
      await user.click(screen.getByRole("button", { name: /next page/i }));
      const external = screen.getByRole("button", { name: "External" });
      await user.click(external);
      expect(screen.getByRole("button", { name: /page 5/i })).toHaveAttribute(
        "aria-current",
        "page"
      );
      expect(external).toHaveFocus();
    });

    it("leaves focus on Next while it is still enabled", async () => {
      render(<Controlled start={2} total={5} />);
      const next = screen.getByRole("button", { name: /next page/i });
      await user.click(next);
      expect(next).toHaveFocus();
    });
  });
});

/**
 * Visible page buttons and ellipsis markers, in order. Previous/Next are omitted.
 * Ellipsis items are aria-hidden, so this walks the list rather than the a11y tree.
 */
function pageMarks(): string[] {
  const nav = screen.getByRole("navigation", { name: /^pagination$/i });
  const list = within(nav).getByRole("list");
  return [...list.children].flatMap((node) => {
    if (!(node instanceof HTMLElement)) return [];
    const name = within(node).queryByRole("button")?.getAttribute("aria-label") ?? "";
    const pageNumber = /^Page (\d+)$/.exec(name)?.[1];
    if (pageNumber) return [pageNumber];
    if (node.textContent?.includes("…")) return ["…"];
    return [];
  });
}

interface WindowCase {
  label: string;
  page: number;
  totalPages: number;
  siblingCount: number;
  marks: string[];
}

const WINDOW_CASES: WindowCase[] = [
  {
    label: "page 4 of 20 shows page 2 instead of an ellipsis",
    page: 4,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "…", "20"],
  },
  {
    label: "page 17 of 20 shows page 19 instead of an ellipsis",
    page: 17,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "…", "16", "17", "18", "19", "20"],
  },
  {
    label: "page 1 of 20 keeps the leading run",
    page: 1,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "…", "20"],
  },
  {
    label: "page 3 of 20 still has no leading ellipsis",
    page: 3,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "…", "20"],
  },
  {
    label: "page 5 of 20 collapses a real leading gap",
    page: 5,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "…", "4", "5", "6", "…", "20"],
  },
  {
    label: "page 10 of 20 keeps both ellipses in the middle",
    page: 10,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "…", "9", "10", "11", "…", "20"],
  },
  {
    label: "page 16 of 20 collapses a real trailing gap",
    page: 16,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "…", "15", "16", "17", "…", "20"],
  },
  {
    label: "page 20 of 20 keeps the trailing run",
    page: 20,
    totalPages: 20,
    siblingCount: 1,
    marks: ["1", "…", "16", "17", "18", "19", "20"],
  },
  {
    label: "page 4 of 8, just above the show-all budget, shows the single gap",
    page: 4,
    totalPages: 8,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "…", "8"],
  },
  {
    label: "page 5 of 8 shows the symmetric trailing run",
    page: 5,
    totalPages: 8,
    siblingCount: 1,
    marks: ["1", "…", "4", "5", "6", "7", "8"],
  },
  {
    label: "a single page has no ellipsis",
    page: 1,
    totalPages: 1,
    siblingCount: 1,
    marks: ["1"],
  },
  {
    label: "five pages stay fully expanded",
    page: 3,
    totalPages: 5,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5"],
  },
  {
    label: "seven pages, the siblingCount budget, stay fully expanded",
    page: 4,
    totalPages: 7,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "6", "7"],
  },
  {
    label: "page 4 of 15 shows page 2",
    page: 4,
    totalPages: 15,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "…", "15"],
  },
  {
    label: "page 12 of 15 shows page 14",
    page: 12,
    totalPages: 15,
    siblingCount: 1,
    marks: ["1", "…", "11", "12", "13", "14", "15"],
  },
  {
    label: "page 4 of 100 shows page 2",
    page: 4,
    totalPages: 100,
    siblingCount: 1,
    marks: ["1", "2", "3", "4", "5", "…", "100"],
  },
  {
    label: "page 50 of 100 keeps the middle window",
    page: 50,
    totalPages: 100,
    siblingCount: 1,
    marks: ["1", "…", "49", "50", "51", "…", "100"],
  },
  {
    label: "page 97 of 100 shows page 99",
    page: 97,
    totalPages: 100,
    siblingCount: 1,
    marks: ["1", "…", "96", "97", "98", "99", "100"],
  },
  {
    label: "siblingCount 2 on page 5 of 20 shows the single leading gap",
    page: 5,
    totalPages: 20,
    siblingCount: 2,
    marks: ["1", "2", "3", "4", "5", "6", "7", "…", "20"],
  },
  {
    label: "siblingCount 2 on page 6 of 20 collapses a real leading gap",
    page: 6,
    totalPages: 20,
    siblingCount: 2,
    marks: ["1", "…", "4", "5", "6", "7", "8", "…", "20"],
  },
  {
    label: "siblingCount 2 on page 16 of 20 shows the single trailing gap",
    page: 16,
    totalPages: 20,
    siblingCount: 2,
    marks: ["1", "…", "14", "15", "16", "17", "18", "19", "20"],
  },
  {
    label: "siblingCount 2 on page 15 of 20 collapses a real trailing gap",
    page: 15,
    totalPages: 20,
    siblingCount: 2,
    marks: ["1", "…", "13", "14", "15", "16", "17", "…", "20"],
  },
  {
    label: "siblingCount 0 on page 3 of 20 shows page 2",
    page: 3,
    totalPages: 20,
    siblingCount: 0,
    marks: ["1", "2", "3", "…", "20"],
  },
  {
    label: "siblingCount 0 on page 4 of 20 collapses a real leading gap",
    page: 4,
    totalPages: 20,
    siblingCount: 0,
    marks: ["1", "…", "4", "…", "20"],
  },
  {
    label: "siblingCount 0 on page 18 of 20 shows page 19",
    page: 18,
    totalPages: 20,
    siblingCount: 0,
    marks: ["1", "…", "18", "19", "20"],
  },
  {
    label: "siblingCount 0 on page 17 of 20 collapses a real trailing gap",
    page: 17,
    totalPages: 20,
    siblingCount: 0,
    marks: ["1", "…", "17", "…", "20"],
  },
];

describe("Pagination page window", () => {
  it.each(WINDOW_CASES)("$label", ({ page, totalPages, siblingCount, marks }) => {
    render(
      <Pagination
        page={page}
        totalPages={totalPages}
        siblingCount={siblingCount}
        onChange={vi.fn()}
      />
    );
    expect(pageMarks()).toEqual(marks);
    expect(screen.getByRole("button", { name: `Page ${page}` })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("status")).toHaveTextContent(`Page ${page} of ${totalPages}`);
    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    if (page <= 1) expect(previous).toBeDisabled();
    else expect(previous).not.toBeDisabled();
    if (page >= totalPages) expect(next).toBeDisabled();
    else expect(next).not.toBeDisabled();
  });

  it("shows page 2 after Next is clicked from page 1 to page 4", async () => {
    function Controlled() {
      const [page, setPage] = useState(1);
      return <Pagination page={page} totalPages={20} onChange={setPage} />;
    }
    render(<Controlled />);
    const next = screen.getByRole("button", { name: "Next page" });
    await user.click(next);
    await user.click(next);
    await user.click(next);
    expect(pageMarks()).toEqual(["1", "2", "3", "4", "5", "…", "20"]);
    expect(screen.getByRole("button", { name: "Page 4" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("status")).toHaveTextContent("Page 4 of 20");
  });

  it("shows page 19 after Previous is clicked from page 20 to page 17", async () => {
    function Controlled() {
      const [page, setPage] = useState(20);
      return <Pagination page={page} totalPages={20} onChange={setPage} />;
    }
    render(<Controlled />);
    const previous = screen.getByRole("button", { name: "Previous page" });
    await user.click(previous);
    await user.click(previous);
    await user.click(previous);
    expect(pageMarks()).toEqual(["1", "…", "16", "17", "18", "19", "20"]);
    expect(screen.getByRole("button", { name: "Page 17" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("status")).toHaveTextContent("Page 17 of 20");
  });

  it("never lets an ellipsis stand in for a single page", () => {
    const totals = [1, 2, 5, 7, 8, 9, 15, 20, 100];
    const siblingCounts = [0, 1, 2];
    const failures: string[] = [];

    for (const siblingCount of siblingCounts) {
      for (const totalPages of totals) {
        for (const page of pagesToCheck(totalPages)) {
          const { unmount } = render(
            <Pagination
              page={page}
              totalPages={totalPages}
              siblingCount={siblingCount}
              onChange={vi.fn()}
            />
          );
          const marks = pageMarks();
          const problems = windowProblems(marks, page, totalPages);
          if (problems.length > 0) {
            failures.push(
              `sibling ${siblingCount}, page ${page} of ${totalPages} [${marks.join(" ")}]: ${problems.join("; ")}`
            );
          }
          unmount();
          if (failures.length >= 6) break;
        }
        if (failures.length >= 6) break;
      }
      if (failures.length >= 6) break;
    }

    expect(failures).toEqual([]);
  });
});

/** Every page for small totals; both ends and the middle for large ones. */
function pagesToCheck(totalPages: number): number[] {
  if (totalPages <= 20) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set<number>();
  for (let page = 1; page <= 6 && page <= totalPages; page++) pages.add(page);
  pages.add(Math.ceil(totalPages / 2));
  for (let page = Math.max(1, totalPages - 5); page <= totalPages; page++) pages.add(page);
  return [...pages].sort((a, b) => a - b);
}

/** Problems with a rendered window: single-page ellipsis, holes, or a missing current page. */
function windowProblems(marks: string[], page: number, totalPages: number): string[] {
  const problems: string[] = [];
  if (marks[0] !== "1") problems.push("does not start at page 1");
  if (marks[marks.length - 1] !== String(totalPages))
    problems.push("does not end at the last page");
  if (!marks.includes(String(page))) problems.push("hides the current page");

  let previousPage = 0;
  let pendingEllipsis = false;
  for (const mark of marks) {
    if (mark === "…") {
      if (pendingEllipsis) problems.push("has adjacent ellipses");
      if (previousPage === 0) problems.push("starts with an ellipsis");
      pendingEllipsis = true;
      continue;
    }
    const value = Number(mark);
    const hidden = value - previousPage - 1;
    if (pendingEllipsis) {
      if (hidden < 2)
        problems.push(`ellipsis between ${previousPage} and ${value} hides ${hidden}`);
      pendingEllipsis = false;
    } else if (hidden !== 0) {
      problems.push(`gap between ${previousPage} and ${value} has no ellipsis`);
    }
    previousPage = value;
  }
  if (pendingEllipsis) problems.push("ends with an ellipsis");
  return problems;
}
