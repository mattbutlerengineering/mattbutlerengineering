import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, Routes, Route, RouterProvider } from "react-router";
import { RequireManager } from "./RequireManager.js";
import { useManagerAccess } from "../hooks/useIsManager.js";

vi.mock("../hooks/useIsManager.js", () => ({ useManagerAccess: vi.fn() }));
vi.mock("../pages/LoadingPage.js", () => ({ LoadingPage: () => <div>Loading Route</div> }));

function renderGuarded(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/setup" element={<div>Setup Hub</div>} />
        <Route
          path="/floor-plans"
          element={
            <RequireManager>
              <div>Floor Plans</div>
            </RequireManager>
          }
        />
        <Route
          path="/floor-plans/:id"
          element={
            <RequireManager>
              <div>Floor Plan Editor</div>
            </RequireManager>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children for a manager", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: true, isPending: false });
    renderGuarded("/floor-plans");
    expect(screen.getByText("Floor Plans")).toBeDefined();
  });

  it("redirects a non-manager from /floor-plans to /setup", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: false, isPending: false });
    renderGuarded("/floor-plans");
    expect(screen.queryByText("Floor Plans")).toBeNull();
    expect(screen.getByText("Setup Hub")).toBeDefined();
  });

  it("redirects a non-manager from /floor-plans/:id to /setup", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: false, isPending: false });
    renderGuarded("/floor-plans/fp1");
    expect(screen.queryByText("Floor Plan Editor")).toBeNull();
    expect(screen.getByText("Setup Hub")).toBeDefined();
  });

  it("redirects a non-manager to redirectTo when one is given, with a replace", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: false, isPending: false });
    const router = createMemoryRouter(
      [
        { path: "/setup", element: <div>Setup Hub</div> },
        { path: "/availability", element: <div>Availability</div> },
        {
          path: "/availability/hours",
          element: (
            <RequireManager redirectTo="/availability">
              <div>Regular hours editor</div>
            </RequireManager>
          ),
        },
      ],
      { initialEntries: ["/setup", "/availability/hours"], initialIndex: 1 }
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText("Availability")).toBeDefined();
    expect(screen.queryByText("Regular hours editor")).toBeNull();
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("renders children for a manager whatever redirectTo says", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: true, isPending: false });
    render(
      <MemoryRouter>
        <RequireManager redirectTo="/availability">
          <div>Regular hours editor</div>
        </RequireManager>
      </MemoryRouter>
    );
    expect(screen.getByText("Regular hours editor")).toBeDefined();
  });

  it("shows the loading page, and neither redirects nor renders children, while the role is unknown", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: false, isPending: true });
    renderGuarded("/floor-plans");
    expect(screen.getByText("Loading Route")).toBeDefined();
    expect(screen.queryByText("Floor Plans")).toBeNull();
    expect(screen.queryByText("Setup Hub")).toBeNull();
  });
});
