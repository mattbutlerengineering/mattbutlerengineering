import type { DomainContext } from "@mbe/rialto";

/**
 * Hardcoded domain context for the hospitality app's Gen Copilot.
 * Describes the app's core data schemas so the AI model can generate
 * appropriate UI components referencing real field names.
 */
export const HOSPITALITY_DOMAIN_CONTEXT: DomainContext = {
  schemas: [
    {
      name: "Reservation",
      description: "A dining reservation linked to a table and guest.",
      fields:
        "id, guestName, tableId, partySize, date, time, status (pending|confirmed|cancelled|seated|completed), notes",
    },
    {
      name: "FloorPlan",
      description: "A restaurant floor layout with named zones and table positions.",
      fields:
        "id, name, tables (id, label, x, y, width, height, capacity, shape, zoneId), zones (id, name, color)",
    },
    {
      name: "Guest",
      description: "A guest profile with visit history and preferences.",
      fields: "id, name, email, phone, visitCount, lastVisit, preferences, notes",
    },
  ],
};
