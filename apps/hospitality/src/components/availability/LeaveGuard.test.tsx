import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { LeaveGuard } from "./LeaveGuard.js";

/** Several guards at once: a router consults only the last one registered, so a clean one must not mount. */
function renderGuards(guards: readonly { readonly active: boolean; readonly title: string }[]) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <main>
          {guards.map((g) => (
            <LeaveGuard key={g.title} active={g.active} date={null} title={g.title} />
          ))}
        </main>
      ),
    },
    { path: "/other", element: <p>Other page</p> },
  ]);
  render(<RouterProvider router={router} />);
  return router;
}

describe("LeaveGuard", () => {
  it("asks before leaving while a draft is unsaved", async () => {
    const router = renderGuards([{ active: true, title: "Compare edits" }]);
    await act(() => router.navigate("/other"));
    expect(screen.getByRole("alertdialog", { name: "Compare edits" })).toBeInTheDocument();
    expect(screen.queryByText("Other page")).not.toBeInTheDocument();
  });

  it("lets a clean guard registered after a dirty one stay out of its way", async () => {
    const router = renderGuards([
      { active: true, title: "Compare edits" },
      { active: false, title: "New schedule" },
    ]);
    await act(() => router.navigate("/other"));
    expect(screen.getByRole("alertdialog", { name: "Compare edits" })).toBeInTheDocument();
    expect(screen.queryByText("Other page")).not.toBeInTheDocument();
  });

  it("says every unsaved change on the page is lost, not just the drawer's hours", async () => {
    const router = renderGuards([
      { active: true, title: "Compare edits" },
      { active: true, title: "New schedule" },
    ]);
    await act(() => router.navigate("/other"));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("All unsaved changes on this page will be lost.");
    expect(dialog).not.toHaveTextContent("these hours");
  });

  describe("with a way to save", () => {
    function renderSaving(onSave: () => Promise<boolean>) {
      const router = createMemoryRouter([
        {
          path: "/",
          element: (
            <main>
              <LeaveGuard active date={null} title="Regular week" onSave={onSave} />
            </main>
          ),
        },
        { path: "/other", element: <p>Other page</p> },
      ]);
      render(<RouterProvider router={router} />);
      return router;
    }

    it("offers Save, and leaves once it has saved", async () => {
      const onSave = vi.fn(() => Promise.resolve(true));
      const router = renderSaving(onSave);
      await act(() => router.navigate("/other"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.getByText("Other page")).toBeInTheDocument());
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("stays on the page, with the draft, when the save did not go through", async () => {
      const router = renderSaving(() => Promise.resolve(false));
      await act(() => router.navigate("/other"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.queryByText("Other page")).not.toBeInTheDocument();
    });
  });

  it("offers no Save when the guard cannot save", async () => {
    const router = renderGuards([{ active: true, title: "Compare edits" }]);
    await act(() => router.navigate("/other"));
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("does not stop navigation when nothing is unsaved", async () => {
    const router = renderGuards([{ active: false, title: "Compare edits" }]);
    await act(() => router.navigate("/other"));
    expect(screen.getByText("Other page")).toBeInTheDocument();
  });
});
