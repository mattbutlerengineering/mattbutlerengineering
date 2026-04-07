import { describe, it, expect } from "vitest";
import { z } from "zod";

// Zod schemas from @mbe/types (the api-client's source of truth)
import {
  UserSchema,
  UserPreferencesSchema,
} from "@mbe/types/schemas";
import {
  ReservationSchema as ZodReservationSchema,
  TableSchema as ZodTableSchema,
} from "@mbe/types/schemas";

// JSON Schemas from services (the server's source of truth)
import {
  UserSchema as ServiceUserSchema,
  UserPreferencesSchema as ServiceUserPreferencesSchema,
} from "../../../services/users/src/schemas/index.js";
import {
  ReservationSchema as ServiceReservationSchema,
  TableSchema as ServiceTableSchema,
} from "../../../services/reservations/src/schemas/index.js";

/**
 * Extract property names from a Zod object schema.
 */
function zodKeys(schema: z.ZodObject<z.ZodRawShape>): Set<string> {
  return new Set(Object.keys(schema.shape));
}

/**
 * Extract property names from a JSON Schema object.
 */
function jsonSchemaKeys(schema: { properties?: Record<string, unknown> }): Set<string> {
  return new Set(Object.keys(schema.properties ?? {}));
}

/**
 * Assert that two sets of property names match.
 * Reports which properties are missing from each side.
 */
function assertKeysMatch(
  schemaName: string,
  zodSchema: Set<string>,
  jsonSchema: Set<string>
) {
  const missingFromJson = [...zodSchema].filter((k) => !jsonSchema.has(k));
  const missingFromZod = [...jsonSchema].filter((k) => !zodSchema.has(k));

  const errors: string[] = [];
  if (missingFromJson.length > 0) {
    errors.push(
      `Properties in @mbe/types but missing from service JSON Schema: ${missingFromJson.join(", ")}`
    );
  }
  if (missingFromZod.length > 0) {
    errors.push(
      `Properties in service JSON Schema but missing from @mbe/types: ${missingFromZod.join(", ")}`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `${schemaName} contract drift detected:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
}

describe("API Client ↔ Service Schema Contracts", () => {
  describe("Users service", () => {
    it("User schema properties match between @mbe/types and users service", () => {
      assertKeysMatch(
        "User",
        zodKeys(UserSchema),
        jsonSchemaKeys(ServiceUserSchema)
      );
    });

    it("UserPreferences schema properties match", () => {
      assertKeysMatch(
        "UserPreferences",
        zodKeys(UserPreferencesSchema),
        jsonSchemaKeys(ServiceUserPreferencesSchema)
      );
    });
  });

  describe("Reservations service", () => {
    it("Reservation schema properties match between @mbe/types and reservations service", () => {
      assertKeysMatch(
        "Reservation",
        zodKeys(ZodReservationSchema),
        jsonSchemaKeys(ServiceReservationSchema)
      );
    });

    it("Table schema properties match between @mbe/types and reservations service", () => {
      assertKeysMatch(
        "Table",
        zodKeys(ZodTableSchema),
        jsonSchemaKeys(ServiceTableSchema)
      );
    });
  });
});
