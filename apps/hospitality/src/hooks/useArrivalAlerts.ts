/**
 * useArrivalAlerts
 *
 * When a guest taps "We're here" (SSE `reservation:guest-signal`, kind
 * `arrived`), show one toast naming the party and play the chime — the chime
 * only when this device has not muted it. Running-late signals do nothing here.
 *
 * The event carries only the reservation id, so name and size come from the
 * reservations query cache, else one `reservations.get`. If neither works the
 * toast still shows, with a generic line, rather than being dropped.
 *
 * Dedupe: the server allows one arrived signal per reservation, so an arrival
 * is announced at most once per reservation id per session; a re-delivered
 * event (reconnect, duplicate) is ignored.
 *
 * Call once inside DashboardLayoutInner, next to useSSESync().
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useToast } from "@mattbutlerengineering/rialto";
import { useTranslation } from "react-i18next";
import type { SseEvent } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";
import { useSSEEventListener } from "./useSSESync.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import {
  isArrivalChimeMuted,
  playArrivalChime,
  subscribeArrivalChimeMuted,
} from "../lib/arrival-chime.js";

const MAX_REMEMBERED = 200;

interface Party {
  readonly name: string | null;
  readonly size: number;
}

function toParty(value: unknown, reservationId: string): Party | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as { id?: unknown; guestName?: unknown; partySize?: unknown };
  if (r.id !== reservationId || typeof r.partySize !== "number") return null;
  return {
    name: typeof r.guestName === "string" && r.guestName !== "" ? r.guestName : null,
    size: r.partySize,
  };
}

function findCachedParty(queryClient: QueryClient, reservationId: string): Party | null {
  for (const [, data] of queryClient.getQueriesData<unknown>({
    queryKey: [RESERVATIONS_QUERY_KEY],
  })) {
    const candidates: unknown[] = Array.isArray(data) ? data : [data];
    for (const candidate of candidates) {
      const party = toParty(candidate, reservationId);
      if (party) return party;
    }
  }
  return null;
}

/** Reactive view of this device's mute setting, for the control that toggles it. */
export function useArrivalChimeMuted(): boolean {
  return useSyncExternalStore(subscribeArrivalChimeMuted, isArrivalChimeMuted, () => false);
}

export function useArrivalAlerts(): void {
  const queryClient = useQueryClient();
  const api = useApiClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const announcedRef = useRef(new Set<string>());

  const latestRef = useRef({ queryClient, api, toast, t });
  useEffect(() => {
    latestRef.current = { queryClient, api, toast, t };
  });

  const onEvent = useCallback((event: SseEvent) => {
    if (event.type !== "reservation:guest-signal" || event.data.kind !== "arrived") return;
    const { reservationId } = event.data;
    if (announcedRef.current.has(reservationId)) return;
    announcedRef.current.add(reservationId);
    if (announcedRef.current.size > MAX_REMEMBERED) {
      const oldest = announcedRef.current.values().next().value;
      if (oldest !== undefined) announcedRef.current.delete(oldest);
    }

    if (!isArrivalChimeMuted()) playArrivalChime();

    void (async () => {
      const { queryClient: qc, api: client } = latestRef.current;
      let party = findCachedParty(qc, reservationId);
      if (!party) {
        try {
          party = toParty(await client.reservations.get(reservationId), reservationId);
        } catch {
          party = null; // already reported by useApiClient's onError
        }
      }
      const { toast: show, t: translate } = latestRef.current;
      show({
        title: translate("arrivalAlerts.title"),
        description: party
          ? translate("arrivalAlerts.description", {
              name: party.name ?? translate("reservations.guestFallback"),
              size: party.size,
            })
          : translate("arrivalAlerts.descriptionUnknown"),
        variant: "accent",
        duration: 8000,
      });
    })();
  }, []);

  useSSEEventListener(onEvent);
}
