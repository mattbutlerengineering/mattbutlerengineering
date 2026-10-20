import type { TFunction } from "i18next";
import type { RehearsalState } from "./rehearsal-state";
import type { RehearsalEvent } from "./simulate-service";

type T = TFunction;

export function partyLabel(t: T, size: number): string {
  return t("rehearsal.party", { count: size });
}

/** "Right now" in two whole sentences, each pluralised on its own count. */
export function rightNowSentence(t: T, state: RehearsalState): string {
  let occupied = 0;
  for (const status of state.tableCycle.values()) {
    if (status === "occupied") occupied += 1;
  }
  return [
    t("rehearsal.rightNow.occupied", { count: occupied }),
    t("rehearsal.rightNow.waiting", { count: state.counts.waiting }),
  ].join(" ");
}

/** What a single simulated event means, as one sentence. */
export function describeEvent(
  t: T,
  event: RehearsalEvent,
  tableName: (tableId: string) => string,
  partySize: (partyId: string) => number
): string {
  switch (event.kind) {
    case "booked":
      return t("rehearsal.live.booked", {
        party: partyLabel(t, event.size),
        table: tableName(event.tableId),
      });
    case "seated":
      return t("rehearsal.live.seated", {
        party: partyLabel(t, event.size),
        table: tableName(event.tableId),
      });
    case "walk-in-waiting":
      return t("rehearsal.live.walkInWaiting", { party: partyLabel(t, event.size) });
    case "no-show":
      return t("rehearsal.live.noShow", {
        party: partyLabel(t, partySize(event.partyId)),
        table: tableName(event.tableId),
      });
    case "departed":
      return t("rehearsal.live.departed", {
        party: partyLabel(t, partySize(event.partyId)),
        table: tableName(event.tableId),
      });
    case "status-change": {
      const table = tableName(event.tableId);
      if (event.to === "dirty") return t("rehearsal.live.tableDirty", { table });
      if (event.to === "ready") return t("rehearsal.live.tableReady", { table });
      return t("rehearsal.live.tableAvailable", { table });
    }
  }
}
