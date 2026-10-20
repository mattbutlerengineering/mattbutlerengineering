import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { OnboardingRehearsalAlert } from "./OnboardingRehearsalAlert";

function Probe() {
  const location = useLocation();
  return (
    <>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="state">{JSON.stringify(location.state)}</span>
    </>
  );
}

function renderAlert(options: { fromOnboarding?: boolean; hasTables?: boolean } = {}) {
  const { fromOnboarding = true, hasTables = true } = options;
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: "/floor-plans/fp-1", state: fromOnboarding ? { fromOnboarding: true } : null },
      ]}
    >
      <OnboardingRehearsalAlert venueId="v1" floorPlanId="fp-1" hasTables={hasTables} />
      <Probe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("OnboardingRehearsalAlert (SC-9, onboarding part)", () => {
  it("shows with the onboarding state flag and an unset dismissal", () => {
    renderAlert();
    expect(screen.getByText("Your room is ready.")).toBeInTheDocument();
    expect(
      screen.getByText("Watch a Friday night run on it before your first guest.")
    ).toBeInTheDocument();
  });

  it("does not show without the state flag", () => {
    renderAlert({ fromOnboarding: false });
    expect(screen.queryByText("Your room is ready.")).toBeNull();
  });

  it("does not show for a floor plan with no tables", () => {
    renderAlert({ hasTables: false });
    expect(screen.queryByText("Your room is ready.")).toBeNull();
  });

  it("starts a Friday rehearsal on the current floor plan", async () => {
    renderAlert();
    await userEvent.click(screen.getByRole("button", { name: "Run a Friday night" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/rehearsal");
    const state = JSON.parse(screen.getByTestId("state").textContent ?? "{}") as {
      profile: string;
      seed: number;
      floorPlanId: string;
    };
    expect(state).toMatchObject({ profile: "friday", floorPlanId: "fp-1" });
    expect(Number.isInteger(state.seed)).toBe(true);
  });

  it("dismisses, remembers per venue, and stays hidden on remount", async () => {
    const { unmount } = renderAlert();
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Your room is ready.")).toBeNull();
    expect(localStorage.getItem("rehearsal.onboardingAlert.dismissed.v1")).toBe("1");
    unmount();
    renderAlert();
    expect(screen.queryByText("Your room is ready.")).toBeNull();
  });

  it("still shows when storage throws, and dismissal lasts for the mounted page without an error", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAlert();
    expect(screen.getByText("Your room is ready.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Your room is ready.")).toBeNull();
  });
});
