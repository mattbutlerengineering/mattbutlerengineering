import { useMemo } from "react";
import { todayLine, type TodayLineModel } from "../components/availability/today-line.js";
import { useVenueFloorPlanSections } from "./useFloorPlans.js";
import { useNow } from "./useNow.js";
import { useStaffTonight } from "./useStaffTonight.js";

export interface TodayLineState {
  readonly status: "loading" | "error" | "ready";
  /** `null` until `status` is `ready`. */
  readonly model: TodayLineModel | null;
  readonly retry: () => void;
}

/**
 * What the Today line shows: the service day's hours and what is in force on it. The reads are
 * the staff-tonight ones the Timeline and Briefing already make, so their cached queries are
 * shared and a save on this page refreshes the line.
 */
export function useTodayLine(
  venueId: string | null | undefined,
  bannerShowsOnline: boolean
): TodayLineState {
  const { serviceDate, config, rules, summary, readStatus, refetch } = useStaffTonight(venueId);
  const sections = useVenueFloorPlanSections({ venueId: venueId ?? null });
  const now = useNow();
  const model = useMemo(() => {
    if (!summary || !serviceDate) return null;
    return todayLine({
      serviceDate,
      summary,
      rules,
      now,
      serviceNames: new Map((config?.venueServices ?? []).map((v) => [v.id, v.name])),
      sectionNames: new Map((sections.data ?? []).map((s) => [s.id, s.name])),
      bannerShowsOnline,
    });
  }, [serviceDate, summary, rules, now, config, sections.data, bannerShowsOnline]);
  return {
    status: model ? "ready" : readStatus === "error" ? "error" : "loading",
    model,
    retry: refetch,
  };
}
