import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("dialog", { name: "Compare edits" })).toBeInTheDocument();
    expect(screen.queryByText("Other page")).not.toBeInTheDocument();
  });

  it("lets a clean guard registered after a dirty one stay out of its way", async () => {
    const router = renderGuards([
      { active: true, title: "Compare edits" },
      { active: false, title: "New schedule" },
    ]);
    await act(() => router.navigate("/other"));
    expect(screen.getByRole("dialog", { name: "Compare edits" })).toBeInTheDocument();
    expect(screen.queryByText("Other page")).not.toBeInTheDocument();
  });

  it("does not stop navigation when nothing is unsaved", async () => {
    const router = renderGuards([{ active: false, title: "Compare edits" }]);
    await act(() => router.navigate("/other"));
    expect(screen.getByText("Other page")).toBeInTheDocument();
  });
});
