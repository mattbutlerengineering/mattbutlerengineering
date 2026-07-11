import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OnboardingLayout } from "./OnboardingLayout.js";

// VenueProvider (wrapped by OnboardingLayout) reads venues via useVenues, which
// hits the API client. Stub it so the layout renders deterministically without
// network access; VenueProvider also imports VENUES_QUERY_KEY from this module.
vi.mock("../hooks/useVenues.js", () => ({
  VENUES_QUERY_KEY: "venues",
  useVenues: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

// The rialto dist is not built during unit tests, so mock it to lightweight
// semantic elements — mirrors the pattern used across the hospitality suite.
vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level = 2 }: { children?: ReactNode; level?: number }) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingLayout />}>
            <Route index element={<div>Wizard Slot</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OnboardingLayout", () => {
  it("renders the brand panel with the product name and a tagline", () => {
    renderLayout();

    const brand = screen.getByRole("complementary");
    expect(within(brand).getByRole("heading", { name: "Hospitality" })).toBeInTheDocument();
    // A one-line tagline sits below the product name in the brand panel.
    expect(within(brand).getByText(/restaurant management/i)).toBeInTheDocument();
  });

  it("renders the wizard content through an Outlet slot", () => {
    renderLayout();

    expect(screen.getByText("Wizard Slot")).toBeInTheDocument();
  });

  it("does not render dashboard navigation landmarks (sidebar, header nav, chat)", () => {
    renderLayout();

    // No dashboard shell: no sidebar/header <nav>, no breadcrumb nav, no chat panel.
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByTestId("dashboard-layout")).toBeNull();
    expect(screen.queryByTestId("chat-panel")).toBeNull();
  });
});
