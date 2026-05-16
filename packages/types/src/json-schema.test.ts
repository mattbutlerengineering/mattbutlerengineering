import { describe, it, expect } from "vitest";
import {
  userPreferencesJsonSchema,
  userJsonSchema,
  tableShapeMetadataJsonSchema,
  tableJsonSchema,
  reservationJsonSchema,
  venueGroupJsonSchema,
  venueJsonSchema,
  guestJsonSchema,
  guestSegmentJsonSchema,
  floorPlanLayoutJsonSchema,
  floorPlanJsonSchema,
  sessionJsonSchema,
  sessionEventJsonSchema,
  createSessionBodyJsonSchema,
  paginationJsonSchema,
  errorJsonSchema,
  problemDetailsJsonSchema,
} from "./schemas/json-schema.js";

describe("JSON Schema generation (toFastifyJsonSchema)", () => {
  describe("structural requirements", () => {
    const allSchemas = [
      { name: "userPreferencesJsonSchema", schema: userPreferencesJsonSchema },
      { name: "userJsonSchema", schema: userJsonSchema },
      { name: "tableShapeMetadataJsonSchema", schema: tableShapeMetadataJsonSchema },
      { name: "tableJsonSchema", schema: tableJsonSchema },
      { name: "reservationJsonSchema", schema: reservationJsonSchema },
      { name: "venueGroupJsonSchema", schema: venueGroupJsonSchema },
      { name: "venueJsonSchema", schema: venueJsonSchema },
      { name: "guestJsonSchema", schema: guestJsonSchema },
      { name: "guestSegmentJsonSchema", schema: guestSegmentJsonSchema },
      { name: "floorPlanLayoutJsonSchema", schema: floorPlanLayoutJsonSchema },
      { name: "floorPlanJsonSchema", schema: floorPlanJsonSchema },
      { name: "sessionJsonSchema", schema: sessionJsonSchema },
      { name: "sessionEventJsonSchema", schema: sessionEventJsonSchema },
      { name: "createSessionBodyJsonSchema", schema: createSessionBodyJsonSchema },
      { name: "paginationJsonSchema", schema: paginationJsonSchema },
      { name: "errorJsonSchema", schema: errorJsonSchema },
      { name: "problemDetailsJsonSchema", schema: problemDetailsJsonSchema },
    ];

    it.each(allSchemas)("$name has a $id", ({ schema }) => {
      expect(schema).toHaveProperty("$id");
      expect(typeof schema.$id).toBe("string");
      expect(schema.$id.length).toBeGreaterThan(0);
    });

    it.each(allSchemas)("$name does not have $schema (stripped for Fastify)", ({ schema }) => {
      expect(schema).not.toHaveProperty("$schema");
    });

    it.each(allSchemas)("$name has type 'object'", ({ schema }) => {
      expect(schema).toHaveProperty("type", "object");
    });
  });

  describe("additionalProperties stripping", () => {
    it("does not contain additionalProperties at any level", () => {
      const checkNoAdditionalProperties = (obj: unknown, path = ""): void => {
        if (obj === null || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach((item, i) => checkNoAdditionalProperties(item, `${path}[${i}]`));
          return;
        }
        const record = obj as Record<string, unknown>;
        expect(record, `Found additionalProperties at ${path}`).not.toHaveProperty(
          "additionalProperties"
        );
        expect(record, `Found propertyNames at ${path}`).not.toHaveProperty("propertyNames");
        for (const [key, value] of Object.entries(record)) {
          checkNoAdditionalProperties(value, `${path}.${key}`);
        }
      };

      checkNoAdditionalProperties(userJsonSchema);
      checkNoAdditionalProperties(reservationJsonSchema);
      checkNoAdditionalProperties(sessionJsonSchema);
      checkNoAdditionalProperties(venueJsonSchema);
    });
  });

  describe("specific schema $id values", () => {
    it("maps schema names to expected $id values", () => {
      expect(userJsonSchema.$id).toBe("User");
      expect(userPreferencesJsonSchema.$id).toBe("UserPreferences");
      expect(tableJsonSchema.$id).toBe("Table");
      expect(reservationJsonSchema.$id).toBe("Reservation");
      expect(venueGroupJsonSchema.$id).toBe("VenueGroup");
      expect(venueJsonSchema.$id).toBe("Venue");
      expect(guestJsonSchema.$id).toBe("Guest");
      expect(guestSegmentJsonSchema.$id).toBe("GuestSegment");
      expect(floorPlanLayoutJsonSchema.$id).toBe("FloorPlanLayout");
      expect(floorPlanJsonSchema.$id).toBe("FloorPlan");
      expect(sessionJsonSchema.$id).toBe("Session");
      expect(sessionEventJsonSchema.$id).toBe("SessionEvent");
      expect(createSessionBodyJsonSchema.$id).toBe("CreateSessionBody");
      expect(paginationJsonSchema.$id).toBe("Pagination");
      expect(errorJsonSchema.$id).toBe("Error");
      expect(problemDetailsJsonSchema.$id).toBe("ProblemDetails");
      expect(tableShapeMetadataJsonSchema.$id).toBe("TableShapeMetadata");
    });
  });

  describe("schema properties", () => {
    it("User schema has expected properties", () => {
      const schema = userJsonSchema as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("id");
      expect(props).toHaveProperty("email");
      expect(props).toHaveProperty("name");
      expect(props).toHaveProperty("emailVerified");
      expect(props).toHaveProperty("preferences");
    });

    it("Reservation schema has expected properties", () => {
      const schema = reservationJsonSchema as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("id");
      expect(props).toHaveProperty("date");
      expect(props).toHaveProperty("startTime");
      expect(props).toHaveProperty("partySize");
      expect(props).toHaveProperty("status");
      expect(props).toHaveProperty("tableId");
    });

    it("Session schema has expected properties", () => {
      const schema = sessionJsonSchema as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("id");
      expect(props).toHaveProperty("status");
      expect(props).toHaveProperty("taskDescription");
      expect(props).toHaveProperty("model");
      expect(props).toHaveProperty("maxTurns");
      expect(props).toHaveProperty("errors");
    });

    it("CreateSessionBody schema has expected properties", () => {
      const schema = createSessionBodyJsonSchema as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("taskDescription");
      expect(props).toHaveProperty("model");
      expect(props).toHaveProperty("maxTurns");
      expect(props).toHaveProperty("maxBudgetUsd");
    });

    it("Pagination schema has all required fields", () => {
      const schema = paginationJsonSchema as Record<string, unknown>;
      const props = schema.properties as Record<string, unknown>;
      expect(props).toHaveProperty("page");
      expect(props).toHaveProperty("limit");
      expect(props).toHaveProperty("total");
      expect(props).toHaveProperty("totalPages");
      expect(props).toHaveProperty("hasNext");
      expect(props).toHaveProperty("hasPrev");
    });
  });
});
