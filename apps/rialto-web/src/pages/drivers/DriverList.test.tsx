import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { DriverList } from "./DriverList";
import { DriverProvider } from "./DriverProvider";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees). Table renders one row per
// driver via the page's own column render() functions; DropdownMenu renders
// every item as a plain button (skips the open-trigger step, which isn't
// under test here); ConfirmDialog renders its confirm/cancel buttons whenever
// `open` is true. useToast is a spy so the delete flow's toast() call — title,
// variant, and the Undo action — can be asserted directly, the same pattern
// SignIn.test.tsx and routes.test.tsx use.
// ---------------------------------------------------------------------------
const toastSpy = vi.hoisted(() => vi.fn());

vi.mock("@mattbutlerengineering/rialto", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Table = ({
    columns,
    data,
    rowKey,
  }: {
    columns: { key: string; render?: (row: Record<string, unknown>) => ReactNode }[];
    data: Record<string, unknown>[];
    rowKey: (row: Record<string, unknown>) => string;
  }) => (
    <table>
      <tbody>
        {data.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  const DropdownMenu = ({
    items,
  }: {
    items: { id?: string; type?: string; label?: string; onSelect?: () => void }[];
  }) => (
    <div>
      {items
        .filter((item) => item.type !== "divider")
        .map((item) => (
          <button key={item.id} type="button" onClick={item.onSelect}>
            {item.label}
          </button>
        ))}
    </div>
  );
  const ConfirmDialog = ({
    open,
    onConfirm,
    onCancel,
    title,
    description,
    confirmLabel,
  }: {
    open?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    title?: string;
    description?: string;
    confirmLabel?: string;
  }) =>
    open ? (
      <div role="alertdialog">
        <p>{title}</p>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null;
  // restoreDriver appends the restored row to the end of the list rather
  // than reinserting it at its original index, so it can land on a later
  // page — a real Pagination stub (not null) lets the test prove it via
  // the actual UI a user would click through, not just a row count.
  const Pagination = ({
    page,
    totalPages,
    onChange,
  }: {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
  }) => (
    <div>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? "page" : undefined}
          onClick={() => onChange(p)}
        >
          Page {p}
        </button>
      ))}
    </div>
  );

  return {
    Avatar: () => null,
    Badge: Pass,
    Breadcrumb: () => null,
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    ConfirmDialog,
    DataList: () => null,
    Drawer: () => null,
    DropdownMenu,
    EmptyState: () => null,
    HoverCard: Pass,
    Input: () => <input aria-label="Search" />,
    Pagination,
    Select: () => null,
    Stat: () => null,
    Table,
    Text: Pass,
    useToast: () => ({ toast: toastSpy }),
  };
});

function renderDriverList() {
  return render(
    <MemoryRouter>
      <DriverProvider>
        <DriverList />
      </DriverProvider>
    </MemoryRouter>
  );
}

describe("DriverList — delete + undo", () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  it("removes the driver, shows a toast with an Undo action, and restores the row on Undo", async () => {
    const user = userEvent.setup();
    renderDriverList();

    const row = screen.getByText("Charles Leclerc").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove Charles Leclerc?");
    expect(dialog).toHaveTextContent("This action can be undone.");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("Charles Leclerc")).not.toBeInTheDocument();
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const toastArg = toastSpy.mock.calls[0]![0];
    expect(toastArg.title).toContain("Charles Leclerc");
    expect(toastArg.action).toEqual(
      expect.objectContaining({ label: "Undo", onClick: expect.any(Function) })
    );

    act(() => {
      toastArg.action.onClick();
    });

    // The store appends restored rows to the end, so the reappeared driver
    // lands on the last page rather than back on page 1.
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByText("Charles Leclerc")).toBeInTheDocument();
  });
});
