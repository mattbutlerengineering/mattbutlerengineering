import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { DriverRead } from "./DriverRead";
import { DriverList } from "./DriverList";
import { DriverProvider } from "./DriverProvider";
import { DEMO_ROUTES } from "../../data/demo-routes";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto (house pattern — the real
// package resolves to an unbuilt dist in worktrees). Card/Tooltip pass their
// children through; ConfirmDialog renders its confirm/cancel buttons whenever
// `open` is true; useToast is a spy so the delete flow's toast() call — title,
// variant, and the Undo action — can be asserted directly, matching the
// pattern in SignIn.test.tsx and DriverList.test.tsx. The rest render null —
// their content isn't under test here.
// ---------------------------------------------------------------------------
const toastSpy = vi.hoisted(() => vi.fn());

vi.mock("@mattbutlerengineering/rialto", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
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

  return {
    Avatar: () => null,
    Badge: Pass,
    Breadcrumb: () => null,
    Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    Card: Pass,
    ConfirmDialog,
    DataList: () => null,
    Drawer: () => null,
    DropdownMenu: ({
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
    ),
    EmptyState: () => null,
    HoverCard: Pass,
    Input: () => <input aria-label="Search" />,
    Meter: () => null,
    // restoreDriver appends the restored row to the end of the list rather
    // than reinserting it at its original index, so it can land on a later
    // page once the flow navigates back to DriverList — a real Pagination
    // stub (not null) lets the test prove the restore via the actual UI a
    // user would click through, not just a row count.
    Pagination: ({
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
    ),
    Select: () => null,
    Stat: () => null,
    Table: ({
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
    ),
    Text: Pass,
    Timeline: () => null,
    Tooltip: Pass,
    useToast: () => ({ toast: toastSpy }),
  };
});

function renderDriverRead(id: string) {
  return render(
    <MemoryRouter initialEntries={[DEMO_ROUTES.driver(id)]}>
      <DriverProvider>
        <Routes>
          <Route path={DEMO_ROUTES.drivers} element={<DriverList />} />
          <Route path={DEMO_ROUTES.driver(":id")} element={<DriverRead />} />
        </Routes>
      </DriverProvider>
    </MemoryRouter>
  );
}

describe("DriverRead — delete + undo", () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  it("deletes the driver, navigates to the list, and Undo restores it", async () => {
    const user = userEvent.setup();
    renderDriverRead("1");

    expect(screen.getByRole("heading", { level: 2, name: "Charles Leclerc" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove Charles Leclerc?");
    expect(dialog).toHaveTextContent("This action can be undone.");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    // Delete navigates back to the list — Charles Leclerc is gone.
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
    // lands on the last page of the list rather than back on page 1.
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByText("Charles Leclerc")).toBeInTheDocument();
  });
});
