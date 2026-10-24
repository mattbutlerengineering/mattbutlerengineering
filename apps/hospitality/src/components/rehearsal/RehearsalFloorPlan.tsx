import { useMemo } from "react";
import type { FloorPlan } from "@mbe/types";
import { FloorPlanCanvas } from "../floor-plan";
import { RehearsalPlaybackBanner } from "./RehearsalPlaybackBanner.js";
import { simulateService } from "./simulate-service.js";
import { useRehearsalPlayback } from "./use-rehearsal-playback.js";

const OPEN_HOUR = 17;
const CLOSE_HOUR = 23;
const SEED = 1;
const NOOP = () => {};

/**
 * Read-only floor plan driven by a client-side simulated service: tables cycle
 * occupied → dirty → ready as the clock advances. It takes the plan as a prop and mounts no data
 * or mutation hooks, and the canvas is `readOnly` with every edit handler inert.
 */
export function RehearsalFloorPlan({ floorPlan }: { floorPlan: FloorPlan }) {
  const tables = floorPlan.tables ?? [];
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
  const playback = useRehearsalPlayback(events, { tableIds });

  return (
    <>
      <RehearsalPlaybackBanner playback={playback} />
      <FloorPlanCanvas
        floorPlan={floorPlan}
        tables={tables}
        onTableMove={NOOP}
        onTableSelect={NOOP}
        selectedTableId={null}
        readOnly
        tableStatuses={playback.state.tableStatuses}
        sections={[]}
        walls={floorPlan.layoutJson.walls}
      />
    </>
  );
}
