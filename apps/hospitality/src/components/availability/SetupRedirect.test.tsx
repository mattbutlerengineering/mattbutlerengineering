import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SetupRedirect } from "./SetupRedirect.js";

/** `/setup` as `main.tsx` mounts it, beside the page it now lands on. */
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "timeline", element: <p>Timeline</p> },
      { path: "setup", element: <SetupRedirect /> },
      { path: "availability/map", element: <p>Availability map page</p> },
    ],
    { initialEntries: ["/timeline", path], initialIndex: 1 }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("SetupRedirect: the old Venue Setup address", () => {
  it("sends /setup to the Availability map", () => {
    const router = renderAt("/setup");
    expect(screen.getByText("Availability map page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/availability/map");
  });

  it("replaces /setup, so Back skips the redirect", () => {
    const router = renderAt("/setup");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
