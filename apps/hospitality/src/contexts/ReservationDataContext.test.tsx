/* eslint-disable @typescript-eslint/no-explicit-any */
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

const mockToastFn = vi.fn();
vi.mock("@mattbutlerengineering/rialto", () => ({
  useToast: () => ({ toast: mockToastFn }),
}));

function TestConsumer() {
  const ctx = useReservationData();
  return (
    <div>
      <span data-testid="connected">{String(ctx.isConnected)}</span>
      <span data-testid="count">{ctx.reservations.length}</span>
      <span data-testid="tables">{ctx.tables.length}</span>
      <button
        data-testid="add"
        onClick={() => ctx.addReservation({ id: "r1", status: "CONFIRMED" } as any)}
      >
        Add
      </button>
      <button
        data-testid="update"
        onClick={() => ctx.updateReservation({ id: "r1", status: "COMPLETED" } as any)}
      >
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

/* ── SSE event handler + toast rate limiting tests ───────────, @eslint-react/no-array-index-key */

describe("ReservationDataContext SSE handlers", () => {
  let capturedHandlers: Record<string, (...args: any[]) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers = {};

    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);

    // Capture the SSE handlers passed to useReservationEvents
    vi.mocked(useReservationEvents).mockImplementation((opts: any) => {
      capturedHandlers.onReservationCreated = opts.onReservationCreated;
      capturedHandlers.onReservationUpdated = opts.onReservationUpdated;
      capturedHandlers.onReservationCancelled = opts.onReservationCancelled;
      capturedHandlers.onHoldCreated = opts.onHoldCreated;
      capturedHandlers.onHoldReleased = opts.onHoldReleased;
      capturedHandlers.onHoldConfirmed = opts.onHoldConfirmed;
      capturedHandlers.onTableUpdated = opts.onTableUpdated;
      return { isConnected: true, error: null, reconnect: vi.fn() };
    });
  });

  function renderWithConsumer() {
    return render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );
  }

  it("handleCancelled triggers toast with error variant", () => {
    renderWithConsumer();

    const reservation = {
      id: "r-cancel",
      guestName: "Jane Doe",
      startTime: "2026-05-14T19:00:00Z",
      status: "CANCELLED",
    } as any;

    act(() => {
      capturedHandlers.onReservationCancelled(reservation);
    });

    expect(mockToastFn).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reservation cancelled",
        variant: "error",
      })
    );
  });

  it("handleTableUpdated updates table state correctly", () => {
    renderWithConsumer();

    // First set initial tables
    act(() => {
      screen.getByTestId("setTables").click();
    });
    expect(screen.getByTestId("tables").textContent).toBe("1");

    // Now update the table via SSE handler
    const updatedTable = { id: "t1", name: "Updated Table", status: "OCCUPIED" } as any;
    act(() => {
      capturedHandlers.onTableUpdated(updatedTable);
    });

    // Count should remain 1 (updated, not added)
    expect(screen.getByTestId("tables").textContent).toBe("1");
  });

  it("handleHoldConfirmed adds reservation via addReservation", () => {
    renderWithConsumer();

    const reservation = {
      id: "r-confirmed",
      guestName: "Hold Guest",
      startTime: "2026-05-14T20:00:00Z",
      status: "CONFIRMED",
    } as any;

    act(() => {
      capturedHandlers.onHoldConfirmed(reservation);
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("notifySubscribers broadcasts to multiple registered subscribers", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    function MultiSubscriber() {
      const ctx = useReservationData();
      React.useEffect(() => {
        const unsub1 = ctx.subscribeToEvents(handler1);
        const unsub2 = ctx.subscribeToEvents(handler2);
        return () => {
          unsub1();
          unsub2();
        };
      }, [ctx]);
      return <div data-testid="multi">ok</div>;
    }

    render(
      <ReservationDataProvider>
        <MultiSubscriber />
      </ReservationDataProvider>
    );

    // Trigger an event that calls notifySubscribers
    const reservation = {
      id: "r-notify",
      guestName: "Notify Guest",
      startTime: "2026-05-14T18:00:00Z",
      status: "CONFIRMED",
    } as any;

    act(() => {
      capturedHandlers.onReservationUpdated(reservation);
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reservation:updated",
        venueId: "venue-1",
      })
    );
  });

  it("hold events notify subscribers with correct type", () => {
    const handler = vi.fn();

    function HoldSubscriber() {
      const ctx = useReservationData();
      React.useEffect(() => {
        return ctx.subscribeToEvents(handler);
      }, [ctx]);
      return <div>hold-sub</div>;
    }

    render(
      <ReservationDataProvider>
        <HoldSubscriber />
      </ReservationDataProvider>
    );

    const hold = { id: "hold-1", tableId: "t1", venueId: "venue-1" } as any;

    act(() => {
      capturedHandlers.onHoldCreated(hold);
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hold:created", data: hold })
    );

    handler.mockClear();

    act(() => {
      capturedHandlers.onHoldReleased(hold);
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hold:released", data: hold })
    );
  });
});

describe("ReservationDataContext toast rate limiting", () => {
  let capturedHandlers: Record<string, (...args: any[]) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedHandlers = {};

    vi.mocked(useVenue).mockReturnValue({
      selectedVenueId: "venue-1",
      venues: [],
      selectVenue: vi.fn(),
    } as any);

    vi.mocked(useReservationEvents).mockImplementation((opts: any) => {
      capturedHandlers.onReservationCreated = opts.onReservationCreated;
      return { isConnected: true, error: null, reconnect: vi.fn() };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("limits toasts to 3 within the rate limit window", () => {
    render(
      <ReservationDataProvider>
        <TestConsumer />
      </ReservationDataProvider>
    );

    // Fire 5 rapid reservation:created events
    for (let i = 0; i < 5; i++) {
      act(() => {
        capturedHandlers.onReservationCreated({
          id: `r-${i}`,
          guestName: `Guest ${i}`,
          startTime: "2026-05-14T18:00:00Z",
          status: "CONFIRMED",
        } as any);
      });
    }

    // Toast should be called at most 3 times (TOAST_MAX)
    expect(mockToastFn.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
