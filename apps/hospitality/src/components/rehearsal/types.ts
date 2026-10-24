/** Minimal table shape the rehearsal simulator needs; `Table` from `@mbe/types` satisfies it. */
export interface RehearsalTable {
  id: string;
  capacity: number;
  minCovers: number;
}

export type RehearsalProfile = "friday" | "weeknight" | "brunch";

export type RehearsalTableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY" | "READY";

/** `at` is minutes since midnight on the simulated service day. */
export type RehearsalEvent =
  | {
      at: number;
      type: "booked";
      reservationId: string;
      partySize: number;
      tableId: string;
      arrivesAt: number;
    }
  | { at: number; type: "seated"; reservationId: string; partySize: number; tableId: string }
  | { at: number; type: "status-change"; tableId: string; status: RehearsalTableStatus }
  | { at: number; type: "walk-in-waiting"; reservationId: string; partySize: number }
  | { at: number; type: "no-show"; reservationId: string; tableId: string }
  | { at: number; type: "departed"; reservationId: string; tableId: string };

export interface SimulateServiceInput {
  tables: readonly RehearsalTable[];
  openHour: number;
  closeHour: number;
  profile: RehearsalProfile;
  seed: number;
}
