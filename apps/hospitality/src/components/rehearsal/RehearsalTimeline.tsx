import { useMemo } from "react";
import type { Reservation, Table } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { formatLocalTime } from "../../utils/format.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import { TimelineGrid } from "../timeline";
import { RehearsalBanner } from "./RehearsalBanner.js";
import { simulateService } from "./simulate-service.js";
import { useRehearsalPlayback } from "./use-rehearsal-playback.js";

const OPEN_HOUR = 17;
const CLOSE_HOUR = 23;
const SEED = 1;

export interface RehearsalTimelineProps {
  tables: Table[];
  /** The service day (YYYY-MM-DD) the simulation is stamped with. */
  date: string;
}

/**
 * `rehearsalStateAt` stamps wall-clock times as UTC instants; the grid reads instants in the
 * venue's zone. Shift each by the zone's offset so 19:30 in the simulation is 19:30 on the grid.
 */
function toVenueWallClock(reservation: Reservation, timeZone: string | undefined): Reservation {
  const shift = (iso: string) => {
    const at = new Date(iso);
    const utc = at.getUTCHours() * 60 + at.getUTCMinutes();
    let delta = utc - minutesOfDayIn(at, timeZone);
    if (delta > 720) delta -= 1440;
    if (delta < -720) delta += 1440;
    return new Date(at.getTime() + delta * 60_000).toISOString();
  };
  return {
    ...reservation,
    startTime: shift(reservation.startTime),
    endTime: shift(reservation.endTime),
  };
}

/**
 * Read-only timeline driven by a client-side simulated service. It takes tables as props and
 * mounts no data or mutation hooks, so nothing it renders can reach the API; the grid is handed
 * no click or status handlers.
 */
export function RehearsalTimeline({ tables, date }: RehearsalTimelineProps) {
  const fmt = useVenueFormat();
  const tableIds = useMemo(() => tables.map((table) => table.id), [tables]);
  const events = useMemo(
    () =>
      simulateService({
        tables,
        openHour: OPEN_HOUR,
        closeHour: CLOSE_HOUR,
        profile: "friday",
        seed: SEED,
      }),
    [tables]
  );
  const playback = useRehearsalPlayback(events, { date, tableIds });
  const reservations = useMemo(
    () => playback.state.reservations.map((r) => toVenueWallClock(r, fmt.timeZone)),
    [playback.state.reservations, fmt.timeZone]
  );

  const minute = Math.floor(playback.time);
  const clock = formatLocalTime(
    `${Math.floor(minute / 60) % 24}:${String(minute % 60).padStart(2, "0")}`,
    fmt.locale
  );

  return (
    <>
      <RehearsalBanner
        clock={clock}
        playing={playback.playing}
        speed={playback.speed}
        reducedMotion={playback.reducedMotion}
        onPlay={playback.play}
        onPause={playback.pause}
        onStep={playback.step}
        onSpeedChange={playback.setSpeed}
      />
      <TimelineGrid
        tables={tables}
        reservations={reservations}
        date={date}
        seatedIds={playback.state.seatedIds}
        emptyNight={null}
      />
    </>
  );
}
