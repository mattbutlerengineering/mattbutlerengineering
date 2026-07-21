import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

function createMockApiClient() {
  return {
    availability: {
      getTimeSlots: vi.fn(),
    },
    reservations: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
      walkIn: vi.fn(),
    },
    guests: {
      search: vi.fn(),
    },
    tables: {
      list: vi.fn(),
      get: vi.fn(),
      updateStatus: vi.fn(),
    },
  };
}

describe("createAgentTools", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    vi.clearAllMocks();
  });

  const toolCtx = {
    toolCallId: "call-1",
    messages: [],
    abortSignal: undefined as never,
    context: undefined as never,
  };

  describe("check_availability", () => {
    it("calls api.availability.getTimeSlots with correct params", async () => {
      const mockSlots = [
        { time: "18:00", available: true },
        { time: "19:00", available: true },
      ];
      api.availability.getTimeSlots.mockResolvedValue(mockSlots);

      const tools = createAgentTools(log, api as never);
      const checkAvailabilityTool = tools.check_availability;
      if (!checkAvailabilityTool) throw new Error("expected check_availability tool");
      const result = await checkAvailabilityTool.execute!(
        { venueId: "venue-1", date: "2026-05-18", partySize: 4 },
        toolCtx
      );

      expect(api.availability.getTimeSlots).toHaveBeenCalledWith({
        venueId: "venue-1",
        date: "2026-05-18",
        partySize: 4,
      });
      expect(result).toEqual({ slots: mockSlots });
    });

    it("returns error message when API call fails", async () => {
      api.availability.getTimeSlots.mockRejectedValue(new Error("Service unavailable"));

      const tools = createAgentTools(log, api as never);
      const checkAvailabilityTool = tools.check_availability;
      if (!checkAvailabilityTool) throw new Error("expected check_availability tool");
      const result = await checkAvailabilityTool.execute!(
        { venueId: "venue-1", date: "2026-05-18", partySize: 4 },
        toolCtx
      );

      expect(result).toEqual({ error: "Failed to check availability. Please try again." });
      expect(log.error).toHaveBeenCalled();
    });
  });

  describe("lookup_reservation", () => {
    it("calls api.reservations.list with filters", async () => {
      const mockRes = {
        data: [{ id: "r1", guestName: "Smith" }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
      };
      api.reservations.list.mockResolvedValue(mockRes);

      const tools = createAgentTools(log, api as never);
      const lookupReservationTool = tools.lookup_reservation;
      if (!lookupReservationTool) throw new Error("expected lookup_reservation tool");
      const result = await lookupReservationTool.execute!(
        { guestName: "Smith", date: "2026-05-18", venueId: "v1" },
        toolCtx
      );

      expect(api.reservations.list).toHaveBeenCalledWith({
        date: "2026-05-18",
        venueId: "v1",
      });
      expect(result).toEqual({ reservations: mockRes.data });
    });

    it("returns error on failure", async () => {
      api.reservations.list.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const lookupReservationTool = tools.lookup_reservation;
      if (!lookupReservationTool) throw new Error("expected lookup_reservation tool");
      const result = await lookupReservationTool.execute!({ guestName: "Smith" }, toolCtx);

      expect(result).toEqual({ error: "Failed to look up reservations. Please try again." });
    });
  });

  describe("search_guests", () => {
    it("calls api.guests.search with query and venueId", async () => {
      const mockGuests = {
        data: [{ id: "g1", name: "Smith" }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
      };
      api.guests.search.mockResolvedValue(mockGuests);

      const tools = createAgentTools(log, api as never);
      const searchGuestsTool = tools.search_guests;
      if (!searchGuestsTool) throw new Error("expected search_guests tool");
      const result = await searchGuestsTool.execute!({ query: "Smith", venueId: "v1" }, toolCtx);

      expect(api.guests.search).toHaveBeenCalledWith({
        venueId: "v1",
        query: "Smith",
      });
      expect(result).toEqual({ guests: mockGuests.data });
    });

    it("returns error on failure", async () => {
      api.guests.search.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const searchGuestsTool = tools.search_guests;
      if (!searchGuestsTool) throw new Error("expected search_guests tool");
      const result = await searchGuestsTool.execute!({ query: "Smith", venueId: "v1" }, toolCtx);

      expect(result).toEqual({ error: "Failed to search guests. Please try again." });
    });
  });

  describe("get_table_status", () => {
    it("calls api.tables.list for all tables in venue", async () => {
      const mockTables = {
        data: [{ id: "t1", tableNumber: "1", status: "AVAILABLE" }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
      };
      api.tables.list.mockResolvedValue(mockTables);

      const tools = createAgentTools(log, api as never);
      const getTableStatusTool = tools.get_table_status;
      if (!getTableStatusTool) throw new Error("expected get_table_status tool");
      const result = await getTableStatusTool.execute!({ venueId: "v1" }, toolCtx);

      expect(api.tables.list).toHaveBeenCalledWith({ venueId: "v1" });
      expect(result).toEqual({ tables: mockTables.data });
    });

    it("still lists all tables even when tableNumber specified", async () => {
      const mockTables = {
        data: [
          { id: "t1", tableNumber: "1", status: "AVAILABLE" },
          { id: "t5", tableNumber: "5", status: "OCCUPIED" },
        ],
        total: 2,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
      };
      api.tables.list.mockResolvedValue(mockTables);

      const tools = createAgentTools(log, api as never);
      const getTableStatusTool = tools.get_table_status;
      if (!getTableStatusTool) throw new Error("expected get_table_status tool");
      const result = await getTableStatusTool.execute!({ venueId: "v1", tableNumber: 5 }, toolCtx);

      expect(api.tables.list).toHaveBeenCalledWith({ venueId: "v1" });
      expect(result).toEqual({ tables: mockTables.data });
    });

    it("returns error on failure", async () => {
      api.tables.list.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const getTableStatusTool = tools.get_table_status;
      if (!getTableStatusTool) throw new Error("expected get_table_status tool");
      const result = await getTableStatusTool.execute!({ venueId: "v1" }, toolCtx);

      expect(result).toEqual({ error: "Failed to get table status. Please try again." });
    });
  });

  describe("list_today_reservations", () => {
    it("calls api.reservations.list with date and venueId", async () => {
      const mockRes = {
        data: [{ id: "r1", date: "2026-05-18" }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
      };
      api.reservations.list.mockResolvedValue(mockRes);

      const tools = createAgentTools(log, api as never);
      const listTodayReservationsTool = tools.list_today_reservations;
      if (!listTodayReservationsTool) throw new Error("expected list_today_reservations tool");
      const result = await listTodayReservationsTool.execute!(
        { venueId: "v1", date: "2026-05-18" },
        toolCtx
      );

      expect(api.reservations.list).toHaveBeenCalledWith({
        venueId: "v1",
        date: "2026-05-18",
        limit: 50,
      });
      expect(result).toEqual({ reservations: mockRes.data });
    });

    it("filters by status when provided", async () => {
      const mockRes = { data: [], total: 0, page: 1, limit: 50, totalPages: 0, hasMore: false };
      api.reservations.list.mockResolvedValue(mockRes);

      const tools = createAgentTools(log, api as never);
      const listTodayReservationsTool = tools.list_today_reservations;
      if (!listTodayReservationsTool) throw new Error("expected list_today_reservations tool");
      await listTodayReservationsTool.execute!(
        { venueId: "v1", status: "CONFIRMED" as const },
        toolCtx
      );

      expect(api.reservations.list).toHaveBeenCalledWith({
        venueId: "v1",
        date: expect.any(String),
        limit: 50,
        status: "CONFIRMED",
      });
    });

    it("returns error on failure", async () => {
      api.reservations.list.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const listTodayReservationsTool = tools.list_today_reservations;
      if (!listTodayReservationsTool) throw new Error("expected list_today_reservations tool");
      const result = await listTodayReservationsTool.execute!({ venueId: "v1" }, toolCtx);

      expect(result).toEqual({ error: "Failed to list reservations. Please try again." });
    });
  });

  describe("create_reservation", () => {
    it("calls api.reservations.create with correct params", async () => {
      const mockReservation = { id: "r1", guestName: "Smith", status: "CONFIRMED" };
      api.reservations.create.mockResolvedValue(mockReservation);

      const tools = createAgentTools(log, api as never);
      const createReservationTool = tools.create_reservation;
      if (!createReservationTool) throw new Error("expected create_reservation tool");
      const result = await createReservationTool.execute!(
        {
          guestName: "Smith",
          date: "2026-05-18",
          startTime: "19:00",
          endTime: "21:00",
          partySize: 4,
          tableId: "t1",
        },
        toolCtx
      );

      expect(api.reservations.create).toHaveBeenCalledWith({
        guestName: "Smith",
        date: "2026-05-18",
        startTime: "19:00",
        endTime: "21:00",
        partySize: 4,
        tableId: "t1",
      });
      expect(result).toEqual({ reservation: mockReservation });
    });

    it("passes optional notes", async () => {
      api.reservations.create.mockResolvedValue({ id: "r1" });

      const tools = createAgentTools(log, api as never);
      const createReservationTool = tools.create_reservation;
      if (!createReservationTool) throw new Error("expected create_reservation tool");
      await createReservationTool.execute!(
        {
          guestName: "Smith",
          date: "2026-05-18",
          startTime: "19:00",
          endTime: "21:00",
          partySize: 2,
          tableId: "t5",
          notes: "Window seat",
        },
        toolCtx
      );

      expect(api.reservations.create).toHaveBeenCalledWith(
        expect.objectContaining({ tableId: "t5", notes: "Window seat" })
      );
    });

    it("returns error on failure", async () => {
      api.reservations.create.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const createReservationTool = tools.create_reservation;
      if (!createReservationTool) throw new Error("expected create_reservation tool");
      const result = await createReservationTool.execute!(
        {
          guestName: "Smith",
          date: "2026-05-18",
          startTime: "19:00",
          endTime: "21:00",
          partySize: 4,
          tableId: "t1",
        },
        toolCtx
      );

      expect(result).toEqual({ error: "Failed to create reservation. Please try again." });
    });
  });

  describe("modify_reservation", () => {
    it("calls api.reservations.update with id and changed fields", async () => {
      const mockUpdated = { id: "r1", startTime: "20:00", partySize: 6 };
      api.reservations.update.mockResolvedValue(mockUpdated);

      const tools = createAgentTools(log, api as never);
      const modifyReservationTool = tools.modify_reservation;
      if (!modifyReservationTool) throw new Error("expected modify_reservation tool");
      const result = await modifyReservationTool.execute!(
        { reservationId: "r1", startTime: "20:00", partySize: 6 },
        toolCtx
      );

      expect(api.reservations.update).toHaveBeenCalledWith("r1", {
        startTime: "20:00",
        partySize: 6,
      });
      expect(result).toEqual({ reservation: mockUpdated });
    });

    it("returns error on failure", async () => {
      api.reservations.update.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const modifyReservationTool = tools.modify_reservation;
      if (!modifyReservationTool) throw new Error("expected modify_reservation tool");
      const result = await modifyReservationTool.execute!(
        { reservationId: "r1", startTime: "20:00" },
        toolCtx
      );

      expect(result).toEqual({ error: "Failed to modify reservation. Please try again." });
    });
  });

  describe("cancel_reservation", () => {
    it("calls api.reservations.cancel with id", async () => {
      const mockCancelled = { id: "r1", status: "CANCELLED" };
      api.reservations.cancel.mockResolvedValue(mockCancelled);

      const tools = createAgentTools(log, api as never);
      const cancelReservationTool = tools.cancel_reservation;
      if (!cancelReservationTool) throw new Error("expected cancel_reservation tool");
      const result = await cancelReservationTool.execute!({ reservationId: "r1" }, toolCtx);

      expect(api.reservations.cancel).toHaveBeenCalledWith("r1");
      expect(result).toEqual({ reservation: mockCancelled });
    });

    it("returns error on failure", async () => {
      api.reservations.cancel.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const cancelReservationTool = tools.cancel_reservation;
      if (!cancelReservationTool) throw new Error("expected cancel_reservation tool");
      const result = await cancelReservationTool.execute!({ reservationId: "r1" }, toolCtx);

      expect(result).toEqual({ error: "Failed to cancel reservation. Please try again." });
    });
  });

  describe("seat_walk_in", () => {
    it("calls api.reservations.walkIn with correct params", async () => {
      const mockWalkIn = { id: "r1", status: "CONFIRMED" };
      api.reservations.walkIn.mockResolvedValue(mockWalkIn);

      const tools = createAgentTools(log, api as never);
      const seatWalkInTool = tools.seat_walk_in;
      if (!seatWalkInTool) throw new Error("expected seat_walk_in tool");
      const result = await seatWalkInTool.execute!(
        { venueId: "v1", partySize: 3, tableId: "t2", guestName: "Jones" },
        toolCtx
      );

      expect(api.reservations.walkIn).toHaveBeenCalledWith({
        venueId: "v1",
        partySize: 3,
        tableId: "t2",
        guestName: "Jones",
      });
      expect(result).toEqual({ reservation: mockWalkIn });
    });

    it("returns error when no tableId provided", async () => {
      const tools = createAgentTools(log, api as never);
      const seatWalkInTool = tools.seat_walk_in;
      if (!seatWalkInTool) throw new Error("expected seat_walk_in tool");
      const result = await seatWalkInTool.execute!({ venueId: "v1", partySize: 2 }, toolCtx);

      expect(result).toEqual({
        error: "A table must be specified for walk-ins. Check available tables first.",
      });
    });

    it("returns error on API failure", async () => {
      api.reservations.walkIn.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const seatWalkInTool = tools.seat_walk_in;
      if (!seatWalkInTool) throw new Error("expected seat_walk_in tool");
      const result = await seatWalkInTool.execute!(
        { venueId: "v1", partySize: 2, tableId: "t1" },
        toolCtx
      );

      expect(result).toEqual({ error: "Failed to seat walk-in. Please try again." });
    });
  });

  describe("update_table_status", () => {
    it("calls api.tables.updateStatus with table id and status", async () => {
      const mockTable = { id: "t1", tableNumber: "3", status: "DIRTY" };
      api.tables.list.mockResolvedValue({
        data: [{ id: "t1", tableNumber: "3", status: "OCCUPIED" }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
      });
      api.tables.updateStatus.mockResolvedValue(mockTable);

      const tools = createAgentTools(log, api as never);
      const updateTableStatusTool = tools.update_table_status;
      if (!updateTableStatusTool) throw new Error("expected update_table_status tool");
      const result = await updateTableStatusTool.execute!(
        { venueId: "v1", tableNumber: 3, status: "DIRTY" as const },
        toolCtx
      );

      expect(api.tables.list).toHaveBeenCalledWith({ venueId: "v1" });
      expect(api.tables.updateStatus).toHaveBeenCalledWith("t1", "DIRTY");
      expect(result).toEqual({ table: mockTable });
    });

    it("returns error when table not found", async () => {
      api.tables.list.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
        hasMore: false,
      });

      const tools = createAgentTools(log, api as never);
      const updateTableStatusTool = tools.update_table_status;
      if (!updateTableStatusTool) throw new Error("expected update_table_status tool");
      const result = await updateTableStatusTool.execute!(
        { venueId: "v1", tableNumber: 99, status: "AVAILABLE" as const },
        toolCtx
      );

      expect(result).toEqual({ error: "Table 99 not found in this venue." });
    });

    it("returns error on API failure", async () => {
      api.tables.list.mockRejectedValue(new Error("fail"));

      const tools = createAgentTools(log, api as never);
      const updateTableStatusTool = tools.update_table_status;
      if (!updateTableStatusTool) throw new Error("expected update_table_status tool");
      const result = await updateTableStatusTool.execute!(
        { venueId: "v1", tableNumber: 1, status: "READY" as const },
        toolCtx
      );

      expect(result).toEqual({ error: "Failed to update table status. Please try again." });
    });
  });
});
