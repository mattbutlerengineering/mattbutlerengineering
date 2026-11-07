import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { RequireManager } from "./RequireManager.js";
import { useManagerAccess } from "../hooks/useIsManager.js";

vi.mock("../hooks/useIsManager.js", () => ({ useManagerAccess: vi.fn() }));

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

  it("neither redirects nor renders children while the role is unknown", () => {
    vi.mocked(useManagerAccess).mockReturnValue({ isManager: false, isPending: true });
    renderGuarded("/floor-plans");
    expect(screen.queryByText("Floor Plans")).toBeNull();
    expect(screen.queryByText("Setup Hub")).toBeNull();
  });
});
