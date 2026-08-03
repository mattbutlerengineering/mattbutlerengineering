import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { RequireAdmin } from "./RequireAdmin.js";
import { useIsAdmin } from "../hooks/useIsAdmin.js";

vi.mock("../hooks/useIsAdmin.js", () => ({ useIsAdmin: vi.fn() }));

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/" element={<div>Dashboard Home</div>} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <div>Admin Panel</div>
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the admin page for platform admins", () => {
    vi.mocked(useIsAdmin).mockReturnValue(true);

    renderGuarded();

    expect(screen.getByText("Admin Panel")).toBeDefined();
    expect(screen.queryByText("Dashboard Home")).toBeNull();
  });

  it("redirects non-admins away from the admin page (#3069)", () => {
    vi.mocked(useIsAdmin).mockReturnValue(false);

    renderGuarded();

    // A hand-typed /admin URL must not reach the Users panel.
    expect(screen.queryByText("Admin Panel")).toBeNull();
    expect(screen.getByText("Dashboard Home")).toBeDefined();
  });
});
