import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { TableSchema, type Table } from "@mbe/types";

vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

import { tableService } from "../services/table.js";

const mockTable: Table = {
  id: "table-123",
  name: "Table 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 1,
  maxCovers: null,
  location: "Main Floor",
  isActive: true,
  priority: 0,
  status: "AVAILABLE" as const,
  venueId: "venue-123",
  floorPlanId: "floor-123",
  shapeMetadata: {
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    shape: "rectangle" as const,
  },
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

describe("Reservation Service API Contract", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("GET /api/v1/tables/:id returns table and matches TableSchema", async () => {
    vi.mocked(tableService.getById).mockResolvedValueOnce(mockTable);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tables/table-123",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const result = TableSchema.safeParse(body.data);
    expect(result.success).toBe(true);
  });

  it("GET /api/v1/tables/:id returns 404 when table not found", async () => {
    vi.mocked(tableService.getById).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tables/non-existent",
    });

    expect(response.statusCode).toBe(404);
  });
});
