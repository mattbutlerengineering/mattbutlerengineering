/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ReservationDataProvider, useReservationData } from "./ReservationDataContext.js";
import { useReservationEvents } from "../hooks/useReservationEvents.js";
import { useVenue } from "./VenueContext.js";
import React from "react";

vi.mock("../hooks/useReservationEvents.js", () => ({
  useReservationEvents: vi.fn(() => ({
    isConnected: true,
    error: null,
    reconnect: vi.fn(),
  })),
}));

vi.mock("./VenueContext.js", () => ({
  useVenue: vi.fn(() => ({
    selectedVenueId: "venue-1",
    venues: [],
    selectVenue: vi.fn(),
  })),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function TestConsumer() {
  const ctx = useReservationData();
  return (
    <div>
      <span data-testid="connected">{String(ctx.isConnected)}</span>
      <span data-testid="count">{ctx.reservations.length}</span>
      <span data-testid="tables">{ctx.tables.length}</span>
      <button data-testid="add" onClick={() => ctx.addReservation({ id: "r1", status: "CONFIRMED" } as any)}>
        Add
      </button>
      <button data-testid="update" onClick={() => ctx.updateReservation({ id: "r1", status: "COMPLETED" } as any)}>
        Update
      </button>
      <button data-testid="remove" onClick={() => ctx.removeReservation("r1")}>
        Remove
      </button>
      <button data-testid="set" onClick={() => ctx.setReservations([{ id: "r2" } as any])}>
        Set
      </button>
      <button data-testid="setTables" onClick={() => ctx.setTables([{ id: "t1" } as any])}>
        SetTables
      </button>
    </div>
  );
}

describe("ReservationDataContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);
  });

  it("provides initial state with empty reservations", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("connected").textContent).toBe("true");
  });

  it("addReservation adds a new reservation", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    act(() => {
      screen.getByTestId("add").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("addReservation updates existing reservation with same id", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    act(() => {
      screen.getByTestId("add").click();
    });
    act(() => {
      screen.getByTestId("add").click();
    });
    // Should still be 1 because same id
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("updateReservation updates an existing reservation", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    act(() => {
      screen.getByTestId("add").click();
    });
    act(() => {
      screen.getByTestId("update").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("removeReservation removes a reservation by id", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    act(() => {
      screen.getByTestId("add").click();
    });
    act(() => {
      screen.getByTestId("remove").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("setReservations replaces all reservations", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    act(() => {
      screen.getByTestId("add").click();
    });
    act(() => {
      screen.getByTestId("set").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("setTables sets the tables array", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    act(() => {
      screen.getByTestId("setTables").click();
    });
    expect(screen.getByTestId("tables").textContent).toBe("1");
  });

  it("subscribeToEvents allows subscribing to SSE events", () => {
    const handler = vi.fn();

    function SubscribeConsumer() {
      const ctx = useReservationData();
      React.useEffect(() => {
        return ctx.subscribeToEvents(handler);
      }, [ctx]);
      return <div data-testid="sub">subscribed</div>;
    }

    render(
      <ReservationDataProvider>
        <SubscribeConsumer />
      </ReservationDataProvider>
    );
    expect(screen.getByTestId("sub").textContent).toBe("subscribed");
  });

  it("throws error when useReservationData is used outside provider", () => {
    // Suppress error output during this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<TestConsumer />)).toThrow(
      "useReservationData must be used within a ReservationDataProvider"
    );

    consoleSpy.mockRestore();
  });

  it("passes SSE connection state from useReservationEvents", () => {
    vi.mocked(useReservationEvents).mockReturnValue({
      isConnected: false,
      error: new Error("Connection failed"),
      reconnect: vi.fn(),
    });

    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
    expect(screen.getByTestId("connected").textContent).toBe("false");
  });

  it("calls useReservationEvents with venue id and handlers", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );

    expect(useReservationEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: "venue-1",
        enabled: true,
      })
    );
  });

  it("disables SSE when no venue is selected", () => {
    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: null,
      venues: [],
      selectVenue: vi.fn(),
    } as any);

    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );

    expect(useReservationEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: undefined,
        enabled: false,
      })
    );
  });
});
