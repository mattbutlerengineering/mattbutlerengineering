import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OnboardingLayout } from "./OnboardingLayout.js";
import { useOnboardingWizardContext } from "../components/venue-onboarding/OnboardingWizardContext.js";
import { INITIAL_LAUNCH_PROGRESS } from "../components/venue-onboarding/launch-sequence.js";

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

/**
 * Drives the wizard two steps forward (basicInfo -> next -> locationTime ->
 * next), landing on step 3 with highestStepReached === 3 — so steps 1 and 2
 * are "reached" and would normally render as clickable rail buttons — then
 * puts a launch stage in flight.
 */
function DriveIntoInFlightLaunch() {
  const { actions } = useOnboardingWizardContext();
  useEffect(() => {
    actions.setStepData("basicInfo", { name: "My Venue", slug: "my-venue", venueGroupId: "" });
    actions.next();
    actions.setStepData("locationTime", {
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
    });
    actions.next();
    actions.setLaunchProgress({ ...INITIAL_LAUNCH_PROGRESS, inFlightStage: "venue" });
    // Runs once on mount to seed a deterministic in-flight state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div>Wizard Slot</div>;
}

function renderLayoutWithInFlightLaunch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingLayout />}>
            <Route index element={<DriveIntoInFlightLaunch />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

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

    // No dashboard shell: no sidebar/header nav, no breadcrumb nav, no chat panel.
    // The onboarding progress rail is the only nav landmark on this screen.
    const navs = screen.getAllByRole("navigation");
    expect(navs).toHaveLength(1);
    expect(navs[0]).toHaveAccessibleName(/progress/i);
    expect(screen.queryByTestId("dashboard-layout")).toBeNull();
    expect(screen.queryByTestId("chat-panel")).toBeNull();
  });

  it("renders the vertical progress rail with all 5 steps in the brand panel", () => {
    renderLayout();

    const brand = screen.getByRole("complementary");
    const rail = within(brand).getByRole("navigation", { name: /progress/i });
    // Each step shows a label and a one-line description.
    expect(within(rail).getByText("Welcome")).toBeInTheDocument();
    expect(within(rail).getByText("Name your venue")).toBeInTheDocument();
    expect(within(rail).getByText("Launch")).toBeInTheDocument();
    expect(within(rail).getByText("Review & go live")).toBeInTheDocument();
  });

  // #4824 Finding 1: isSubmitting was a permanently-false dead flag — the
  // desktop rail's onStepClick guard never actually blocked navigation while
  // a launch stage was in flight. launch.inFlightStage is the real signal.
  it("#4824 Finding 1: while the launch sequence is in flight, the desktop step rail rejects navigation to a reached step", () => {
    renderLayoutWithInFlightLaunch();

    const brand = screen.getByRole("complementary");
    const rail = within(brand).getByRole("navigation", { name: /progress/i });

    // Steps 1 and 2 are reached (highestStepReached === 3, current === 3) and
    // would normally render as clickable buttons — none should while a stage
    // is in flight.
    expect(within(rail).queryByRole("button")).toBeNull();
  });
});
