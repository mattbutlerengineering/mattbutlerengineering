import { tableMachine } from "../../services/table-state-machine.js";
import type {
  Night,
  NightEvent,
  NightReservation,
  NightState,
  Proposer,
  ReplayFrame,
} from "./types.js";

function mapReservation(
  state: NightState,
  id: string,
  change: (r: NightReservation) => NightReservation
): NightState {
  if (!state.reservations.some((r) => r.id === id)) {
    throw new Error(`replay: unknown reservation '${id}'`);
  }
  return {
    ...state,
    reservations: state.reservations.map((r) => (r.id === id ? change(r) : r)),
  };
}

/** Pure: returns the next snapshot. Table status changes obey the real table state machine. */
function applyEvent(state: NightState, event: NightEvent): NightState {
  switch (event.type) {
    case "reservation_arrived":
      return mapReservation(state, event.reservationId, (r) => ({ ...r, phase: "arrived" }));
    case "reservation_seated":
      return mapReservation(state, event.reservationId, (r) => ({
        ...r,
        phase: "seated",
        tableId: event.tableId,
      }));
    case "reservation_completed":
      return mapReservation(state, event.reservationId, (r) => ({ ...r, phase: "done" }));
    case "waitlist_joined":
      return { ...state, waitlist: [...state.waitlist, event.entry] };
    case "table_status": {
      const table = state.tables.find((t) => t.id === event.tableId);
      if (!table) throw new Error(`replay: unknown table '${event.tableId}'`);
      tableMachine.transition(table.status, event.status);
      return {
        ...state,
        tables: state.tables.map((t) =>
          t.id === event.tableId ? { ...t, status: event.status } : t
        ),
      };
    }
  }
}

/** Replays a night in time order, asking the proposer after every event. No I/O. */
export function replayNight(night: Night, proposer: Proposer): ReplayFrame[] {
  let state = night.initial;
  let lastAt = -Infinity;
  const frames: ReplayFrame[] = [];
  for (const event of night.events) {
    if (event.at < lastAt)
      throw new Error(`replay: night '${night.id}' events out of order at ${event.at}`);
    lastAt = event.at;
    state = applyEvent(state, event);
    const suggestions = proposer.propose({ nightId: night.id, at: event.at, event, state });
    frames.push({ at: event.at, event, state, suggestions });
  }
  return frames;
}
