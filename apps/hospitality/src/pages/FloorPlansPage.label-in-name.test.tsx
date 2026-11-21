import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FloorPlansPage } from "./FloorPlansPage.js";

// WCAG 2.5.3 Label in Name: the card's open button shows "<name> Active 2 tables Updated <date>",
// so its accessible name must contain those words in order.

const { mockFloorPlansList } = vi.hoisted(() => ({ mockFloorPlansList: vi.fn() }));

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => ({
    floorPlans: { list: mockFloorPlansList, clone: vi.fn(), create: vi.fn(), delete: vi.fn() },
  })),
}));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: vi.fn(() => ({
    selectedVenueId: "v1",
    venues: [{ id: "v1", name: "Test Venue" }],
    selectVenue: vi.fn(),
    setVenueId: vi.fn(),
    isMultiVenue: false,
  })),
}));

const activePlan = {
  id: "fp-1",
  name: "Main Dining",
  tables: [{ id: "t1" }, { id: "t2" }],
  isActive: true,
  updatedAt: "2026-01-15T10:00:00Z",
};
const inactivePlan = {
  id: "fp-2",
  name: "Patio",
  tables: [{ id: "t3" }],
  isActive: false,
  updatedAt: "2026-02-20T14:00:00Z",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FloorPlansPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FloorPlansPage card open button: label in name", () => {
  beforeEach(() => {
    mockFloorPlansList.mockResolvedValue({ data: [activePlan, inactivePlan] });
  });

  // Strict assertions, not axe: in jsdom axe's `label-content-name-mismatch` throws in its
  // icon-ligature probe (no canvas) and reports `incomplete`, so it can never fail here.
  it("keeps the card's words apart and names the button with exactly them, with and without the Active badge", async () => {
    renderPage();
    await screen.findByText("Main Dining");
    const active = screen.getByRole("button", { name: /^Main Dining/ });
    expect(active.textContent).toBe("Main Dining Active 2 tables Updated 01/15/2026");
    expect(active).not.toHaveAttribute("aria-label");
    expect(active).toHaveAccessibleName(/^Main Dining ?Active ?2 tables ?Updated 01\/15\/2026$/);

    const inactive = screen.getByRole("button", { name: /^Patio/ });
    expect(inactive.textContent).toBe("Patio 1 table Updated 02/20/2026");
    expect(inactive).not.toHaveAttribute("aria-label");
    expect(inactive).toHaveAccessibleName(/^Patio ?1 table ?Updated 02\/20\/2026$/);
  });
});
