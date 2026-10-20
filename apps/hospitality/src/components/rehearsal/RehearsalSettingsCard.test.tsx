import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import type { Table } from "@mbe/types";

const mocks = vi.hoisted(() => ({ tables: vi.fn() }));
vi.mock("../../hooks/useTables", () => ({ useTables: mocks.tables }));
vi.mock("../../contexts/VenueContext", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1" }),
}));

import { RehearsalSettingsCard } from "./RehearsalSettingsCard";

function Probe() {
  const location = useLocation();
  return (
    <>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="state">{JSON.stringify(location.state)}</span>
    </>
  );
}

const table = (isActive = true): Table => ({ id: "t", isActive }) as Table;

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <RehearsalSettingsCard />
      <Probe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.tables.mockReset();
});

describe("RehearsalSettingsCard (SC-9, settings part)", () => {
  it("with tables: explains itself and starts a Friday rehearsal", async () => {
    mocks.tables.mockReturnValue({ data: [table()], isLoading: false, error: null });
    renderCard();
    expect(screen.getByText("Dress Rehearsal")).toBeInTheDocument();
    expect(
      screen.getByText("Watch a simulated Friday night on your own floor plan. Nothing is saved.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Add tables to your floor plan first.")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Run a Friday night" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/rehearsal");
    const state = JSON.parse(screen.getByTestId("state").textContent ?? "{}") as {
      profile: string;
      seed: number;
    };
    expect(state.profile).toBe("friday");
    expect(Number.isInteger(state.seed)).toBe(true);
  });

  it("with no tables: disabled, with the caption and a Floor plans link", () => {
    mocks.tables.mockReturnValue({ data: [], isLoading: false, error: null });
    renderCard();
    expect(screen.getByRole("button", { name: "Run a Friday night" })).toBeDisabled();
    expect(screen.getByText("Add tables to your floor plan first.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Floor plans" })).toHaveAttribute(
      "href",
      "/floor-plans"
    );
  });

  it("ignores inactive tables", () => {
    mocks.tables.mockReturnValue({ data: [table(false)], isLoading: false, error: null });
    renderCard();
    expect(screen.getByRole("button", { name: "Run a Friday night" })).toBeDisabled();
  });

  it("while loading or after a load error: disabled, without claiming the venue has no tables", () => {
    mocks.tables.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { unmount } = renderCard();
    expect(screen.getByRole("button", { name: "Run a Friday night" })).toBeDisabled();
    expect(screen.queryByText("Add tables to your floor plan first.")).toBeNull();
    unmount();

    mocks.tables.mockReturnValue({ data: undefined, isLoading: false, error: new Error("x") });
    renderCard();
    expect(screen.getByRole("button", { name: "Run a Friday night" })).toBeDisabled();
    expect(screen.queryByText("Add tables to your floor plan first.")).toBeNull();
  });
});
