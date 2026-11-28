import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { FloorPlansRedirect } from "./FloorPlansRedirect.js";

/** `/floor-plans[/:id]` as `main.tsx` mounts it, beside the addresses it now lands on. */
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "timeline", element: <p>Timeline</p> },
      { path: "floor-plans", element: <FloorPlansRedirect /> },
      { path: "floor-plans/:id", element: <FloorPlansRedirect /> },
      { path: "availability/floor-plans", element: <p>Floor plans page</p> },
      { path: "availability/floor-plans/:id", element: <p>Floor plan editor page</p> },
    ],
    { initialEntries: ["/timeline", path], initialIndex: 1 }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("FloorPlansRedirect: the old floor plan addresses", () => {
  it("sends /floor-plans under Availability", () => {
    const router = renderAt("/floor-plans");
    expect(screen.getByText("Floor plans page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/availability/floor-plans");
  });

  it("sends /floor-plans/:id to the same plan under Availability, keeping its query", () => {
    const router = renderAt("/floor-plans/fp-1?tab=tables");
    expect(screen.getByText("Floor plan editor page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/availability/floor-plans/fp-1");
    expect(router.state.location.search).toBe("?tab=tables");
  });

  it("replaces the old address, so Back skips the redirect", () => {
    expect(renderAt("/floor-plans/fp-1").state.historyAction).toBe("REPLACE");
  });
});
